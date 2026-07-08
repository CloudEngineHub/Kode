import * as React from 'react'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '../../lib/utils'

type ResizablePanelGroupProps = React.ComponentProps<
  typeof ResizablePrimitive.Group
> & {
  direction?: React.ComponentProps<typeof ResizablePrimitive.Group>['orientation']
}

const ResizablePanelGroup = ({
  className,
  direction,
  orientation,
  ...props
}: ResizablePanelGroupProps) => {
  const resolvedOrientation = orientation ?? direction

  return (
    <ResizablePrimitive.Group
      data-orientation={resolvedOrientation ?? 'horizontal'}
      orientation={resolvedOrientation}
      className={cn(
        'flex h-full w-full data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

const ResizablePanel = ResizablePrimitive.Panel

const ResizableHandle = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator>) => (
  <ResizablePrimitive.Separator
    className={cn(
      'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2',
      'aria-[orientation=vertical]:h-px aria-[orientation=vertical]:w-full',
      className,
    )}
    {...props}
  >
    <div className="z-10 h-8 w-1 rounded-full bg-border" />
  </ResizablePrimitive.Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
