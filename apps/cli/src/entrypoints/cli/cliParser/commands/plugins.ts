import { cwd } from 'process'
import type { Command } from '@commander-js/extra-typings'

import { getCwd, setCwd } from '#core/utils/state'
import { LEGACY_PLUGIN_DIRNAME } from '#core/compat/legacyPaths'

import { registerMarketplaceCommands } from './marketplace'

const PLUGIN_SCOPES = ['user', 'project', 'local'] as const
type PluginScope = (typeof PLUGIN_SCOPES)[number]

function parsePluginScope(value: unknown): PluginScope | null {
  const normalized = String(value || 'user') as PluginScope
  return PLUGIN_SCOPES.includes(normalized) ? normalized : null
}

type PluginCwdScopeOptions = {
  cwd?: string
  scope?: string
  force?: boolean
  json?: boolean
  project?: boolean
}

export function registerPluginCommands(program: Command): void {
  const pluginCmd = program
    .command('plugin')
    .description('Manage plugins and marketplaces')

  const pluginMarketplaceCmd = pluginCmd
    .command('marketplace')
    .description(
      `Manage marketplaces (.kode-plugin/marketplace.json; legacy ${LEGACY_PLUGIN_DIRNAME} supported)`,
    )

  registerMarketplaceCommands(pluginMarketplaceCmd)

  pluginCmd
    .command('install <plugin>')
    .alias('i')
    .description(
      'Install a plugin from available marketplaces (use plugin@marketplace for specific marketplace)',
    )
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      'Installation scope: user, project, or local',
      'user',
    )
    .option('--force', 'Overwrite existing installed files', () => true)
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = installSkillPlugin(plugin, {
          scope,
          force: options.force === true,
        })

        const skillList =
          result.installedSkills.length > 0
            ? `Skills: ${result.installedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Installed ${result.pluginSpec}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  pluginCmd
    .command('uninstall <plugin>')
    .alias('remove')
    .alias('rm')
    .description('Uninstall an installed plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Uninstall from scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = uninstallSkillPlugin(plugin, { scope })
        const skillList =
          result.removedSkills.length > 0
            ? `Skills: ${result.removedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Uninstalled ${result.pluginSpec}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  pluginCmd
    .command('list')
    .description('List installed plugins')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Filter by scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .option('--json', 'Output as JSON')
    .action(async (options: PluginCwdScopeOptions) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        await setCwd(options.cwd ?? cwd())

        const { listInstalledSkillPlugins } =
          await import('#cli-services/skillMarketplace')
        const all = listInstalledSkillPlugins()
        const filteredEntries = Object.entries(all).filter(([, record]) => {
          if (!record || record.scope !== scope) return false
          if (scope === 'user') return true
          return record.projectPath === getCwd()
        })
        const filtered = Object.fromEntries(filteredEntries)

        if (options.json) {
          console.log(JSON.stringify(filtered, null, 2))
          process.exit(0)
        }

        const names = Object.keys(filtered).sort()
        if (names.length === 0) {
          console.log('No plugins installed')
          process.exit(0)
        }
        console.log(`Installed plugins (scope=${scope}):\n`)
        for (const spec of names) {
          const record = filtered[spec]
          const enabled = record?.isEnabled === false ? 'disabled' : 'enabled'
          console.log(`  - ${spec} (${enabled})`)
        }
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  pluginCmd
    .command('enable <plugin>')
    .description('Enable a disabled plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        await setCwd(options.cwd ?? cwd())

        const { enableSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = enableSkillPlugin(plugin, { scope })
        console.log(`Enabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  pluginCmd
    .command('disable <plugin>')
    .description('Disable an enabled plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        await setCwd(options.cwd ?? cwd())

        const { disableSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = disableSkillPlugin(plugin, { scope })
        console.log(`Disabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  pluginCmd
    .command('validate <path>')
    .description('Validate a plugin or marketplace manifest')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (path: string, options: PluginCwdScopeOptions) => {
      try {
        await setCwd(options.cwd ?? cwd())

        const { formatValidationResult, validatePluginOrMarketplacePath } =
          await import('#cli-services/pluginValidation')

        const result = validatePluginOrMarketplacePath(path)
        console.log(
          `Validating ${result.fileType} manifest: ${result.filePath}\n`,
        )
        console.log(formatValidationResult(result))
        process.exit(result.success ? 0 : 1)
      } catch (error) {
        console.error(
          `Unexpected error during validation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        process.exit(2)
      }
    })

  const skillsCmd = program
    .command('skills')
    .description('Manage skills and skill marketplaces')

  const marketplaceCmd = skillsCmd
    .command('marketplace')
    .description(
      `Manage skill marketplaces (.kode-plugin/marketplace.json; legacy ${LEGACY_PLUGIN_DIRNAME} supported)`,
    )

  registerMarketplaceCommands(marketplaceCmd)

  skillsCmd
    .command('install <plugin>')
    .description('Install a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Install into this project (.kode/...)', () => true)
    .option('--force', 'Overwrite existing installed files', () => true)
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = installSkillPlugin(plugin, {
          project: options.project === true,
          force: options.force === true,
        })
        const skillList =
          result.installedSkills.length > 0
            ? `Skills: ${result.installedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Installed ${plugin}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  skillsCmd
    .command('uninstall <plugin>')
    .description('Uninstall a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Uninstall from this project (.kode/...)', () => true)
    .action(async (plugin: string, options: PluginCwdScopeOptions) => {
      try {
        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('#cli-services/skillMarketplace')
        const result = uninstallSkillPlugin(plugin, {
          project: options.project === true,
        })
        const skillList =
          result.removedSkills.length > 0
            ? `Skills: ${result.removedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Uninstalled ${plugin}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  skillsCmd
    .command('list-installed')
    .description('List installed skill plugins')
    .action(async () => {
      try {
        const { listInstalledSkillPlugins } =
          await import('#cli-services/skillMarketplace')
        console.log(JSON.stringify(listInstalledSkillPlugins(), null, 2))
        process.exit(0)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })
}
