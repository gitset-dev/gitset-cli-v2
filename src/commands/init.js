'use strict';

/**
 * `gitset init` — scaffold local template files in ~/.gitset/templates.
 * No auth, no backend (Gitset v2 is BYOAI: there is no login).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const theme = require('../utils/theme');

const DIR = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
const TPL_DIR = path.join(DIR, 'templates');

const TEMPLATES = {
  'commit.md': `# Commit style\nUse Conventional Commits. Imperative subject <= 72 chars.\nBody explains the WHY for non-trivial changes.\n`,
  'pr.md': `## Summary\n\n## Changes\n\n## Testing\n`,
  'issue.md': `## Summary\n\n## Steps / Acceptance criteria\n\n## Scope\n`,
  'readme.md': `# {{project}}\n\n> short description\n\n## Install\n\n## Usage\n`,
  'release.md': `## Highlights\n\n## Features\n\n## Fixes\n`,
};

function runInitCommand() {
  fs.mkdirSync(TPL_DIR, { recursive: true, mode: 0o700 });
  let created = 0;
  for (const [name, body] of Object.entries(TEMPLATES)) {
    const f = path.join(TPL_DIR, name);
    if (!fs.existsSync(f)) { fs.writeFileSync(f, body); created++; }
  }
  console.log(`${theme.success('✓')} Templates ready at ${TPL_DIR} (${created} created, ${Object.keys(TEMPLATES).length - created} existing)`);
  console.log(theme.bold('\nGitset is BYOAI — no login required. Next:'));
  console.log(`  ${theme.accent('gitset config')}                setup wizard (or gitset config set <provider> --key <key>)`);
  console.log(`  ${theme.accent('gitset commit')}                generate from staged changes`);
  console.log(`  ${theme.accent('gitset template edit commit')}  customize this tool's format\n`);
  return 0;
}

module.exports = { runInitCommand };
