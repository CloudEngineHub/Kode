import * as React from 'react'

import { cn } from '../../lib/utils'

export type SpinnerProps = Omit<React.SVGProps<SVGSVGElement>, 'children'> & {
  size?: number
}

export function Spinner({
  size = 16,
  className,
  style,
  ...props
}: SpinnerProps): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('animate-spin text-muted-foreground', className)}
      fill="none"
      role="status"
      aria-label="Loading"
      style={{ animationDuration: 'var(--kode-duration-spinner)', ...style }}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  )
}
