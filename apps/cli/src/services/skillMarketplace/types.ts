export type PluginScope = 'user' | 'project' | 'local'

export type InstalledSkillPlugin = {
  plugin: string
  marketplace: string
  scope: PluginScope
  kind?: 'skill-pack' | 'plugin-pack'
  isEnabled?: boolean
  projectPath?: string
  installedAt: string
  pluginRoot?: string
  skills: string[]
  commands: string[]
  sourceMarketplacePath: string
}

export type InstalledSkillPluginsFile = Record<string, InstalledSkillPlugin>
