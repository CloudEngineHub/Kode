export const MAX_JSON_PAYLOAD_BYTES = 1024 * 1024
export const MAX_JSON_NESTING_DEPTH = 10

export type JsonPayloadBudgetErrorData = {
  kind: 'payload_too_large' | 'payload_too_deep' | 'payload_not_serializable'
  retryable: false
  label: string
  sizeBytes?: number
  maxBytes?: number
  depth?: number
  maxDepth?: number
}

export class JsonPayloadBudgetError extends Error {
  readonly code = -32602
  readonly data: JsonPayloadBudgetErrorData

  constructor(message: string, data: JsonPayloadBudgetErrorData) {
    super(message)
    this.name = 'JsonPayloadBudgetError'
    this.data = data
  }
}

function getJsonNestingDepth(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): number {
  if (value === null || typeof value !== 'object') return 0

  if (seen.has(value)) {
    throw new JsonPayloadBudgetError('JSON payload is not serializable', {
      kind: 'payload_not_serializable',
      retryable: false,
      label: 'payload',
    })
  }
  seen.add(value)

  try {
    const children = Array.isArray(value)
      ? value
      : Object.values(value as Record<string, unknown>)

    if (children.length === 0) return 1
    return (
      1 + Math.max(...children.map(child => getJsonNestingDepth(child, seen)))
    )
  } finally {
    seen.delete(value)
  }
}

export function getJsonPayloadBudget(value: unknown): {
  sizeBytes: number
  depth: number
} {
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? 'null'
  } catch {
    throw new JsonPayloadBudgetError('JSON payload is not serializable', {
      kind: 'payload_not_serializable',
      retryable: false,
      label: 'payload',
    })
  }

  return {
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    depth: getJsonNestingDepth(value),
  }
}

export function assertJsonPayloadBudget(
  value: unknown,
  options?: {
    label?: string
    maxBytes?: number
    maxDepth?: number
  },
): void {
  const label = options?.label ?? 'payload'
  const maxBytes = options?.maxBytes ?? MAX_JSON_PAYLOAD_BYTES
  const maxDepth = options?.maxDepth ?? MAX_JSON_NESTING_DEPTH
  const budget = getJsonPayloadBudget(value)

  if (budget.sizeBytes > maxBytes) {
    throw new JsonPayloadBudgetError(
      `${label} exceeds maximum serialized size of ${maxBytes} bytes`,
      {
        kind: 'payload_too_large',
        retryable: false,
        label,
        sizeBytes: budget.sizeBytes,
        maxBytes,
      },
    )
  }

  if (budget.depth > maxDepth) {
    throw new JsonPayloadBudgetError(
      `${label} exceeds maximum nesting depth of ${maxDepth}`,
      {
        kind: 'payload_too_deep',
        retryable: false,
        label,
        depth: budget.depth,
        maxDepth,
      },
    )
  }
}
