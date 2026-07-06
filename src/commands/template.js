'use strict';

/**
 * `gitset template` — manage LOCAL templates in ~/.gitset/templates.
 * No remote template library (that was the old hosted system).
 *   gitset template list
 *   gitset template show <name>
 *   gitset template edit <name>
 *   gitset template path
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const theme = require('../utils/theme');

const DIR = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
const TPL_DIR = path.join(DIR, 'templates');
const KNOWN_TOOLS = ['commit', 'pr', 'issue', 'readme', 'release'];

const DEFAULTS = {
  'commit.md': `# Commit style\nUse Conventional Commits. Imperative subject <= 72 chars.\nBody explains the WHY for non-trivial changes.\n`,
  'pr.md': `## Summary\n\n## Changes\n\n## Testing\n`,
  'issue.md': `## Summary\n\n## Steps / Acceptance criteria\n\n## Scope\n`,
  'readme.md': `# {{project}}\n\n> short description\n\n## Install\n\n## Usage\n`,
  'release.md': `## Highlights\n\n## Features\n\n## Fixes\n`,
};

function listFiles() {
  try { return fs.readdirSync(TPL_DIR).filter((f) => f.endsWith('.md')).sort(); }
  catch { return []; }
}

function runTemplateCommand(argv) {
  const sub = argv[0] || 'list';

  if (sub === 'path') { console.log(TPL_DIR); return 0; }

  if (sub === 'list') {
    const files = listFiles();
    if (files.length === 0) {
      console.log(`No local templates. Run ${theme.accent('gitset init')} to scaffold them, or ${theme.accent('gitset template edit <tool>')} to create one now.`);
      return 0;
    }
    console.log(theme.bold(`Local templates (${TPL_DIR}):`));
    for (const f of files) console.log(`  ${f.replace(/\.md$/, '')}`);
    console.log();
    console.log(theme.dim('gitset template edit <name>   open one in your editor'));
    return 0;
  }

  if (sub === 'show') {
    const name = argv[1];
    if (!name) { console.error(`${theme.error('✗')} Usage: gitset template show <name>`); return 1; }
    const f = path.join(TPL_DIR, name.endsWith('.md') ? name : `${name}.md`);
    if (!fs.existsSync(f)) { console.error(`${theme.error('✗')} No template "${name}". Try: gitset template list`); return 1; }
    process.stdout.write(fs.readFileSync(f, 'utf8'));
    return 0;
  }

  if (sub === 'edit') {
    const name = argv[1];
    if (!name) {
      console.error(`${theme.error('✗')} Usage: gitset template edit <${KNOWN_TOOLS.join('|')}>`);
      return 1;
    }
    const base = name.endsWith('.md') ? name : `${name}.md`;
    const f = path.join(TPL_DIR, base);
    if (!fs.existsSync(f)) {
      fs.mkdirSync(TPL_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(f, DEFAULTS[base] || `# ${name} template\n`);
      console.log(theme.dim(`Created ${f} from the default.`));
    }
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (!editor) {
      console.log(`No $EDITOR set. Open it yourself:\n  ${f}`);
      return 0;
    }
    const result = spawnSync(editor, [f], { stdio: 'inherit' });
    if (result.error) {
      console.error(`${theme.error('✗')} Could not launch "${editor}". Edit the file directly:\n  ${f}`);
      return 1;
    }
    console.log(`${theme.success('✓')} Saved ${base.replace(/\.md$/, '')} template.`);
    return 0;
  }

  console.error(`${theme.error('✗')} Unknown subcommand "${sub}". Use: list | show <name> | edit <name> | path`);
  return 1;
}

module.exports = { runTemplateCommand };
