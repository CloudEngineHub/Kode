import { basename, dirname, relative, sep } from 'path'

export function isSkillMarkdownFile(filePath: string): boolean {
  return /^skill\.md$/i.test(basename(filePath))
}

export function sourceLabel(
  source: 'localSettings' | 'userSettings' | 'pluginDir',
): string {
  if (source === 'localSettings') return 'project'
  if (source === 'userSettings') return 'user'
  if (source === 'pluginDir') return 'plugin'
  return 'unknown'
}

function namespaceFromDirPath(dirPath: string, baseDir: string): string {
  const relPath = relative(baseDir, dirPath)
  if (!relPath || relPath === '.' || relPath.startsWith('..')) return ''
  return relPath.split(sep).join(':')
}

export function nameForCommandFile(filePath: string, baseDir: string): string {
  if (isSkillMarkdownFile(filePath)) {
    const skillDir = dirname(filePath)
    const parentDir = dirname(skillDir)
    const skillName = basename(skillDir)
    const namespace = namespaceFromDirPath(parentDir, baseDir)
    return namespace ? `${namespace}:${skillName}` : skillName
  }

  const dir = dirname(filePath)
  const namespace = namespaceFromDirPath(dir, baseDir)
  const fileName = basename(filePath).replace(/\.md$/i, '')
  return namespace ? `${namespace}:${fileName}` : fileName
}

export function buildPluginQualifiedName(
  pluginName: string,
  localName: string,
): string {
  const p = pluginName.trim()
  const l = localName.trim()
  if (!p) return l
  if (!l || l === p) return p
  return `${p}:${l}`
}

export function nameForPluginCommandFile(
  filePath: string,
  commandsDir: string,
  pluginName: string,
): string {
  const rel = relative(commandsDir, filePath)
  const noExt = rel.replace(/\.md$/i, '')
  const localName = noExt.split(sep).filter(Boolean).join(':')
  return buildPluginQualifiedName(pluginName, localName)
}
