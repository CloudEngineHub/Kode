const pkg = require('./package.json');
const fs = require('fs');

const declared = new Set(Object.keys(pkg.dependencies || {}));
const used = [
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/sdk',
  '@anthropic-ai/vertex-sdk',
  '@commander-js/extra-typings',
  '@inkjs/ui',
  '@modelcontextprotocol/sdk',
  '@statsig/js-client',
  '@statsig/client-core',
  'ansi-escapes',
  'chalk',
  'cli-highlight',
  'cli-table3',
  'debug',
  'diff',
  'env-paths',
  'figures',
  'glob',
  'gray-matter',
  'ink',
  'ink-link',
  'ink-text-input',
  'lodash-es',
  'lru-cache',
  'marked',
  'nanoid',
  'node-fetch',
  'node-html-parser',
  'openai',
  'react',
  'semver',
  'shell-quote',
  'spawn-rx',
  'turndown',
  'undici',
  'wrap-ansi',
  'zod',
  'zod-to-json-schema'
];

const builtins = new Set(['child_process','crypto','fs','fs/promises','http','os','path','process','tty','url','util','module','node:fs','node:os','node:path','node:url','node:util']);
const missing = [];

used.forEach(pkg => {
  if (\!builtins.has(pkg) && \!declared.has(pkg)) {
    missing.push(pkg);
  }
});

console.log('=== MISSING DEPENDENCIES ===');
if (missing.length === 0) {
  console.log('No missing dependencies found');
} else {
  missing.forEach(pkg => console.log(pkg));
}

console.log('=== DECLARED DEPENDENCIES ===');
Array.from(declared).sort().forEach(pkg => console.log(pkg));
