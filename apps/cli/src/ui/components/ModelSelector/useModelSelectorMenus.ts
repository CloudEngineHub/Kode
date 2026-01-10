import { useEffect, useMemo } from 'react'
import models, { providers } from '#core/constants/models'

type Option = { value: string; label: string }

export function useModelSelectorMenus(args: {
  containerPaddingY: number
  containerGap: number
  setProviderFocusIndex: (value: number | ((prev: number) => number)) => void
  setPartnerProviderFocusIndex: (
    value: number | ((prev: number) => number),
  ) => void
  setCodingPlanFocusIndex: (value: number | ((prev: number) => number)) => void
}) {
  const { setProviderFocusIndex, setPartnerProviderFocusIndex, setCodingPlanFocusIndex } =
    args

  function getProviderLabel(provider: string, modelCount: number): string {
    if (providers[provider]) {
      const wipTag = '(' + 'WI' + 'P' + ')'
      return `${providers[provider].name} ${providers[provider].status === 'wip' ? wipTag : ''}`
    }
    return `${provider}`
  }

  const mainMenuOptions: Option[] = useMemo(
    () => [
      { value: 'custom-openai', label: 'Custom OpenAI-Compatible API' },
      { value: 'custom-anthropic', label: 'Custom Messages API (v1/messages)' },
      { value: 'partnerProviders', label: 'Partner Providers →' },
      { value: 'partnerCodingPlans', label: 'Partner Coding Plans →' },
      {
        value: 'ollama',
        label: getProviderLabel('ollama', models.ollama?.length || 0),
      },
    ],
    [],
  )

  const rankedProviders = useMemo(
    () => [
      'openai',
      'anthropic',
      'gemini',
      'glm',
      'kimi',
      'minimax',
      'qwen',
      'deepseek',
      'openrouter',
      'burncloud',
      'siliconflow',
      'baidu-qianfan',
      'mistral',
      'xai',
      'groq',
      'azure',
    ],
    [],
  )

  const partnerProviders = useMemo(
    () =>
      rankedProviders.filter(
        provider =>
          providers[provider] &&
          !provider.includes('coding') &&
          provider !== 'custom-openai' &&
          provider !== 'ollama',
      ),
    [rankedProviders],
  )

  const codingPlanProviders = useMemo(
    () =>
      Object.keys(providers).filter(provider => provider.includes('coding')),
    [],
  )

  const partnerProviderOptions: Option[] = useMemo(
    () =>
      partnerProviders.map(provider => {
        const modelCount = models[provider]?.length || 0
        return {
          label: getProviderLabel(provider, modelCount),
          value: provider,
        }
      }),
    [partnerProviders],
  )

  const codingPlanOptions: Option[] = useMemo(
    () =>
      codingPlanProviders.map(provider => {
        const modelCount = models[provider]?.length || 0
        return {
          label: getProviderLabel(provider, modelCount),
          value: provider,
        }
      }),
    [codingPlanProviders],
  )

  const providerReservedLines =
    8 + args.containerPaddingY * 2 + args.containerGap * 2
  const partnerReservedLines =
    10 + args.containerPaddingY * 2 + args.containerGap * 3
  const codingReservedLines = partnerReservedLines

  const clampIndex = (index: number, length: number) =>
    length === 0 ? 0 : Math.max(0, Math.min(index, length - 1))

  useEffect(() => {
    setProviderFocusIndex(prev => clampIndex(prev, mainMenuOptions.length))
  }, [setProviderFocusIndex, mainMenuOptions.length])

  useEffect(() => {
    setPartnerProviderFocusIndex(prev =>
      clampIndex(prev, partnerProviderOptions.length),
    )
  }, [setPartnerProviderFocusIndex, partnerProviderOptions.length])

  useEffect(() => {
    setCodingPlanFocusIndex(prev => clampIndex(prev, codingPlanOptions.length))
  }, [setCodingPlanFocusIndex, codingPlanOptions.length])

  return {
    mainMenuOptions,
    partnerProviderOptions,
    codingPlanOptions,
    providerReservedLines,
    partnerReservedLines,
    codingReservedLines,
    getProviderLabel,
  }
}
