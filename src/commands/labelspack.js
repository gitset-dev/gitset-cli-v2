'use strict';

/**
 * `gitset labelspack` — manage & apply a label pack. Local pack +
 * the user's `gh` CLI only. No backend, injection-safe (arg-array exec).
 *
 *   gitset labelspack             list the pack
 *   gitset labelspack --apply     create/update those labels in the repo via gh
 *   gitset labelspack --init      write the default pack to ~/.gitset/labels.md
 *   gitset labelspack --from-repo import the current repo's labels into the pack
 *   gitset labelspack --add --name x --color hex --description "..."
 */
const { execFileSync } = require('child_process');
const readline = require('readline');
const { getLabels, addLabel, writeDefaultPack, writePack, getRepoLabels } = require('../utils/labels');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);
const ask = (q) => new Promise((r) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); r(a.trim()); });
});
const flag = (argv, n) => {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

function ghAvailable() {
  try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

async function runLabelspackCommand(argv) {
  if (argv.includes('--init')) {
    const f = writeDefaultPack();
    console.log(`${c('32', '✓')} Wrote default label pack → ${f}`);
    return 0;
  }

  if (argv.includes('--from-repo') || argv.includes('--sync')) {
    if (!ghAvailable()) {
      console.error(`${c('31', '✗')} GitHub CLI \`gh\` not found / not authenticated.`);
      return 1;
    }
    const repoLabels = getRepoLabels();
    if (repoLabels.length === 0) {
      console.error(`${c('31', '✗')} No labels found — run this inside a repository your \`gh\` account can access.`);
      return 1;
    }
    const { source, labels: current } = getLabels();
    if (source.startsWith('local') && !argv.includes('--yes') && !argv.includes('-y')) {
      if (!process.stdin.isTTY) {
        console.error(`${c('31', '✗')} A label pack already exists (${current.length} labels). Pass --yes to overwrite.`);
        return 1;
      }
      const ok = (await ask(`Overwrite your existing pack (${current.length} labels) with ${repoLabels.length} labels from this repo? [y/N] `)).toLowerCase();
      if (ok !== 'y') { console.log('Aborted.'); return 0; }
    }
    const imported = repoLabels.map((l) => ({
      name: l.name,
      color: String(l.color || '').replace('#', ''),
      description: l.description || '',
    }));
    const f = writePack(imported);
    console.log(`${c('32', '✓')} Imported ${imported.length} labels from this repository → ${f}`);
    console.log(c('90', 'Apply them to any other repo:  cd <repo> && gitset labelspack --apply'));
    return 0;
  }

  if (argv.includes('--add')) {
    let name = flag(argv, '--name');
    let color = flag(argv, '--color');
    let description = flag(argv, '--description');
    if (!name) {
      if (!process.stdin.isTTY) { console.error(`${c('31', '✗')} --add needs --name (and optionally --color/--description).`); return 1; }
      name = await ask('Label name: ');
      color = await ask('Color (hex, blank=random): ');
      description = await ask('Description: ');
    }
    if (!name) { console.error(`${c('31', '✗')} Name required.`); return 1; }
    addLabel({ name, color: color || '', description: description || '' });
    console.log(`${c('32', '✓')} Added "${name}" to the pack.`);
    return 0;
  }

  const { source, labels } = getLabels();

  if (!argv.includes('--apply')) {
    console.log(c('1', `\nLabel pack (${source}) — ${labels.length} labels\n`));
    for (const l of labels) {
      console.log(`  ${c('36', l.name)}${l.description ? `  ${c('90', l.description)}` : ''}`);
    }
    console.log(c('90', '\nApply to the current repo:  gitset labelspack --apply\n'));
    return 0;
  }

  if (!ghAvailable()) {
    console.error(`${c('31', '✗')} GitHub CLI \`gh\` not found / not authenticated.`);
    return 1;
  }
  if (!process.stdin.isTTY || argv.includes('--yes') || argv.includes('-y')) {
  } else {
    const ok = (await ask(`Apply ${labels.length} labels (${source}) to the current repo? [y/N] `)).toLowerCase();
    if (ok !== 'y') { console.log('Aborted.'); return 0; }
  }

  const existing = new Set(getRepoLabels().map((l) => l.name));
  let created = 0; let updated = 0; let failed = 0;
  for (const l of labels) {
    const color = String(l.color || '').replace('#', '') || 'ededed';
    const sub = existing.has(l.name) ? 'edit' : 'create';
    try {
      execFileSync('gh', ['label', sub, l.name, '--color', color, '--description', l.description || ''],
        { stdio: 'ignore' });
      if (sub === 'create') { created++; console.log(`${c('32', '✓')} created ${l.name}`); }
      else { updated++; console.log(`${c('36', '↻')} updated ${l.name}`); }
    } catch {
      failed++;
      console.error(`${c('31', '✗')} failed ${l.name}`);
    }
  }
  console.log(c('1', `\n${created} created · ${updated} updated · ${failed} failed`));
  return failed > 0 ? 1 : 0;
}

module.exports = { runLabelspackCommand };
