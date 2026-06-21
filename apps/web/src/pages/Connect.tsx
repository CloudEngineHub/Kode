import React from 'react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'

export function ConnectPage(props: {
  token: string
  onTokenChange: (token: string) => void
  onSave: () => void
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle>Connect to Kode Server</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              Paste your daemon token to connect.
            </div>
            <Input
              value={props.token}
              onChange={e => props.onTokenChange(e.target.value)}
              placeholder="Daemon token"
            />
            <Button onClick={props.onSave}>Save Token</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
