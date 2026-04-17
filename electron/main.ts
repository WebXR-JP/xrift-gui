import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

type StreamName = 'stdout' | 'stderr' | 'system'

type CommandResult = {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const devServerUrl = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null
let localDevProcess: ChildProcessWithoutNullStreams | null = null
let localDevCommandId = ''
let commandEnvPromise: Promise<NodeJS.ProcessEnv> | null = null

const buildPath = (...paths: string[]): string => {
  const separator = path.delimiter
  const seen = new Set<string>()
  const merged: string[] = []
  for (const value of paths) {
    for (const segment of value.split(separator)) {
      const trimmed = segment.trim()
      if (!trimmed || seen.has(trimmed)) {
        continue
      }
      seen.add(trimmed)
      merged.push(trimmed)
    }
  }
  return merged.join(separator)
}

const readLoginShellPath = async (env: NodeJS.ProcessEnv): Promise<string> => {
  if (process.platform === 'win32') {
    return ''
  }
  const shellPath = env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  return new Promise((resolve) => {
    let stdout = ''
    const child = spawn(shellPath, ['-ilc', 'printf %s "$PATH"'], {
      env,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('error', () => resolve(''))
    child.on('close', (code) => resolve(code === 0 ? stdout.trim() : ''))
  })
}

const getCommandEnv = async (): Promise<NodeJS.ProcessEnv> => {
  if (commandEnvPromise) {
    return commandEnvPromise
  }
  commandEnvPromise = (async () => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    const fallbackPath =
      process.platform === 'win32'
        ? ''
        : '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    const loginPath = await readLoginShellPath(env)
    env.PATH = buildPath(loginPath, env.PATH || '', fallbackPath)
    return env
  })()
  return commandEnvPromise
}

const stripAnsiEscapeSequences = (input: string): string => {
  return input
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><])/g, '')
}

const emitLog = (commandId: string, stream: StreamName, message: string) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('xrift:command-log', {
    commandId,
    stream,
    message: stripAnsiEscapeSequences(message),
    at: new Date().toISOString()
  })
}

const emitLocalDevStatus = (running: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('xrift:local-dev-status', { running })
}

const runCommand = async (
  command: string,
  args: string[],
  options: { cwd?: string; commandId: string }
): Promise<CommandResult> => {
  const commandEnv = await getCommandEnv()
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: commandEnv,
      shell: process.platform === 'win32'
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      emitLog(options.commandId, 'stdout', text)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      emitLog(options.commandId, 'stderr', text)
    })

    child.on('error', (error) => {
      const msg = `${error.message}\n`
      stderr += msg
      emitLog(options.commandId, 'stderr', msg)
      resolve({ ok: false, code: -1, stdout, stderr })
    })

    child.on('close', (code) => {
      const exitCode = code ?? -1
      emitLog(options.commandId, 'system', `\n[exit ${exitCode}] ${command} ${args.join(' ')}\n`)
      resolve({ ok: exitCode === 0, code: exitCode, stdout, stderr })
    })
  })
}

const runVersionCommand = async (command: string, args: string[]): Promise<string> => {
  const result = await runCommand(command, args, { commandId: `version:${command}` })
  if (!result.ok) {
    return 'not found'
  }
  return (result.stdout || result.stderr).trim().split('\n')[0] || 'unknown'
}

const stopLocalDevInternal = () => {
  if (!localDevProcess) {
    return false
  }
  const stopped = localDevProcess.kill('SIGTERM')
  localDevProcess = null
  localDevCommandId = ''
  emitLocalDevStatus(false)
  return stopped
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return ''
  }
  return result.filePaths[0]
})

ipcMain.handle('xrift:check-environment', async () => {
  const nodeVersion = await runVersionCommand('node', ['-v'])
  const npmVersion = await runVersionCommand('npm', ['-v'])
  const xriftVersion = await runVersionCommand('xrift', ['--version'])

  return {
    nodeVersion,
    npmVersion,
    xriftVersion,
    nodeOk: nodeVersion !== 'not found',
    npmOk: npmVersion !== 'not found',
    xriftOk: xriftVersion !== 'not found'
  }
})

ipcMain.handle('xrift:install-cli', async (_event, payload: { commandId: string }) => {
  return runCommand('npm', ['install', '-g', '@xrift/cli'], {
    commandId: payload.commandId
  })
})

ipcMain.handle(
  'xrift:create-world',
  async (
    _event,
    payload: { workspacePath: string; projectName: string; commandId: string }
  ) => {
    const commandResult = await runCommand(
      'xrift',
      ['create', 'world', payload.projectName, '--no-interactive'],
      {
        cwd: payload.workspacePath,
        commandId: payload.commandId
      }
    )

    return {
      ...commandResult,
      projectPath: path.join(payload.workspacePath, payload.projectName)
    }
  }
)

ipcMain.handle(
  'xrift:update-world-config',
  async (
    _event,
    payload: {
      projectPath: string
      title: string
      description: string
    }
  ) => {
    const configPath = path.join(payload.projectPath, 'xrift.json')
    const raw = await fs.readFile(configPath, 'utf-8')
    const json = JSON.parse(raw)

    if (!json.world || typeof json.world !== 'object') {
      json.world = {}
    }

    json.world.title = payload.title
    json.world.description = payload.description

    await fs.writeFile(configPath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8')

    return { ok: true, configPath }
  }
)

ipcMain.handle('xrift:login', async (_event, payload: { commandId: string }) => {
  return runCommand('xrift', ['login'], { commandId: payload.commandId })
})

ipcMain.handle('xrift:whoami', async () => {
  const result = await runCommand('xrift', ['whoami'], { commandId: 'whoami' })
  return {
    ...result,
    account: stripAnsiEscapeSequences(result.stdout).trim()
  }
})

ipcMain.handle(
  'xrift:upload-world',
  async (_event, payload: { projectPath: string; commandId: string }) => {
    return runCommand('xrift', ['upload'], {
      cwd: payload.projectPath,
      commandId: payload.commandId
    })
  }
)

ipcMain.handle(
  'xrift:start-local-dev',
  async (_event, payload: { projectPath: string; commandId: string }) => {
    if (localDevProcess) {
      emitLog(payload.commandId, 'system', '[local-dev] already running\n')
      return { ok: false, running: true }
    }

    const commandEnv = await getCommandEnv()
    const child = spawn('npm', ['run', 'dev'], {
      cwd: payload.projectPath,
      env: commandEnv,
      shell: process.platform === 'win32'
    })

    localDevProcess = child
    localDevCommandId = payload.commandId
    emitLog(payload.commandId, 'system', '$ npm run dev\n')
    emitLocalDevStatus(true)
    void shell.openExternal('http://localhost:5173')

    child.stdout.on('data', (chunk: Buffer) => {
      emitLog(payload.commandId, 'stdout', chunk.toString())
    })

    child.stderr.on('data', (chunk: Buffer) => {
      emitLog(payload.commandId, 'stderr', chunk.toString())
    })

    child.on('error', (error) => {
      emitLog(payload.commandId, 'stderr', `${error.message}\n`)
      localDevProcess = null
      localDevCommandId = ''
      emitLocalDevStatus(false)
    })

    child.on('close', (code) => {
      const exitCode = code ?? -1
      emitLog(payload.commandId, 'system', `\n[exit ${exitCode}] npm run dev\n`)
      localDevProcess = null
      localDevCommandId = ''
      emitLocalDevStatus(false)
    })

    return { ok: true, running: true }
  }
)

ipcMain.handle('xrift:stop-local-dev', async () => {
  const commandId = localDevCommandId
  const stopped = stopLocalDevInternal()
  if (stopped && commandId) {
    emitLog(commandId, 'system', '[local-dev] stop requested\n')
  }
  return { ok: true, running: false }
})

ipcMain.handle('xrift:local-dev-status', async () => {
  return { running: Boolean(localDevProcess) }
})

app.whenReady().then(createWindow)

app.on('before-quit', () => {
  stopLocalDevInternal()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})
