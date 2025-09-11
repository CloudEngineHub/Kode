import { memoize } from 'lodash-es'
import chalk from 'chalk'
// Statsig is disabled by default in the CLI runtime to avoid
// bringing browser-only globals (e.g., XMLHttpRequest) into Node.
// The Client SDK is browser-oriented; using it at module scope can
// break on Windows shells. We keep a lightweight no-op shim.
import { env } from '../utils/env'
const gateValues: Record<string, boolean> = {}
let client: any | null = null

export const initializeStatsig = memoize(
  async (): Promise<any | null> => {
    // Fully disabled in CLI by default
    return null
  },
)

export function logEvent(
  eventName: string,
  metadata: { [key: string]: string | undefined },
): void {
  // console.log('logEvent', eventName, metadata)
  if (env.isCI || process.env.NODE_ENV === 'test') {
    return
  }
  // Keep debug line for local visibility, but do not import client SDK
  if (process.argv.includes('--debug') || process.argv.includes('-d')) {
    console.log(chalk.dim(`[DEBUG-ONLY] Statsig event: ${eventName} ${JSON.stringify(metadata, null, 0)}`))
  }
}

export const checkGate = memoize(async (gateName: string): Promise<boolean> => {
  // Default to disabled gates when Statsig is not active
  return false
  // if (env.isCI || process.env.NODE_ENV === 'test') {
  //   return false
  // }
  // const statsigClient = await initializeStatsig()
  // if (!statsigClient) return false

  // const value = statsigClient.checkGate(gateName)
  // gateValues[gateName] = value
  // return value
})

export const useStatsigGate = (gateName: string, defaultValue = false) => {
  return false
  // const [gateValue, setGateValue] = React.useState(defaultValue)
  // React.useEffect(() => {
  //   checkGate(gateName).then(setGateValue)
  // }, [gateName])
  // return gateValue
}

export function getGateValues(): Record<string, boolean> {
  return { ...gateValues }
}

export const getExperimentValue = memoize(
  async <T>(experimentName: string, defaultValue: T): Promise<T> => {
    return defaultValue
    // if (env.isCI || process.env.NODE_ENV === 'test') {
    //   return defaultValue
    // }
    // const statsigClient = await initializeStatsig()
    // if (!statsigClient) return defaultValue

    // const experiment = statsigClient.getExperiment(experimentName)
    // if (Object.keys(experiment.value).length === 0) {
    //   logError(`getExperimentValue got empty value for ${experimentName}`)
    //   return defaultValue
    // }
    // return experiment.value as T
  },
)

// NB Not memoized like other methods, to allow for dynamic config changes
export const getDynamicConfig = async <T>(
  configName: string,
  defaultValue: T,
): Promise<T> => {
  return defaultValue
  // if (env.isCI || process.env.NODE_ENV === 'test') {
  //   return defaultValue
  // }
  // const statsigClient = await initializeStatsig()
  // if (!statsigClient) return defaultValue

  // const config = statsigClient.getDynamicConfig(configName)
  // if (Object.keys(config.value).length === 0) {
  //   logError(`getDynamicConfig got empty value for ${configName}`)
  //   return defaultValue
  // }
  // return config.value as T
}
