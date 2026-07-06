'use strict';

/**
 * `gitset pr` — local BYOAI pull-request description from the branch diff.
 * Generates from `git diff <base>...<head>` + commit log, optional refine,
 * optional `gh pr create` (arg-array, no shell injection).
 *
 * Flags: --base <branch> --title <t> --provider --model
 *        --create --yes --print --json
 * Exit: 0 ok · 1 usage/git · 2 provider error.
 */
const { execFileSync } = require('child_process');
const readline = require('readline');
const genLocal = require('./generate-local');
const { suggestLabels } = require('./labels-ai');
const theme = require('../src/utils/theme');

const out = (s = '') => console.log(s);
const errln = (s) => console.error(`${theme.error('✗')} ${s}`);

function getFlag(argv, ...names) {
  for (const n of names) {
    const i = argv.indexOf(n);
    if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
  }
  return null;
}
const has = (argv, ...n) => n.some((x) => argv.includes(x));
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

const GENERIC_HEADING = /^(summary|description|overview|context|details|scope|changes|testing|steps\b.*|acceptance\b.*)$/i;
function deriveTitle(md) {
  const lines = String(md).split('\n').map((x) => x.trim());
  const clean = (l) => l.replace(/^#+\s*/, '').replace(/^(title:|\*\*)\s*/i, '').replace(/\*\*$/, '').trim();
  for (const l of lines) {
    if (/^#+\s/.test(l) && !GENERIC_HEADING.test(clean(l))) return clean(l).slice(0, 120);
  }
  return null;
}

function titleFromBranch(branch) {
  const tail = String(branch || '').split('/').pop() || 'Pull request';
  const words = tail.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Pull request';
}

async function runPrCommand(argv) {
  const json = has(argv, '--json');
  const printOnly = has(argv, '--print');
  const nonInteractive = has(argv, '--yes', '-y') || json || printOnly || !process.stdin.isTTY;

  let head;
  try { head = git(['rev-parse', '--abbrev-ref', 'HEAD']); }
  catch { errln('Not a git repository.'); return 1; }

  let base = getFlag(argv, '--base');
  if (!base) {
    for (const cand of ['main', 'master', 'develop']) {
      try { git(['rev-parse', '--verify', cand]); base = cand; break; } catch {  }
    }
    base = base || 'main';
  }
  if (base === head) { errln(`Base and head are both "${head}". Pass --base <branch>.`); return 1; }

  let diff = '';
  let commits = '';
  try {
    diff = git(['diff', `${base}...${head}`, '--no-color']);
    commits = git(['log', `${base}..${head}`, '--pretty=format:- %h %s (%an)']);
  } catch {
    errln(`Could not diff ${base}...${head}. Does base "${base}" exist?`); return 1;
  }
  if (!diff.trim()) { errln(`No changes between ${base} and ${head}.`); return 1; }

  let title = getFlag(argv, '--title');

  async function gen(previous, instruction) {
    if (!json && !printOnly) process.stderr.write(theme.dim(`… generating PR (${base}...${head})\n`));
    try {
      return await genLocal.generate({
        tool: 'pr',
        ctx: { diff, commits, previous: previous || '', instruction: instruction || '' },
        provider: getFlag(argv, '--provider'),
        model: getFlag(argv, '--model'),
        maxTokens: 4096,
        interactive: !nonInteractive,
      });
    } catch (e) {
      if (e instanceof genLocal.AIError) { errln(`AI provider error (${e.code}): ${e.message}`); throw { exit: 2 }; }
      errln(e.message); throw { exit: /gitset config/.test(e.message || '') ? 1 : 2 };
    }
  }

  let result;
  try { result = await gen(); } catch (e) { return e.exit || 2; }

  if (!title) title = deriveTitle(result.text) || titleFromBranch(head);
  let selectedLabels = [];

  if (json) { out(JSON.stringify({ title, body: result.text, base, head, provider: result.provider })); return 0; }
  if (printOnly) { out(`# ${title}\n\n${result.text}`); return 0; }

  function ensureLabel(l) {
    try { execFileSync('gh', ['label', 'create', l.name, '--color', l.color || 'ededed', '--description', l.description || ''], { stdio: 'ignore' }); } catch {  }
  }
  function create(body) {
    const args = ['pr', 'create', '--base', base, '--head', head, '--title', title, '--body', body];
    for (const l of selectedLabels) { ensureLabel(l); args.push('--label', l.name); }
    try {
      execFileSync('gh', args, { stdio: 'inherit' });
      return 0;
    } catch {
      errln('gh pr create failed (is `gh` installed & authenticated, branch pushed?).');
      return 1;
    }
  }

  if (nonInteractive) {
    if (has(argv, '--create')) return create(result.text);
    out(`# ${title}\n\n${result.text}`);
    return 0;
  }

  for (;;) {
    out();
    out(theme.bold(`${title}  ${theme.dim(`(${base} ← ${head})`)}`));
    out(theme.accent(result.text.slice(0, 1500) + (result.text.length > 1500 ? '\n… (truncated)' : '')));
    out();
    out(theme.dim(`tip: edit ~/.gitset/templates/pr.md (or run \`gitset template edit pr\`) to change the format`));
    const ch = (await ask(
      `${theme.key('c', 'reate')}  ${theme.key('l', 'abels')}  ${theme.key('r', 'efine')}  ${theme.key('g', 'regenerate')}  ${theme.key('t', 'itle')}  ${theme.key('p', 'rint')}  ${theme.key('q', 'uit')} > `,
    )).toLowerCase();
    if (ch === 'c') return create(result.text);
    if (ch === 'l') {
      try {
        let existing = '';
        try { existing = JSON.parse(execFileSync('gh', ['label', 'list', '--limit', '100', '--json', 'name'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })).map((x) => x.name).join(', '); } catch {  }
        process.stderr.write(theme.dim('… suggesting labels\n'));
        const sug = await suggestLabels({ title, body: result.text, existing, provider: getFlag(argv, '--provider'), model: getFlag(argv, '--model') });
        if (sug.length === 0) { out(theme.warn('No label suggestions.')); continue; }
        out('Suggested: ' + sug.map((l, i) => `[${i + 1}] ${l.name}`).join('  '));
        const pick = await ask('Apply which? (comma numbers, "all", or blank to skip): ');
        if (pick.toLowerCase() === 'all') selectedLabels = sug;
        else { const idx = pick.split(',').map((s) => parseInt(s.trim(), 10) - 1).filter((n) => n >= 0 && n < sug.length); selectedLabels = idx.map((i) => sug[i]); }
        if (selectedLabels.length) out(theme.success(`✓ labels: ${selectedLabels.map((l) => l.name).join(', ')}`));
      } catch (e) { errln(e.message); }
      continue;
    }
    if (ch === 'q' || ch === '') { out('Aborted.'); return 0; }
    if (ch === 't') { const t = await ask('New title: '); if (t) title = t; continue; }
    if (ch === 'p') { out(`# ${title}\n\n${result.text}`); continue; }
    if (ch === 'g') { try { result = await gen(); } catch (e) { return e.exit || 2; } continue; }
    if (ch === 'r') {
      const instr = await ask('Refinement instruction: ');
      if (instr) { try { result = await gen(result.text, instr); } catch (e) { return e.exit || 2; } }
      continue;
    }
    out(theme.warn('Unrecognized option.'));
  }
}

module.exports = { runPrCommand };
