export type StreamName = 'stdout' | 'stderr' | 'system'

export type CommandResult = {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

export type EnvironmentStatus = {
  nodeVersion: string
  npmVersion: string
  xriftVersion: string
  nodeOk: boolean
  npmOk: boolean
  xriftOk: boolean
}

export type CommandLog = {
  commandId: string
  stream: StreamName
  message: string
  at: string
}

export type ProjectSelection = {
  isProject: boolean
  projectPath: string
  projectName: string
  workspacePath: string
  worldTitle: string
  worldDescription: string
}

export type XriftApi = {
  selectDirectory: () => Promise<string>
  inspectProjectDirectory: (directoryPath: string) => Promise<ProjectSelection>
  checkEnvironment: () => Promise<EnvironmentStatus>
  installCli: (commandId: string) => Promise<CommandResult>
  createWorld: (payload: {
    workspacePath: string
    projectName: string
    commandId: string
  }) => Promise<CommandResult & { projectPath: string }>
  startLocalDev: (payload: {
    projectPath: string
    commandId: string
  }) => Promise<{ ok: boolean; running: boolean }>
  stopLocalDev: () => Promise<{ ok: boolean; running: boolean }>
  getLocalDevStatus: () => Promise<{ running: boolean }>
  updateWorldConfig: (payload: {
    projectPath: string
    title: string
    description: string
  }) => Promise<{ ok: boolean; configPath: string }>
  login: (commandId: string) => Promise<CommandResult>
  whoami: () => Promise<CommandResult & { account: string }>
  uploadWorld: (payload: {
    projectPath: string
    commandId: string
  }) => Promise<CommandResult>
  onCommandLog: (listener: (data: CommandLog) => void) => () => void
  onLocalDevStatus: (listener: (data: { running: boolean }) => void) => () => void
}

declare global {
  interface Window {
    xriftApi: XriftApi
  }
}
