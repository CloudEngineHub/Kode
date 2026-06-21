import { timingSafeEqual } from 'node:crypto'

function timingSafeEquals(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8')
    const bBuf = Buffer.from(b, 'utf8')
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
  } catch {
    return false
  }
}

function getCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (!k) continue
    if (k === name) {
      const value = rest.join('=')
      if (!value) return ''
      try {
        return decodeURIComponent(value)
      } catch {
        return null
      }
    }
  }
  return null
}

export function createTokenChecker(args: {
  token: string
}): (req: Request) => boolean {
  const token = args.token

  return (req: Request): boolean => {
    const url = new URL(req.url)
    const qp = url.searchParams.get('token')
    if (qp && timingSafeEquals(qp, token)) return true

    const header = req.headers.get('authorization')
    if (header && header.startsWith('Bearer ')) {
      const h = header.slice('Bearer '.length).trim()
      if (h && timingSafeEquals(h, token)) return true
    }

    const cookieToken = getCookieValue(req.headers.get('cookie'), 'kode_token')
    if (cookieToken && timingSafeEquals(cookieToken, token)) return true

    return false
  }
}
