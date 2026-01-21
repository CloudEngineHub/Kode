import { runCli } from './app'

runCli().catch(err => {
  console.error(err)
  process.exit(1)
})
