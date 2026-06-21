import { createKodeDaemonClient } from '#daemon/client'

const url = process.env.KODE_DAEMON_URL
if (!url) {
  throw new Error('Set KODE_DAEMON_URL to the URL printed by the daemon')
}

const client = createKodeDaemonClient({ url })
await client.connect()
client.sendPrompt('hello from sdk')

for await (const ev of client.events) {
  console.log(JSON.stringify(ev))
  if (ev.type === 'result') break
}

client.close()
