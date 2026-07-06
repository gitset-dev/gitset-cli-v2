'use strict';

/**
 * `gitset status` — local environment status. No backend, no gitset_key.
 * Shows git state + configured BYOAI providers + vendored AI core.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../../lib/config');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);
const git = (args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

function runStatusCommand() {
  console.log(c('1', '\nGitset — status\n'));

  const inRepo = git(['rev-parse', '--is-inside-work-tree']) === 'true';
  if (inRepo) {
    const branch = git(['branch', '--show-current'])
      || git(['symbolic-ref', '--short', 'HEAD'])
      || 'HEAD (detached)';
    const porcelain = git(['status', '--porcelain']) || '';
    const lines = porcelain ? porcelain.split('\n') : [];
    const staged = lines.filter((l) => l[0] && l[0] !== ' ' && l[0] !== '?').length;
    const modified = lines.filter((l) => l[1] && l[1] !== ' ').length;
    const untracked = lines.filter((l) => l.startsWith('??')).length;
    console.log(`${c('36', 'git')}      branch ${c('1', branch)} · ${staged} staged · ${modified} modified · ${untracked} untracked`);
  } else {
    console.log(`${c('36', 'git')}      ${c('33', 'not a git repository')}`);
  }

  let providers = [];
  try { providers = config.list(); } catch { providers = []; }
  if (providers.length === 0) {
    console.log(`${c('36', 'ai')}       ${c('33', 'no provider configured')} — run: gitset config set <provider> --key <key>`);
  } else {
    for (const p of providers) {
      const def = p.isDefault ? c('32', ' (default)') : '';
      const key = p.keyLast4 ? `••••${p.keyLast4}` : c('33', 'no key');
      console.log(`${c('36', 'ai')}       ${p.provider}${def} — ${key}${p.model ? ` · ${p.model}` : ''}`);
    }
  }
  console.log(`${c('36', 'config')}   ${config.FILE}`);

  const aiOk = fs.existsSync(path.join(__dirname, '..', '..', 'lib', 'ai', 'index.js'));
  console.log(`${c('36', 'core')}     vendored lib/ai ${aiOk ? c('32', 'present') : c('31', 'MISSING (run: pnpm sync:ai)')}`);
  console.log();
  return 0;
}

module.exports = { runStatusCommand };
