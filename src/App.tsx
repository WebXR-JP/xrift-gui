import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CommandLog, EnvironmentStatus, ProjectSelection } from './types'

type Step = {
  key: string
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    key: 'env',
    title: '1. 前提チェック',
    description: 'Node / npm / xrift CLI の利用可否を確認'
  },
  {
    key: 'cli',
    title: '2. xrift CLI準備',
    description: '未導入の場合は npm で @xrift/cli をインストール'
  },
  {
    key: 'create',
    title: '3. ワールドテンプレート作成',
    description: 'xrift create world で新規ワールドを作成'
  },
  {
    key: 'local-dev',
    title: '4. ローカル実行',
    description: '作成したワールドで npm run dev を実行'
  },
  {
    key: 'config',
    title: '5. 公開用情報設定',
    description: 'xrift.jsonのworld.title / world.description を反映'
  },
  {
    key: 'login',
    title: '6. Xriftログイン',
    description: 'xrift login 実行後、whoamiで確認'
  },
  {
    key: 'upload',
    title: '7. ワールドアップロード',
    description: 'xrift upload world でサーバーへ反映'
  }
]

const createCommandId = (name: string) => `${name}-${Date.now()}`

const appendSystemLog = (
  setLogs: Dispatch<SetStateAction<CommandLog[]>>,
  commandId: string,
  message: string
) => {
  setLogs((prev) => [
    ...prev,
    {
      commandId,
      stream: 'system',
      message: `${message}\n`,
      at: new Date().toISOString()
    }
  ])
}

export const App = () => {
  const [logs, setLogs] = useState<CommandLog[]>([])
  const [environment, setEnvironment] = useState<EnvironmentStatus | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')
  const [projectName, setProjectName] = useState('my-world')
  const [projectPath, setProjectPath] = useState('')
  const [title, setTitle] = useState('サンプルワールド')
  const [description, setDescription] = useState('XRift GUI Toolで作成したワールド')
  const [loginAccount, setLoginAccount] = useState('')
  const [loginDisplayName, setLoginDisplayName] = useState('')
  const [localDevRunning, setLocalDevRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const logPanelRef = useRef<HTMLElement | null>(null)

  const extractUserId = (account: string): string => {
    const match = account.match(/^.*user\s*id\s*[:=]\s*([^\s]+).*$/im)
    return match?.[1]?.trim() ?? ''
  }

  const extractDisplayName = (account: string): string => {
    const match = account.match(/^.*display\s*name\s*[:=]\s*(.+).*$/im)
    return match?.[1]?.trim() ?? ''
  }

  const isLoggedInAccount = (ok: boolean, account: string) => {
    if (!ok || !account) {
      return false
    }
    return extractUserId(account) !== ''
  }

  useEffect(() => {
    const unsub = window.xriftApi.onCommandLog((log) => {
      setLogs((prev) => [...prev, log])
    })
    const unsubLocal = window.xriftApi.onLocalDevStatus((data) => {
      setLocalDevRunning(data.running)
    })
    return () => {
      unsub()
      unsubLocal()
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const status = await window.xriftApi.getLocalDevStatus()
      setLocalDevRunning(status.running)
    })()
  }, [])

  useEffect(() => {
    if (!logPanelRef.current) {
      return
    }
    logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight
  }, [logs])

  const logLines = useMemo(() => {
    return logs.flatMap((x, index) => {
      const normalized = `[${x.stream}] ${x.message}`.replace(/\r\n/g, '\n')
      const lines = normalized.split('\n')
      if (lines[lines.length - 1] === '') {
        lines.pop()
      }
      return lines.map((line, lineIndex) => ({
        key: `${x.commandId}-${x.at}-${index}-${lineIndex}`,
        text: line,
        isError: /error/i.test(line)
      }))
    })
  }, [logs])

  const checkEnvironment = async () => {
    setBusy(true)
    try {
      const result = await window.xriftApi.checkEnvironment()
      setEnvironment(result)
    } finally {
      setBusy(false)
    }
  }

  const selectWorkspace = async () => {
    const selected = await window.xriftApi.selectDirectory()
    if (selected) {
      const selection: ProjectSelection = await window.xriftApi.inspectProjectDirectory(selected)
      if (selection.isProject) {
        setWorkspacePath(selection.workspacePath)
        setProjectName(selection.projectName)
        setProjectPath(selection.projectPath)
        setTitle(selection.worldTitle)
        setDescription(selection.worldDescription)
      } else {
        setWorkspacePath(selected)
        if (!projectPath) {
          setProjectPath(`${selected}/${projectName}`)
        }
      }
    }
  }

  const installCli = async () => {
    const commandId = createCommandId('install-cli')
    setBusy(true)
    appendSystemLog(setLogs, commandId, '$ npm install -g @xrift/cli')
    try {
      await window.xriftApi.installCli(commandId)
      const env = await window.xriftApi.checkEnvironment()
      setEnvironment(env)
    } finally {
      setBusy(false)
    }
  }

  const createWorld = async () => {
    if (!workspacePath || !projectName.trim()) {
      return
    }
    const commandId = createCommandId('create-world')
    setBusy(true)
    appendSystemLog(setLogs, commandId, `$ xrift create world ${projectName}`)
    try {
      const result = await window.xriftApi.createWorld({
        workspacePath,
        projectName,
        commandId
      })
      setProjectPath(result.projectPath)
    } finally {
      setBusy(false)
    }
  }

  const saveConfig = async () => {
    if (!projectPath) {
      return
    }
    setBusy(true)
    try {
      await window.xriftApi.updateWorldConfig({
        projectPath,
        title,
        description
      })
      const commandId = createCommandId('config-save')
      appendSystemLog(setLogs, commandId, `updated ${projectPath}/xrift.json`)
    } finally {
      setBusy(false)
    }
  }

  const startLocalDev = async () => {
    if (!projectPath) {
      return
    }
    const commandId = createCommandId('local-dev')
    setBusy(true)
    try {
      const result = await window.xriftApi.startLocalDev({ projectPath, commandId })
      setLocalDevRunning(result.running)
    } finally {
      setBusy(false)
    }
  }

  const stopLocalDev = async () => {
    setBusy(true)
    try {
      const result = await window.xriftApi.stopLocalDev()
      setLocalDevRunning(result.running)
    } finally {
      setBusy(false)
    }
  }

  const login = async () => {
    const checkCommandId = createCommandId('whoami-check')
    setBusy(true)
    try {
      appendSystemLog(setLogs, checkCommandId, '$ xrift whoami')
      const current = await window.xriftApi.whoami()
      if (isLoggedInAccount(current.ok, current.account)) {
        const userId = extractUserId(current.account)
        const displayName = extractDisplayName(current.account)
        setLoginAccount(userId)
        setLoginDisplayName(displayName)
        appendSystemLog(
          setLogs,
          checkCommandId,
          `[skip] already logged in as ${userId}${displayName ? ` (${displayName})` : ''}`
        )
        return
      }

      const loginCommandId = createCommandId('login')
      appendSystemLog(setLogs, loginCommandId, '$ xrift login')
      await window.xriftApi.login(loginCommandId)
      const whoami = await window.xriftApi.whoami()
      if (isLoggedInAccount(whoami.ok, whoami.account)) {
        setLoginAccount(extractUserId(whoami.account))
        setLoginDisplayName(extractDisplayName(whoami.account))
      } else {
        setLoginAccount('')
        setLoginDisplayName('')
      }
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    if (!projectPath) {
      return
    }
    const commandId = createCommandId('upload')
    setBusy(true)
    appendSystemLog(setLogs, commandId, '$ xrift upload world')
    try {
      await window.xriftApi.uploadWorld({ projectPath, commandId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="layout">
      <section className="panel">
        <h1>XRift GUI Tool</h1>
        <p className="lead">環境準備からアップロードまでをGUIで実行します。</p>

        <div className="steps">
          {STEPS.map((step) => (
            <div key={step.key} className="step-card">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </div>
          ))}
        </div>

        <div className="actions">
          <h2>1) 前提チェック</h2>
          <button disabled={busy} onClick={checkEnvironment}>
            環境を確認
          </button>
          {environment && (
            <ul className="status-list">
              <li>node: {environment.nodeVersion}</li>
              <li>npm: {environment.npmVersion}</li>
              <li>xrift: {environment.xriftVersion}</li>
            </ul>
          )}

          <h2>2) xrift CLI準備</h2>
          <button disabled={busy} onClick={installCli}>
            CLIをインストール
          </button>

          <h2>3) テンプレート作成</h2>
          <div className="row">
            <input
              value={workspacePath}
              onChange={(e) => setWorkspacePath(e.target.value)}
              placeholder="workspace path"
            />
            <button disabled={busy} onClick={selectWorkspace}>
              選択
            </button>
          </div>
          <input
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value)
              if (workspacePath) {
                setProjectPath(`${workspacePath}/${e.target.value}`)
              }
            }}
            placeholder="project name"
          />
          <button disabled={busy || !workspacePath || !projectName} onClick={createWorld}>
            ワールドを作成
          </button>

          <h2>4) ローカル実行</h2>
          <button disabled={busy || !projectPath || localDevRunning} onClick={startLocalDev}>
            npm run dev を開始
          </button>
          <p>ここでWorld.tsを編集してワールドを作ってみましょう！</p>
          <button disabled={busy || !localDevRunning} onClick={stopLocalDev}>
            ローカル実行を停止
          </button>
          {localDevRunning && <p className="status">ローカル実行中</p>}

          <h2>5) 公開用情報設定</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="description"
          />
          <button disabled={busy || !projectPath} onClick={saveConfig}>
            xrift.jsonに保存
          </button>

          <h2>6) XRIFTログイン</h2>
          <button disabled={busy} onClick={login}>
            xrift login（未ログイン時のみ）
          </button>
          {loginAccount && (
            <p className="status">
              ログイン済み: {loginDisplayName}　({loginAccount})
            </p>
          )}

          <h2>7) アップロード</h2>
          <button disabled={busy || !projectPath} onClick={upload}>
            xrift upload world
          </button>
        </div>
      </section>

      <section ref={logPanelRef} className="panel log-panel">
        <h2>Command Logs</h2>
        <pre>
          {logLines.length === 0
            ? 'No logs yet.'
            : logLines.map((line) => (
                <span key={line.key} className={line.isError ? 'log-line-error' : undefined}>
                  {line.text}
                  {'\n'}
                </span>
              ))}
        </pre>
      </section>
    </div>
  )
}
