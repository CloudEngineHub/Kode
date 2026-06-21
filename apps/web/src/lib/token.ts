export const TOKEN_STORAGE_KEY = 'kode.daemon.token'

export function loadTokenFromStorage(): string {
  try {
    const cached = window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
    return cached ?? ''
  } catch {
    return ''
  }
}

export function persistToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {}
}

export function clearToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {}
}

export function consumeTokenFromUrl(): string {
  try {
    const url = new URL(window.location.href)
    const token = url.searchParams.get('token') ?? ''
    if (!token) return ''

    persistToken(token)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
    return token
  } catch {
    return ''
  }
}
