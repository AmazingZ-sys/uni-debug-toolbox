export interface DebugToolboxOptions {
  /** Defaults to false. true masks common credentials; keys masks only the named fields. */
  redact?: boolean | { keys: string[] }
  maxLogs?: number
  maxRequests?: number
  maxValueLength?: number
  app?: { config?: { errorHandler?: (...args: unknown[]) => unknown } }
  uni?: any
  console?: Console
}

export interface DebugToolbox {
  readonly active: boolean
  start(options?: DebugToolboxOptions): DebugToolbox
  stop(): DebugToolbox
  subscribe(listener: () => void): () => void
  snapshot(): { logs: any[]; requests: any[] }
  clear(kind?: 'logs' | 'requests'): void
  recordError(error: unknown, info?: string): void
  beginRequest(details: { kind: string; method?: string; url?: string; header?: unknown; data?: unknown }): {
    success(value: unknown): void
    fail(value: unknown): void
  }
  getSystemInfo(): Record<string, unknown>
  listStorageKeys(): string[]
  getStorage(key: string): unknown
  setStorage(key: string, value: unknown): void
  removeStorage(key: string): void
}

export declare function createDebugToolbox(): DebugToolbox
export declare const toolbox: DebugToolbox
