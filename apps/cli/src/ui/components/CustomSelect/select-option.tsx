import figures from 'figures'
import { Box, Text, type DOMElement } from 'ink'
import React, { type ReactNode } from 'react'
import { type Theme } from './theme'
import { getTheme } from '#core/utils/theme'

export type SelectOptionProps = {
  /**
   * Determines if option is focused.
   */
  readonly isFocused: boolean

  /**
   * Determines if option is selected.
   */
  readonly isSelected: boolean

  /**
   * Determines if pointer is shown when selected
   */
  readonly smallPointer?: boolean

  /**
   * Option label.
   */
  readonly children: ReactNode

  /**
   * React key prop (handled internally by React)
   */
  readonly key?: React.Key
}

export const SelectOption = React.forwardRef<DOMElement, SelectOptionProps>(
  function SelectOption(
    { isFocused, isSelected, smallPointer, children, ...props },
    ref,
  ) {
    const appTheme = getTheme()
    const styles = {
      option: ({ isFocused }: { isFocused: boolean }) => ({
        paddingLeft: 2,
        paddingRight: 1,
      }),
      focusIndicator: () => ({
        color: appTheme.kode,
      }),
      label: ({
        isFocused,
        isSelected,
      }: {
        isFocused: boolean
        isSelected: boolean
      }) => ({
        color: isSelected
          ? appTheme.success
          : isFocused
            ? appTheme.kode
            : appTheme.text,
        bold: isSelected,
      }),
      selectedIndicator: () => ({
        color: appTheme.success,
      }),
    }

    return (
      <Box ref={ref} {...styles.option({ isFocused })}>
        {isFocused && (
          <Text {...styles.focusIndicator()}>
            {smallPointer ? figures.triangleDownSmall : figures.pointer}
          </Text>
        )}

        <Text {...styles.label({ isFocused, isSelected })} wrap="truncate-end">
          {children}
        </Text>

        {isSelected && (
          <Text {...styles.selectedIndicator()}>{figures.tick}</Text>
        )}
      </Box>
    )
  },
)
