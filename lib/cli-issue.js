'use strict';

/**
 * `gitset issue` — local BYOAI GitHub issue drafting.
 * Generates a markdown issue from a description (+ optional repo context),
 * optional interactive refine, optional `gh issue create` (arg-array, no shell).
 *
 * Flags: --title <t> --message/-m <desc> --provider --model
 *        --create (gh issue create) --yes --print --json
 * Exit: 0 ok · 1 usage · 2 provider error.
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

const GENERIC_HEADING = /^(summary|description|overview|context|details|scope|changes|testing|steps\b.*|acceptance\b.*)$/i;
function deriveTitle(markdown) {
  const lines = String(markdown).split('\n').map((l) => l.trim());
  const clean = (l) => l.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
  for (const l of lines) {
    if (/^#+\s/.test(l) && !GENERIC_HEADING.test(clean(l))) return clean(l).slice(0, 120);
  }
  return null;
}

async function runIssueCommand(argv) {
  const json = has(argv, '--json');
  const printOnly = has(argv, '--print');
  const nonInteractive = has(argv, '--yes', '-y') || json || printOnly || !process.stdin.isTTY;

  let description = getFlag(argv, '--message', '-m');
  if (!description) {
    if (nonInteractive) { errln('Provide an issue description with --message "<text>".'); return 1; }
    description = await ask('Describe the issue: ');
  }
  if (!description) { errln('An issue description is required.'); return 1; }

  let title = getFlag(argv, '--title');

  async function gen(previous, instruction) {
    if (!json && !printOnly) process.stderr.write(theme.dim('… generating issue\n'));
    try {
      return await genLocal.generate({
        tool: 'issue',
        ctx: { title: title || description.slice(0, 80), context: description, previous: previous || '', instruction: instruction || '' },
        provider: getFlag(argv, '--provider'),
        model: getFlag(argv, '--model'),
        maxTokens: 2048,
        interactive: !nonInteractive,
      });
    } catch (e) {
      if (e instanceof genLocal.AIError) { errln(`AI provider error (${e.code}): ${e.message}`); throw { exit: 2 }; }
      errln(e.message); throw { exit: /gitset config/.test(e.message || '') ? 1 : 2 };
    }
  }

  let result;
  try { result = await gen(); } catch (e) { return e.exit || 2; }

  if (!title) title = deriveTitle(result.text) || description.slice(0, 80);
  let selectedLabels = [];

  if (json) { out(JSON.stringify({ title, body: result.text, provider: result.provider })); return 0; }
  if (printOnly) { out(`# ${title}\n\n${result.text}`); return 0; }

  function ensureLabel(l) {
    try { execFileSync('gh', ['label', 'create', l.name, '--color', l.color || 'ededed', '--description', l.description || ''], { stdio: 'ignore' }); } catch {  }
  }
  function create(body) {
    const args = ['issue', 'create', '--title', title, '--body', body];
    for (const l of selectedLabels) { ensureLabel(l); args.push('--label', l.name); }
    try {
      execFileSync('gh', args, { stdio: 'inherit' });
      return 0;
    } catch {
      errln('gh issue create failed (is `gh` installed & authenticated?).');
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
    out(theme.bold(`Title: ${title}`));
    out(theme.accent(result.text.slice(0, 1500) + (result.text.length > 1500 ? '\n… (truncated)' : '')));
    out();
    out(theme.dim(`tip: edit ~/.gitset/templates/issue.md (or run \`gitset template edit issue\`) to change the format`));
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

module.exports = { runIssueCommand };
