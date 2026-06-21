import type { ReactNode } from 'react'
import * as React from 'react'
import { REPLView } from './REPLView'
import { useReplController } from './useReplController'
import type { REPLProps } from './types'

export type { BinaryFeedbackContext } from './types'

export function REPL(props: REPLProps): ReactNode {
  const viewProps = useReplController(props)
  return <REPLView {...viewProps} />
}
