import * as React from 'react'

import { cn } from '../../lib/utils'

export function Skeleton({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      style={{
        animationDuration: 'var(--kode-duration-skeleton-pulse)',
        ...style,
      }}
      {...props}
    />
  )
}
