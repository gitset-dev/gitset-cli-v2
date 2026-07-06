'use strict';

/**
 * `gitset commit` — local, BYOAI commit-message generation with iterative
 * refinement. No backend, key never leaves the machine.
 *
 * Flags:
 *   --provider <name>   override default provider for this run
 *   --model <name>      override model
 *   --style <name>      commit style (default: conventional)
 *   --all, -a           `git add -A` before generating
 *   --yes, -y           non-interactive: accept first message and commit
 *   --json              machine output ({message,provider,model}); implies -y-less (no commit)
 *   --print             print the message only; do not commit
 *
 * Exit codes: 0 ok · 1 usage/git error · 2 AI provider error.
 */
const { execFileSync, spawnSync } = require('child_process');
const readline = require('readline');
const config = require('./config');
const { getStagedChanges, generateCommitMessage, AIError } = require('./commit-local');
const theme = require('../src/utils/theme');

const out = (s = '') => console.log(s);
const errln = (s) => console.error(`${theme.error('✗')} ${s}`);

function getFlag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
}
const hasFlag = (argv, ...names) => names.some((n) => argv.includes(n));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function runCommitCommand(argv) {
  const json = hasFlag(argv, '--json');
  const printOnly = hasFlag(argv, '--print');
  const nonInteractive = hasFlag(argv, '--yes', '-y') || json || printOnly || !process.stdin.isTTY;

  let providerCfg;
  try {
    providerCfg = await config.ensureConfigured(getFlag(argv, '--provider'), { interactive: !nonInteractive });
  } catch (e) {
    errln(e.message);
    return 1;
  }

  if (hasFlag(argv, '--all', '-a')) {
    try {
      execFileSync('git', ['add', '-A'], { stdio: 'ignore' });
    } catch {
      errln('`git add -A` failed — is this a git repository?');
      return 1;
    }
  }

  let changes;
  try {
    changes = getStagedChanges();
  } catch (e) {
    errln(e.message);
    return 1;
  }
  if (!changes.diff.trim()) {
    errln('Nothing staged. Stage changes with `git add` (or pass --all).');
    return 1;
  }

  const style = getFlag(argv, '--style') || 'conventional';
  const model = getFlag(argv, '--model');
  const baseCfg = model ? { ...providerCfg, model } : providerCfg;

  async function gen(previous, instruction) {
    try {
      if (!json && !printOnly) process.stderr.write(theme.dim(`… generating via ${providerCfg.provider} (${baseCfg.model || 'default model'})\n`));
      return await generateCommitMessage({
        providerCfg: baseCfg, diff: changes.diff, stats: changes.stat, style, previous, instruction,
      });
    } catch (e) {
      if (e instanceof AIError) { errln(`AI provider error (${e.code}): ${e.message}`); throw { exit: 2 }; }
      if (e.code === 'NO_STAGED_CHANGES') { errln(e.message); throw { exit: 1 }; }
      errln(e.message || 'Generation failed'); throw { exit: 2 };
    }
  }

  let result;
  try {
    result = await gen();
  } catch (e) {
    return e.exit || 2;
  }

  if (json) {
    out(JSON.stringify({ message: result.message, provider: result.provider, model: result.model }));
    return 0;
  }
  if (printOnly) { out(result.message); return 0; }

  function doCommit(message) {
    const r = spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
    return r.status === 0 ? 0 : 1;
  }

  if (nonInteractive) {
    out(result.message);
    return doCommit(result.message);
  }

  for (;;) {
    out();
    out(theme.bold('Proposed commit message:'));
    out(theme.accent(result.message.split('\n').map((l) => `  ${l}`).join('\n')));
    out();
    out(theme.dim('tip: edit ~/.gitset/templates/commit.md (or run `gitset template edit commit`) to change the style'));
    const choice = (await ask(
      `${theme.key('a', 'ccept')}  ${theme.key('r', 'efine')}  ${theme.key('g', 'regenerate')}  ${theme.key('e', 'dit')}  ${theme.key('q', 'uit')} > `,
    )).toLowerCase();

    if (choice === 'a' || choice === '') return doCommit(result.message);
    if (choice === 'q') { out('Aborted. Nothing committed.'); return 0; }
    if (choice === 'e') {
      const edited = await ask('New message: ');
      if (edited) return doCommit(edited);
      continue;
    }
    if (choice === 'g') {
      try { result = await gen(); } catch (e) { return e.exit || 2; }
      continue;
    }
    if (choice === 'r') {
      const instruction = await ask('Refinement instruction: ');
      if (!instruction) continue;
      try { result = await gen(result.message, instruction); } catch (e) { return e.exit || 2; }
      continue;
    }
    out(theme.warn('Unrecognized option.'));
  }
}

module.exports = { runCommitCommand };
