import { JsonRpcError } from './jsonrpc'

export type AcpErrorData = {
  kind?: string
  retryable?: boolean
  sessionId?: string
  toolCallId?: string
  [key: string]: unknown
}

export class AcpError extends Error {
  readonly code: number
  readonly data?: AcpErrorData

  constructor(code: number, message: string, data?: AcpErrorData) {
    super(message)
    this.name = 'AcpError'
    this.code = code
    this.data = data
  }
}

export function toJsonRpcError(error: unknown): JsonRpcError {
  if (error instanceof JsonRpcError) return error
  if (error instanceof AcpError) {
    return new JsonRpcError(error.code, error.message, error.data)
  }

  const message = error instanceof Error ? error.message : String(error)
  return new JsonRpcError(-32603, message)
}
