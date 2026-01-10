export async function startCliEntrypoint(): Promise<void> {
  await import('../index.ts')
}

await startCliEntrypoint()
