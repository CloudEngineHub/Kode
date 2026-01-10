import React from 'react'

import type { PermissionRequestEvent } from '@kode/protocol'

import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Textarea } from './ui/textarea'

export function PermissionModal(props: {
  request: PermissionRequestEvent | null
  onAllowOnce: (requestId: string) => void
  onAllowAlways: (requestId: string) => void
  onDeny: (requestId: string, reason?: string) => void
}) {
  const [denyReason, setDenyReason] = React.useState('')
  const request = props.request

  React.useEffect(() => {
    setDenyReason('')
  }, [request?.request_id])

  return (
    <Dialog
      open={Boolean(request)}
      onOpenChange={open => {
        if (open) return
        if (!request) return
        props.onDeny(request.request_id, 'Cancelled')
      }}
    >
      <DialogContent className="max-w-[min(720px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>Tool Permission</DialogTitle>
          <DialogDescription>
            Approve or deny this tool execution.
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <div className="grid gap-3">
            <div className="text-sm">
              <div className="font-medium">{request.tool_name}</div>
              <div className="text-muted-foreground">
                {request.tool_description}
              </div>
            </div>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
              {JSON.stringify(request.input ?? {}, null, 2)}
            </pre>
            <div className="grid gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                Deny reason (optional)
              </div>
              <Textarea
                value={denyReason}
                onChange={e => setDenyReason(e.target.value)}
                placeholder="Explain why you deny this tool use…"
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (!request) return
              props.onAllowOnce(request.request_id)
            }}
          >
            Allow Once
          </Button>
          <Button
            onClick={() => {
              if (!request) return
              props.onAllowAlways(request.request_id)
            }}
          >
            Allow Always
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!request) return
              props.onDeny(request.request_id, denyReason)
            }}
          >
            Deny
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
