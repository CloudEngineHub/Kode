export type ModelSelectorScreen =
  | 'provider'
  | 'partnerProviders'
  | 'partnerCodingPlans'
  | 'apiKey'
  | 'resourceName'
  | 'baseUrl'
  | 'model'
  | 'modelInput'
  | 'modelParams'
  | 'contextLength'
  | 'connectionTest'
  | 'confirmation'

export type ModelSelectorScreenStack = ModelSelectorScreen[]

export type BackEffect =
  | { type: 'exit' }
  | { type: 'resetProviderFocus' }
  | null

export function createInitialScreenStack(_opts?: {
  skipModelType?: boolean
}): ModelSelectorScreenStack {
  return ['provider']
}

export function getCurrentScreen(
  stack: ModelSelectorScreenStack,
): ModelSelectorScreen {
  return stack[stack.length - 1] ?? 'provider'
}

export function pushScreen(
  stack: ModelSelectorScreenStack,
  screen: ModelSelectorScreen,
): ModelSelectorScreenStack {
  return [...stack, screen]
}

export function popScreen(
  stack: ModelSelectorScreenStack,
): ModelSelectorScreenStack {
  if (stack.length > 1) {
    return stack.slice(0, -1)
  }
  return stack
}

export function handleBackNavigation(stack: ModelSelectorScreenStack): {
  stack: ModelSelectorScreenStack
  effect: BackEffect
} {
  const currentScreen = getCurrentScreen(stack)

  // Special handling for submenus - they should go back to main menu
  if (
    currentScreen === 'partnerProviders' ||
    currentScreen === 'partnerCodingPlans'
  ) {
    return { stack: ['provider'], effect: { type: 'resetProviderFocus' } }
  }

  // If we're at the main provider screen, exit
  if (currentScreen === 'provider') {
    return { stack, effect: { type: 'exit' } }
  }

  // For all other screens, normal back navigation
  if (stack.length > 1) {
    return { stack: stack.slice(0, -1), effect: null }
  }

  // Fallback to provider screen
  return { stack: ['provider'], effect: { type: 'resetProviderFocus' } }
}
