export async function startCliEntrypoint(): Promise<void> {
  await import('../index.ts')
}

startCliEntrypoint().catch(err => {
  console.error(err)
  process.exit(1)
})
