import type { SimpleRule } from './bashGateRules'

export const SIMPLE_RULES: SimpleRule[] = [
  // Privilege escalation / identity
  {
    code: 'PRIV_SUDO',
    severity: 'high',
    category: 'privilege',
    title: 'sudo escalates privileges',
    patterns: [/\bsudo\b/i],
  },
  {
    code: 'PRIV_SU',
    severity: 'high',
    category: 'privilege',
    title: 'su changes user identity',
    patterns: [/\bsu\b(\s|$)/i],
  },
  {
    code: 'PRIV_SUDOERS',
    severity: 'high',
    category: 'privilege',
    title: 'modifies sudoers policy',
    patterns: [/\/etc\/sudoers(\.d\/[^\s]+)?/i],
  },

  // System power / service management
  {
    code: 'SYS_SHUTDOWN',
    severity: 'high',
    category: 'system',
    title: 'shutdown/reboot/poweroff',
    patterns: [/\b(shutdown|reboot|poweroff|halt|init\s+0)\b/i],
  },
  {
    code: 'SYS_SYSTEMCTL_STOP',
    severity: 'high',
    category: 'system',
    title: 'systemctl stop/disable/mask can break services',
    patterns: [/\bsystemctl\b[^\n]*\b(stop|disable|mask)\b/i],
  },

  // Filesystem / disk destructive operations
  {
    code: 'FS_MKFS',
    severity: 'high',
    category: 'fs_delete',
    title: 'mkfs formats filesystems',
    patterns: [/\bmkfs(\.[a-z0-9]+)?\b/i],
  },
  {
    code: 'FS_PARTITION',
    severity: 'high',
    category: 'fs_delete',
    title: 'disk partitioning tools',
    patterns: [/\b(fdisk|parted|sfdisk|gdisk)\b/i],
  },
  {
    code: 'FS_WIPE',
    severity: 'high',
    category: 'fs_delete',
    title: 'secure wipe/destructive disk ops',
    patterns: [/\b(shred|wipefs|blkdiscard)\b/i],
  },
  {
    code: 'FS_DD_OF',
    severity: 'high',
    category: 'fs_delete',
    title: 'dd writes to output target (of=...)',
    patterns: [/\bdd\b[^\n]*\bof=\S+/i],
  },

  // Remote fetch + exec / code execution
  {
    code: 'RCE_PIPE_TO_SHELL',
    severity: 'high',
    category: 'remote_exec',
    title: 'pipe remote content into shell',
    patterns: [/\b(curl|wget)\b[^\n]*\|\s*(bash|sh)\b/i],
  },
  {
    code: 'RCE_EVAL',
    severity: 'high',
    category: 'remote_exec',
    title: 'eval executes arbitrary code',
    patterns: [/\beval\b/i],
  },
  {
    code: 'RCE_SOURCE_SUBSTITUTION',
    severity: 'high',
    category: 'remote_exec',
    title: 'source of process substitution executes command output',
    patterns: [/\b(source|\.)\b[^\n]*<\(/i],
  },
  {
    code: 'EXEC_SOURCE_FILE',
    severity: 'medium',
    category: 'remote_exec',
    title: 'sources a file into the current shell',
    patterns: [
      /\bsource\b\s+(?!<\()\S+/i,
      /(^|[;&|()\s])\.\s+(?!<\()\S+/i,
    ],
  },
  {
    code: 'RCE_BASE64',
    severity: 'high',
    category: 'remote_exec',
    title: 'decode then execute',
    patterns: [/\bbase64\b[^\n]*\s+-d\b[^\n]*\|\s*(bash|sh)\b/i],
  },
  {
    code: 'RCE_ONE_LINER',
    severity: 'medium',
    category: 'remote_exec',
    title: 'interpreter one-liner execution',
    patterns: [
      /\bpython3?\b\s+-c\b/i,
      /\bperl\b\s+-e\b/i,
      /\bruby\b\s+-e\b/i,
      /\bnode\b\s+-e\b/i,
    ],
  },

  // Persistence / startup modification
  {
    code: 'PERSIST_RC',
    severity: 'high',
    category: 'persistence',
    title: 'modifies shell startup files',
    patterns: [/~\/\.(bashrc|zshrc|profile|bash_profile)\b/i],
  },
  {
    code: 'PERSIST_CRON',
    severity: 'high',
    category: 'persistence',
    title: 'modifies cron jobs',
    patterns: [/\bcrontab\b/i, /\/etc\/cron\./i, /cron\.d/i],
  },
  {
    code: 'PERSIST_SYSTEMD',
    severity: 'high',
    category: 'persistence',
    title: 'modifies systemd units',
    patterns: [/\/etc\/systemd\/system\//i, /\bsystemctl\b[^\n]*\benable\b/i],
  },

  // Credentials / secrets access
  {
    code: 'CRED_SSH',
    severity: 'high',
    category: 'credentials',
    title: 'SSH key material access',
    patterns: [/~\/\.ssh\//i, /\/etc\/ssh\//i],
  },
  {
    code: 'CRED_SHADOW',
    severity: 'high',
    category: 'credentials',
    title: 'reads /etc/shadow',
    patterns: [/\/etc\/shadow\b/i],
  },
  {
    code: 'CRED_ENV_FILE',
    severity: 'high',
    category: 'credentials',
    title: 'reads .env secrets file',
    patterns: [
      /(\s|^)(cat|sed|awk|perl|python3?)\b[^\n]*\s+(\.\/)?\.env(\s|$)/i,
      /(^|\/)\.env(\.|$)/i,
    ],
  },

  // Infra destroy
  {
    code: 'INFRA_KUBECTL_DELETE',
    severity: 'high',
    category: 'infra_destroy',
    title: 'kubectl delete can destroy cluster resources',
    patterns: [/\bkubectl\b[^\n]*\bdelete\b/i],
  },
  {
    code: 'INFRA_TERRAFORM_DESTROY',
    severity: 'high',
    category: 'infra_destroy',
    title: 'terraform destroy destroys infrastructure',
    patterns: [/\bterraform\b[^\n]*\bdestroy\b/i],
  },
  {
    code: 'INFRA_PULUMI_DESTROY',
    severity: 'high',
    category: 'infra_destroy',
    title: 'pulumi destroy destroys infrastructure',
    patterns: [/\bpulumi\b[^\n]*\bdestroy\b/i],
  },

  // Containers / data loss
  {
    code: 'DOCKER_PRUNE',
    severity: 'medium',
    category: 'container',
    title: 'docker prune can delete data',
    patterns: [/\bdocker\b[^\n]*\b(system\s+prune|volume\s+rm)\b/i],
  },

  // Package removal
  {
    code: 'PKG_REMOVE',
    severity: 'medium',
    category: 'pkg',
    title: 'package removal/purge can break environment',
    patterns: [
      /\bapt(-get)?\b[^\n]*\b(remove|purge)\b/i,
      /\byum\b[^\n]*\bremove\b/i,
      /\bdnf\b[^\n]*\bremove\b/i,
      /\bpacman\b[^\n]*\b-R(ns)?\b/i,
      /\bnpm\b[^\n]*\buninstall\b/i,
      /\bpnpm\b[^\n]*\bremove\b/i,
      /\byarn\b[^\n]*\bremove\b/i,
    ],
  },

  // Obfuscation / shell bomb
  {
    code: 'OBF_FORK_BOMB',
    severity: 'high',
    category: 'obfuscation',
    title: 'fork bomb pattern',
    patterns: [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:/],
  },
]
