export async function startServerEntrypoint(): Promise<void> {
  await import('../../../server/src/index.ts')
}

startServerEntrypoint().catch(err => {
  console.error(err)
  process.exit(1)
})
