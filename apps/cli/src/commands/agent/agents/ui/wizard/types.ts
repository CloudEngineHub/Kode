export type WizardLocation = 'projectSettings' | 'userSettings'
export type WizardMethod = 'quickGenerate' | 'customGenerate' | 'manual'

export type WizardFinalAgent = {
  agentType: string
  whenToUse: string
  systemPrompt: string
  tools: string[] | undefined
  model: string
  color?: string
  source: WizardLocation
}

export type WizardData = {
  location?: WizardLocation
  method?: WizardMethod
  generationPrompt?: string
  agentType?: string
  whenToUse?: string
  systemPrompt?: string
  selectedTools?: string[] | undefined
  selectedModel?: string
  selectedColor?: string
  wasGenerated?: boolean
  isGenerating?: boolean
  finalAgent?: WizardFinalAgent
}

export function wizardLocationToStorageLocation(
  location: WizardLocation,
): 'project' | 'user' {
  return location === 'projectSettings' ? 'project' : 'user'
}
