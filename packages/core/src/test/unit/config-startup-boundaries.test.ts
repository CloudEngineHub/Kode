import { afterEach, describe, expect, test } from 'bun:test'
import { ConfigParseError as CoreConfigParseError } from '#core/utils/errors'
import {
  getCwd as getConfigCwd,
  resetCwdProviderForTesting,
  setCwdProvider,
} from '#config/cwd'
import { ConfigParseError as ConfigPackageParseError } from '#config/errors'

describe('config startup boundaries', () => {
  afterEach(() => {
    resetCwdProviderForTesting()
  })

  test('uses one ConfigParseError constructor across core and config', () => {
    const error = new ConfigPackageParseError('invalid json', 'config.json', {})

    expect(CoreConfigParseError).toBe(ConfigPackageParseError)
    expect(error).toBeInstanceOf(CoreConfigParseError)
  })

  test('allows config cwd to be supplied by the host runtime', () => {
    setCwdProvider(() => '/tmp/kode-config-cwd')

    expect(getConfigCwd()).toBe('/tmp/kode-config-cwd')
  })
})
