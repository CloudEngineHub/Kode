// IMPORTANT:
// `#core/logging/log` is ambiguous because both `logging/log.ts` and
// `logging/log/` exist. Use the file specifier to ensure Bun/Node ESM
// resolution picks the intended module.
export * from '#core/logging/log.ts'
