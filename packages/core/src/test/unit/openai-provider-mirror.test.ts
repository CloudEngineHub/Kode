import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const ROOT_DIR = process.cwd()

const OPENAI_PROVIDER_FILES = [
  'completion.ts',
  'customModels.ts',
  'endpointFallback.ts',
  'gpt5.ts',
  'index.ts',
  'modelErrors.ts',
  'modelFeatures.ts',
  'responsesApi.ts',
  'retry.ts',
  'stream.ts',
]

const OPENAI_LLM_FILES = [
  'conversion.ts',
  'index.ts',
  'params.ts',
  'queryOpenAI.ts',
  'stream.ts',
  'unifiedResponse.ts',
  'usage.ts',
]

function readRepoFile(path: string): string {
  return readFileSync(join(ROOT_DIR, path), 'utf8')
}

function normalizeCoreProviderImports(source: string): string {
  return source
    .replaceAll("from '#core/ai/openai'", "from '@kode/ai/openai'")
    .replaceAll(
      "from '#core/ai/openai/stream'",
      "from '@kode/ai/openai/stream'",
    )
    .replaceAll(
      "await import('#core/ai/openai')",
      "await import('@kode/ai/openai')",
    )
}

describe('OpenAI provider mirror boundary', () => {
  test('keeps core and @kode/ai OpenAI provider files byte-identical', () => {
    for (const file of OPENAI_PROVIDER_FILES) {
      const coreFile = readRepoFile(`packages/core/src/ai/openai/${file}`)
      const aiFile = readRepoFile(`packages/ai/src/openai/${file}`)

      expect(coreFile, file).toBe(aiFile)
    }
  })

  test('keeps OpenAI LLM files equivalent except package-local imports', () => {
    for (const file of OPENAI_LLM_FILES) {
      const coreFile = normalizeCoreProviderImports(
        readRepoFile(`packages/core/src/ai/llm/openai/${file}`),
      )
      const aiFile = readRepoFile(`packages/ai/src/llm/openai/${file}`)

      expect(coreFile, file).toBe(aiFile)
    }
  })
})
