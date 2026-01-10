import React from 'react'

import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'

export function SettingsPage(props: {
  token: string
  onTokenChange: (token: string) => void
  onTokenClear: () => void
}) {
  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <div className="text-sm font-medium">Daemon token</div>
            <Input
              value={props.token}
              onChange={e => props.onTokenChange(e.target.value)}
              placeholder="Paste daemon token"
            />
            <div className="text-xs text-muted-foreground">
              Stored in sessionStorage as `kode.daemon.token`.
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-end gap-2">
            <Button variant="destructive" onClick={props.onTokenClear}>
              Clear Token
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
