import { getProjectDocs } from '@context'

class KodeContextManager {
  private static instance: KodeContextManager
  private projectDocsCache = ''
  private cacheInitialized = false
  private initPromise: Promise<void> | null = null

  static getInstance(): KodeContextManager {
    if (!KodeContextManager.instance) {
      KodeContextManager.instance = new KodeContextManager()
    }
    return KodeContextManager.instance
  }

  private async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        const projectDocs = await getProjectDocs()
        this.projectDocsCache = projectDocs || ''
        this.cacheInitialized = true
      } catch (error) {
        console.warn('[KodeContext] Failed to load project docs:', error)
        this.projectDocsCache = ''
        this.cacheInitialized = true
      }
    })()

    return this.initPromise
  }

  public getKodeContext(): string {
    if (!this.cacheInitialized) {
      this.initialize().catch(console.warn)
      return ''
    }
    return this.projectDocsCache
  }

  public async refreshCache(): Promise<void> {
    this.cacheInitialized = false
    this.initPromise = null
    await this.initialize()
  }
}

const kodeContextManager = KodeContextManager.getInstance()

export const generateKodeContext = (): string => {
  return kodeContextManager.getKodeContext()
}

export const refreshKodeContext = async (): Promise<void> => {
  await kodeContextManager.refreshCache()
}

// Non-blocking prefetch so first LLM call usually includes project docs,
// without forcing the full LLM service module to load at startup.
if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    refreshKodeContext().catch(() => {})
  }, 0)
}
