import type { Command } from '@commander-js/extra-typings'
import { cwd } from 'process'

export function registerPluginAndSkillsCommands(program: Command): void {
  const registerMarketplaceCommands = (marketplaceCmd: Command) => {
    marketplaceCmd
      .command('add <source>')
      .description('Add a marketplace from a URL, path, or GitHub repo')
      .action(async (source: string) => {
        try {
          const { addMarketplace } = await import('@services/skillMarketplace')
          console.log('Adding marketplace...')
          const { name } = await addMarketplace(source)
          console.log(`Successfully added marketplace: ${name}`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('list')
      .description('List all configured marketplaces')
      .option('--json', 'Output as JSON')
      .action(async (options: { json?: boolean }) => {
        try {
          const { listMarketplaces } =
            await import('@services/skillMarketplace')
          const marketplaces = listMarketplaces()

          if (options.json) {
            console.log(JSON.stringify(marketplaces, null, 2))
            process.exit(0)
          }

          const names = Object.keys(marketplaces).sort()
          if (names.length === 0) {
            console.log('No marketplaces configured')
            process.exit(0)
          }

          console.log('Configured marketplaces:\n')
          for (const name of names) {
            const entry = marketplaces[name] as any
            console.log(`  - ${name}`)
            const src = entry?.source
            if (src?.source === 'github') {
              console.log(`    Source: GitHub (${src.repo})`)
            } else if (src?.source === 'git') {
              console.log(`    Source: Git (${src.url})`)
            } else if (src?.source === 'url') {
              console.log(`    Source: URL (${src.url})`)
            } else if (src?.source === 'directory') {
              console.log(`    Source: Directory (${src.path})`)
            } else if (src?.source === 'file') {
              console.log(`    Source: File (${src.path})`)
            } else if (src?.source === 'npm') {
              console.log(`    Source: NPM (${src.package})`)
            }
            console.log('')
          }

          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('remove <name>')
      .alias('rm')
      .description('Remove a configured marketplace')
      .action(async (name: string) => {
        try {
          const { removeMarketplace } =
            await import('@services/skillMarketplace')
          removeMarketplace(name)
          console.log(`Successfully removed marketplace: ${name}`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('update [name]')
      .description(
        'Update marketplace(s) from their source - updates all if no name specified',
      )
      .action(async (name: string | undefined, _options: any) => {
        try {
          const {
            listMarketplaces,
            refreshAllMarketplacesAsync,
            refreshMarketplaceAsync,
          } = await import('@services/skillMarketplace')

          const trimmed = typeof name === 'string' ? name.trim() : ''
          if (trimmed) {
            console.log(`Updating marketplace: ${trimmed}...`)
            await refreshMarketplaceAsync(trimmed)
            console.log(`Successfully updated marketplace: ${trimmed}`)
            process.exit(0)
          }

          const marketplaces = listMarketplaces()
          const names = Object.keys(marketplaces)
          if (names.length === 0) {
            console.log('No marketplaces configured')
            process.exit(0)
          }

          console.log(`Updating ${names.length} marketplace(s)...`)
          await refreshAllMarketplacesAsync(message => {
            console.log(message)
          })
          console.log(`Successfully updated ${names.length} marketplace(s)`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })
  }

  const pluginCmd = program
    .command('plugin')
    .description('Manage plugins and marketplaces')

  const pluginMarketplaceCmd = pluginCmd
    .command('marketplace')
    .description(
      'Manage marketplaces (.kode-plugin/marketplace.json; legacy .claude-plugin supported)',
    )

  registerMarketplaceCommands(pluginMarketplaceCmd)

  const PLUGIN_SCOPES = ['user', 'project', 'local'] as const
  type PluginScope = (typeof PLUGIN_SCOPES)[number]

  const parsePluginScope = (value: unknown): PluginScope | null => {
    const normalized = String(value || 'user') as PluginScope
    return PLUGIN_SCOPES.includes(normalized) ? normalized : null
  }

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
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('@services/skillMarketplace')
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
        console.error((error as Error).message)
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
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = uninstallSkillPlugin(plugin, { scope })
        const skillList =
          result.removedSkills.length > 0
            ? `Skills: ${result.removedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Uninstalled ${result.pluginSpec}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
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
    .action(async (options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd, getCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { listInstalledSkillPlugins } =
          await import('@services/skillMarketplace')
        const all = listInstalledSkillPlugins()
        const filtered = Object.fromEntries(
          Object.entries(all).filter(([, record]) => {
            if ((record as any)?.scope !== scope) return false
            if (scope === 'user') return true
            return (record as any)?.projectPath === getCwd()
          }),
        )

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
          const record = filtered[spec] as any
          const enabled = record?.isEnabled === false ? 'disabled' : 'enabled'
          console.log(`  - ${spec} (${enabled})`)
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
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
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { enableSkillPlugin } = await import('@services/skillMarketplace')
        const result = enableSkillPlugin(plugin, { scope })
        console.log(`Enabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
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
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { disableSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = disableSkillPlugin(plugin, { scope })
        console.log(`Disabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('validate <path>')
    .description('Validate a plugin or marketplace manifest')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (path: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { formatValidationResult, validatePluginOrMarketplacePath } =
          await import('@services/pluginValidation')

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
      'Manage skill marketplaces (.kode-plugin/marketplace.json; legacy .claude-plugin supported)',
    )

  registerMarketplaceCommands(marketplaceCmd)

  skillsCmd
    .command('install <plugin>')
    .description('Install a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Install into this project (.kode/...)', () => true)
    .option('--force', 'Overwrite existing installed files', () => true)
    .action(async (plugin: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('@services/skillMarketplace')
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
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  skillsCmd
    .command('uninstall <plugin>')
    .description('Uninstall a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Uninstall from this project (.kode/...)', () => true)
    .action(async (plugin: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('@services/skillMarketplace')
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
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  skillsCmd
    .command('list-installed')
    .description('List installed skill plugins')
    .action(async () => {
      try {
        const { listInstalledSkillPlugins } =
          await import('@services/skillMarketplace')
        console.log(JSON.stringify(listInstalledSkillPlugins(), null, 2))
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })
}
