import type { ReactNode } from 'react'
import * as React from 'react'
import type { ModelSelectorProps } from './types'
import { ModelSelectorView } from './ModelSelectorView'
import { useModelSelectorController } from './useModelSelectorController'

export function ModelSelector(props: ModelSelectorProps): ReactNode {
  const viewProps = useModelSelectorController(props)
  return <ModelSelectorView {...viewProps} />
}
