export async function startServerEntrypoint(): Promise<void> {
  await import('../../../server/src/index.ts')
}

await startServerEntrypoint()
