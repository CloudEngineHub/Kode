import type { GlobalConfig, ModelPointers, ModelProfile } from '../schema'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string {
  if (!record) return ''
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

export function migrateModelProfilesRemoveId(
  config: GlobalConfig,
): GlobalConfig {
  if (!config.modelProfiles || config.modelProfiles.length === 0) return config

  const idToModelNameMap = new Map<string, string>()
  const migratedProfiles: ModelProfile[] = config.modelProfiles.map(profile => {
    const raw: unknown = profile
    if (!isRecord(raw)) return profile

    const maybeId = raw['id']
    if (typeof maybeId === 'string' && profile.modelName) {
      idToModelNameMap.set(maybeId, profile.modelName)
    }

    const { id: _ignored, ...rest } = raw
    return rest as unknown as ModelProfile
  })

  const migratedPointers: ModelPointers = {
    main: '',
    task: '',
    compact: '',
    quick: '',
  }

  const pointersRaw: unknown = config.modelPointers
  const pointers = isRecord(pointersRaw) ? pointersRaw : null

  const rawMain = readString(pointers, 'main')
  const rawTask = readString(pointers, 'task')
  const rawQuick = readString(pointers, 'quick')
  const rawCompact =
    readString(pointers, 'compact') || readString(pointers, 'reasoning')

  if (rawMain) migratedPointers.main = idToModelNameMap.get(rawMain) ?? rawMain
  if (rawTask) migratedPointers.task = idToModelNameMap.get(rawTask) ?? rawTask
  if (rawCompact)
    migratedPointers.compact = idToModelNameMap.get(rawCompact) ?? rawCompact
  if (rawQuick)
    migratedPointers.quick = idToModelNameMap.get(rawQuick) ?? rawQuick

  const configRaw: unknown = config
  const configRecord = isRecord(configRaw) ? configRaw : null

  const legacyDefaultModelId = readString(configRecord, 'defaultModelId')
  const legacyDefaultModelName = readString(configRecord, 'defaultModelName')

  let defaultModelName: string | undefined = config.defaultModelName
  if (legacyDefaultModelId) {
    defaultModelName =
      idToModelNameMap.get(legacyDefaultModelId) ?? legacyDefaultModelId
  } else if (legacyDefaultModelName) {
    defaultModelName = legacyDefaultModelName
  }

  if (!configRecord) {
    return {
      ...config,
      modelProfiles: migratedProfiles,
      modelPointers: migratedPointers,
      defaultModelName,
    }
  }

  const migratedConfig: Record<string, unknown> = { ...configRecord }
  delete migratedConfig['defaultModelId']
  delete migratedConfig['currentSelectedModelId']
  delete migratedConfig['mainAgentModelId']
  delete migratedConfig['taskToolModelId']

  return {
    ...(migratedConfig as unknown as GlobalConfig),
    modelProfiles: migratedProfiles,
    modelPointers: migratedPointers,
    defaultModelName,
  }
}
