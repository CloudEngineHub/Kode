export type RuntimePlatform = 'win32' | 'darwin' | 'linux' | string
export type RuntimeArch =
  | 'x64'
  | 'arm64'
  | 'arm'
  | 'ia32'
  | 'riscv64'
  | 'ppc64'
  | 's390x'
  | string

export type Encoding = 'utf8'

export type SpawnStdio =
  | 'inherit'
  | 'pipe'
  | 'ignore'
  | Array<'inherit' | 'pipe' | 'ignore'>

export type SpawnSpec = {
  cmd: string[]
  cwd?: string
  env?: Record<string, string | undefined>
  stdin?: SpawnStdio
  stdout?: SpawnStdio
  stderr?: SpawnStdio
  timeoutMs?: number
  signal?: AbortSignal
}

export type SpawnResult = {
  exitCode: number
  stdout?: string
  stderr?: string
}

export interface RuntimeSubprocess {
  readonly pid: number | undefined
  kill(signal?: string | number): void
  readonly exited: Promise<SpawnResult>
}

export type FileStat = {
  isFile: boolean
  isDirectory: boolean
  size: number
  mtimeMs: number
}

export interface RuntimeFS {
  readFile(path: string, encoding?: Encoding): Promise<string>
  readFileBytes(path: string): Promise<Uint8Array>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>
  rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>
  readdir(path: string): Promise<string[]>
  stat(path: string): Promise<FileStat>
  realpath(path: string): Promise<string>
  chmod(path: string, mode: number): Promise<void>
}

export interface RuntimeEnv {
  get(name: string): string | undefined
  set(name: string, value: string): void
  has(name: string): boolean
  delete(name: string): void
  toObject(): Record<string, string | undefined>
}

export interface RuntimeOS {
  platform(): RuntimePlatform
  arch(): RuntimeArch
  homedir(): string
  tmpdir(): string
}

export interface RuntimeClock {
  now(): number
  sleep(ms: number, signal?: AbortSignal): Promise<void>
}

export interface RuntimeLogger {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export interface RuntimeProcess {
  cwd(): string
  chdir(path: string): void
  spawn(spec: SpawnSpec): RuntimeSubprocess
}

export interface Runtime {
  readonly fs: RuntimeFS
  readonly env: RuntimeEnv
  readonly os: RuntimeOS
  readonly clock: RuntimeClock
  readonly process: RuntimeProcess
  readonly log: RuntimeLogger
}
