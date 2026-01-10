# Versioning & Deprecation Policy

Kode follows **Semantic Versioning** for its public interfaces.

This document defines what is considered “public/stable”, what counts as a breaking change, and how deprecations should be handled.

## Public Interfaces (stability surface)

Kode considers the following as public contracts:

- **CLI surface**
  - Commands, flags, option names, defaults, exit codes, and user-visible help text ordering for stable flags.
  - `kode --help-lite` output is treated as a stable compatibility contract.
- **Protocols**
  - `stream-json` output format (used by print mode / daemon WS events).
  - ACP/MCP schemas and method/tool surfaces, where documented.
- **On-disk formats**
  - `.kode/**` layouts (and documented legacy `.claude/**` compatibility).
  - Settings/config JSON schemas where documented.

Anything not documented may still be relied upon by users; changes should be treated cautiously and guarded by tests.

## Semantic Versioning

- **MAJOR**: breaking changes to any public interface.
- **MINOR**: backwards-compatible additions (new features, new optional flags, new tools).
- **PATCH**: bug fixes and internal refactors with no user-visible changes.

## What counts as breaking

Examples of breaking changes:

- Removing or renaming a CLI command/flag, changing defaults, or changing help output for stable flags.
- Changing `--help-lite` output.
- Changing `stream-json` message shapes in a way that breaks existing consumers.
- Changing config file keys/meaning without a migration path.
- Changing tool registry names/order where consumers rely on stable naming.

## Additive changes (non-breaking)

Allowed without a MAJOR bump:

- Adding new optional CLI flags **when opt-in and not affecting default behavior**.
- Adding new tools or providers (as long as existing defaults/flows remain unchanged).
- Adding new protocol event variants while keeping existing variants valid.

## Deprecation process

When deprecating a public interface:

1. **Document** the deprecation and replacement in `docs/`.
2. Keep the deprecated behavior working for at least one MINOR release cycle.
3. Provide a clear migration path (replacement flag/command/config).
4. Only remove it in a MAJOR release, unless it is unsafe and must be removed immediately.

## Enforcement (tests as contracts)

Kode uses contract tests to freeze key public surfaces (CLI help, tool lists, protocol schemas). Any refactor must keep these tests passing unless intentionally making a breaking change and bumping MAJOR.
