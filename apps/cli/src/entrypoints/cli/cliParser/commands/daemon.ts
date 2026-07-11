import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { Command } from '@commander-js/extra-typings'

import { MACRO } from '#core/constants/macros'
import {
  DaemonRegistry,
  type DaemonRegistryEntry,
} from '#cli-services/daemonRegistry'
import { createNodeDaemonProcessController } from '#cli-services/nodeDaemonProcessController'
import { DaemonSupervisor } from '#cli-services/daemonSupervisor'

function resolveWorkspace(value: unknown): string {
  const cwd = typeof value === 'string' && value.trim() ? value : process.cwd()
  const workspace = resolve(cwd)
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    throw new Error(`Workspace directory does not exist: ${workspace}`)
  }
  return workspace
}

function defaultVersionSignature(): string {
  const version =
    MACRO.VERSION || process.env.npm_package_version || 'unknown-version'
  const runtime = process.versions.bun
    ? `bun-${process.versions.bun}`
    : `node-${process.versions.node}`
  return `${version}:${runtime}`
}

function connectionUrl(entry: DaemonRegistryEntry): string {
  const url = new URL(entry.url)
  url.searchParams.set('token', entry.token)
  return url.toString()
}

function createSupervisor(): DaemonSupervisor {
  return new DaemonSupervisor({
    registry: new DaemonRegistry(),
    controller: createNodeDaemonProcessController(),
  })
}

/** Explicit lifecycle commands; they do not change the existing --web flow. */
export function registerDaemonCommands(program: Command): void {
  const daemon = program
    .command('daemon')
    .description('Manage a workspace-scoped local Kode daemon')

  daemon
    .command('start')
    .description('Start or reuse a healthy daemon for a workspace')
    .option('--cwd <cwd>', 'Workspace directory', process.cwd())
    .option(
      '--version-signature <signature>',
      'Override the daemon compatibility signature',
      defaultVersionSignature(),
    )
    .action(async options => {
      const workspacePath = resolveWorkspace(options.cwd)
      const result = await createSupervisor().start({
        workspacePath,
        versionSignature: String(options.versionSignature ?? ''),
      })

      if (result.state === 'version_mismatch') {
        throw new Error(
          `A daemon for this workspace is already running with ${result.entry.versionSignature}; requested ${result.requestedVersionSignature}. Stop it explicitly before replacing it.`,
        )
      }
      if (result.state === 'unhealthy') {
        throw new Error(
          `The registered daemon (pid ${result.entry.pid}) failed its health probe. Inspect it or run \`kode daemon stop --force\` after verifying the PID.`,
        )
      }

      const verb = result.state === 'started' ? 'Started' : 'Reused'
      console.log(`${verb} daemon (pid ${result.entry.pid})`)
      console.log(connectionUrl(result.entry))
    })

  daemon
    .command('status')
    .description('Show daemon state without starting or stopping a process')
    .option('--cwd <cwd>', 'Workspace directory', process.cwd())
    .action(async options => {
      const status = await createSupervisor().status(
        resolveWorkspace(options.cwd),
      )
      console.log(`Daemon: ${status.state}`)
      if (status.entry) {
        console.log(`PID: ${status.entry.pid}`)
        console.log(`URL: ${status.entry.url}`)
        console.log(`Version: ${status.entry.versionSignature}`)
      }
      if (status.state === 'stale') {
        console.log(
          'Run `kode daemon stop` to remove the stale registry record.',
        )
      }
      if (status.state === 'unhealthy') {
        console.log(
          'Health probe failed. Verify the process before using `kode daemon stop --force`.',
        )
      }
    })

  daemon
    .command('stop')
    .description('Gracefully stop a verified workspace daemon')
    .option('--cwd <cwd>', 'Workspace directory', process.cwd())
    .option('--force', 'Terminate an unhealthy PID after explicit confirmation')
    .action(async options => {
      const result = await createSupervisor().stop(
        resolveWorkspace(options.cwd),
        {
          force: options.force === true,
        },
      )
      if (result.state === 'missing') {
        console.log('No daemon registry record found.')
      } else if (result.state === 'stale') {
        console.log('Removed stale daemon registry record.')
      } else {
        console.log(`Stopped daemon (pid ${result.entry.pid}).`)
      }
    })
}
