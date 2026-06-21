import React from 'react'

declare global {
  interface Window {
    kode?: { ping: () => Promise<unknown> }
  }
}

export function App() {
  const [status, setStatus] = React.useState<string>('idle')

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ margin: 0 }}>Kode Desktop</h2>
      <p style={{ opacity: 0.7, marginTop: 8 }}>
        Electron scaffold (coming soon).
      </p>
      <button
        onClick={async () => {
          setStatus('pinging…')
          try {
            await window.kode?.ping()
            setStatus('ok')
          } catch {
            setStatus('error')
          }
        }}
      >
        Ping
      </button>
      <div style={{ marginTop: 8, opacity: 0.7 }}>{status}</div>
    </div>
  )
}
