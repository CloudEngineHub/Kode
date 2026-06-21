import { getCurrentProjectConfig, saveCurrentProjectConfig } from '#config'
import { logError } from '#core/utils/log'
import { getCodeStyle } from '#core/utils/style'
import { getCwd } from '#core/utils/state'
import { memoize, omit } from 'lodash-es'
import { getIsGit } from '#core/utils/git'
import { execFileNoThrow } from '#core/utils/execFileNoThrow'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import { getModelManager } from '#core/utils/model'
import { lastX } from '#core/utils/generators'
import { getGitEmail } from '#core/utils/user'
import {
  getProjectInstructionFiles,
  readAndConcatProjectInstructionFiles,
} from '#core/utils/projectInstructions'
/**
 * Locate project instruction files.
 */
export async function getInstructionFilesNote(): Promise<string | null> {
  try {
    const cwd = getCwd()
    const instructionFiles = getProjectInstructionFiles(cwd)
    const legacyPath = join(cwd, 'CLAUDE.md')
    const hasLegacy = existsSync(legacyPath)

    if (instructionFiles.length === 0 && !hasLegacy) {
      return null
    }

    const fileTypes = new Set<string>()
    for (const f of instructionFiles) fileTypes.add(f.filename)
    if (hasLegacy) fileTypes.add('CLAUDE.md (legacy)')

    const allFiles = [
      ...instructionFiles.map(f => f.absolutePath),
      ...(hasLegacy ? [legacyPath] : []),
    ]

    return `NOTE: Additional project instruction files (${Array.from(fileTypes).join(', ')}) were found. When working in these directories, make sure to read and follow the instructions in the corresponding files:\n${allFiles
      .map(_ => `- ${_}`)
      .join('\n')}`
  } catch (error) {
    logError(error)
    return null
  }
}

export function setContext(key: string, value: string): void {
  const projectConfig = getCurrentProjectConfig()
  const context = omit(
    { ...projectConfig.context, [key]: value },
    'codeStyle',
    'directoryStructure',
  )
  saveCurrentProjectConfig({ ...projectConfig, context })
}

export function removeContext(key: string): void {
  const projectConfig = getCurrentProjectConfig()
  const context = omit(
    projectConfig.context,
    key,
    'codeStyle',
    'directoryStructure',
  )
  saveCurrentProjectConfig({ ...projectConfig, context })
}

export const getReadme = memoize(async (): Promise<string | null> => {
  try {
    const readmePath = join(getCwd(), 'README.md')
    if (!existsSync(readmePath)) {
      return null
    }
    const content = await readFile(readmePath, 'utf-8')
    return content
  } catch (e) {
    logError(e)
    return null
  }
})

/**
 * Get project documentation content (AGENTS.md and legacy CLAUDE.md)
 */
export async function getProjectDocsForCwd(
  cwd: string,
): Promise<string | null> {
  try {
    const instructionFiles = getProjectInstructionFiles(cwd)
    const legacyPath = join(cwd, 'CLAUDE.md')

    const docs = []

    if (instructionFiles.length > 0) {
      const { content } = readAndConcatProjectInstructionFiles(
        instructionFiles,
        { includeHeadings: true },
      )
      if (content.trim().length > 0) docs.push(content)
    }

    // Try to read legacy CLAUDE.md (compatibility).
    if (existsSync(legacyPath)) {
      try {
        const content = await readFile(legacyPath, 'utf-8')
        docs.push(`# Legacy instructions (CLAUDE.md)\n\n${content}`)
      } catch (e) {
        logError(e)
      }
    }

    return docs.length > 0 ? docs.join('\n\n---\n\n') : null
  } catch (e) {
    logError(e)
    return null
  }
}

export const getProjectDocs = memoize(async (): Promise<string | null> => {
  return getProjectDocsForCwd(getCwd())
})

export function clearContextCache(): void {
  getReadme.cache.clear?.()
  getProjectDocs.cache.clear?.()
  getGitStatus.cache.clear?.()
  getDirectoryStructure.cache.clear?.()
  getContext.cache.clear?.()
}

export const getGitStatus = memoize(async (): Promise<string | null> => {
  if (process.env.NODE_ENV === 'test') {
    // Avoid cycles in tests
    return null
  }
  if (!(await getIsGit())) {
    return null
  }

  try {
    const [branch, mainBranch, status, log, authorLog] = await Promise.all([
      execFileNoThrow(
        'git',
        ['branch', '--show-current'],
        undefined,
        undefined,
        false,
      ).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(
        'git',
        ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
        undefined,
        undefined,
        false,
      ).then(({ stdout }) => stdout.replace('origin/', '').trim()),
      execFileNoThrow(
        'git',
        ['status', '--short'],
        undefined,
        undefined,
        false,
      ).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(
        'git',
        ['log', '--oneline', '-n', '5'],
        undefined,
        undefined,
        false,
      ).then(({ stdout }) => stdout.trim()),
      execFileNoThrow(
        'git',
        [
          'log',
          '--oneline',
          '-n',
          '5',
          '--author',
          (await getGitEmail()) || '',
        ],
        undefined,
        undefined,
        false,
      ).then(({ stdout }) => stdout.trim()),
    ])
    // Check if status has more than 200 lines
    const statusLines = status.split('\n').length
    const truncatedStatus =
      statusLines > 200
        ? status.split('\n').slice(0, 200).join('\n') +
          '\n... (truncated because there are more than 200 lines. If you need more information, run "git status" using BashTool)'
        : status

    return `This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.\nCurrent branch: ${branch}\n\nMain branch (you will usually use this for PRs): ${mainBranch}\n\nStatus:\n${truncatedStatus || '(clean)'}\n\nRecent commits:\n${log}\n\nYour recent commits:\n${authorLog || '(no recent commits)'}`
  } catch (error) {
    logError(error)
    return null
  }
})

/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
export const getContext = memoize(
  async (): Promise<{
    [k: string]: string
  }> => {
    const codeStyle = getCodeStyle()
    const projectConfig = getCurrentProjectConfig()
    const dontCrawl = projectConfig.dontCrawlDirectory
    const [
      gitStatus,
      directoryStructure,
      instructionFilesNote,
      readme,
      projectDocs,
    ] = await Promise.all([
      getGitStatus(),
      dontCrawl ? Promise.resolve('') : getDirectoryStructure(),
      dontCrawl ? Promise.resolve('') : getInstructionFilesNote(),
      getReadme(),
      getProjectDocs(),
    ])
    return {
      ...projectConfig.context,
      ...(directoryStructure ? { directoryStructure } : {}),
      ...(gitStatus ? { gitStatus } : {}),
      ...(codeStyle ? { codeStyle } : {}),
      ...(instructionFilesNote ? { instructionFilesNote } : {}),
      ...(readme ? { readme } : {}),
      ...(projectDocs ? { projectDocs } : {}),
    }
  },
)

/**
 * Approximate directory structure, to orient the model. The agent will start with this,
 * then use tools like Glob and Read to get more information.
 */
export const getDirectoryStructure = memoize(
  async function (): Promise<string> {
    let lines: string
    try {
      const entries = readdirSync(getCwd(), { withFileTypes: true })
      lines = entries
        .map(entry => `${entry.isDirectory() ? 'd' : 'f'} ${entry.name}`)
        .join('\n')
    } catch (error) {
      logError(error)
      return ''
    }

    return `Below is a snapshot of this project's file structure at the start of the conversation. This snapshot will NOT update during the conversation.

${lines}`
  },
)
