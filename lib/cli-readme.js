'use strict';

/**
 * `gitset readme` — local BYOAI README generation.
 * Gathers repo context locally (git-tracked files + key file contents),
 * generates via the user's own provider, no backend.
 *
 * Flags: --provider --model --output <file> --force --yes --print --json
 * Exit: 0 ok · 1 usage/io · 2 provider error.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const readline = require('readline');
const genLocal = require('./generate-local');
const theme = require('../src/utils/theme');

const out = (s = '') => console.log(s);
const errln = (s) => console.error(`${theme.error('✗')} ${s}`);

function getFlag(argv, n) {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
}
const has = (argv, ...n) => n.some((x) => argv.includes(x));

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}

const KEY_FILES = [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
  'composer.json', 'Gemfile', 'requirements.txt', 'tsconfig.json',
  'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.py',
  'index.js', 'main.go', 'main.py', 'app.py',
];

function gatherContext(cwd) {
  let files = [];
  try {
    files = execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    errln('Not a git repository (run inside your repo).');
    return null;
  }
  const tree = files.slice(0, 400).join('\n');
  let ctx = `FILE TREE (${files.length} tracked files):\n${tree}\n`;

  let budget = 16000;
  for (const f of KEY_FILES) {
    if (budget <= 0) break;
    if (!files.includes(f)) continue;
    try {
      const body = fs.readFileSync(path.join(cwd, f), 'utf8').slice(0, Math.min(budget, 6000));
      ctx += `\n--- ${f} ---\n${body}\n`;
      budget -= body.length;
    } catch {  }
  }
  const projectName = (() => {
    try {
      if (files.includes('package.json')) {
        return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).name || path.basename(cwd);
      }
    } catch {  }
    return path.basename(cwd);
  })();
  return { projectName, context: ctx };
}

async function runReadmeCommand(argv) {
  const cwd = process.cwd();
  const json = has(argv, '--json');
  const printOnly = has(argv, '--print');
  const nonInteractive = has(argv, '--yes', '-y') || json || printOnly || !process.stdin.isTTY;
  const outFile = path.join(cwd, getFlag(argv, '--output') || 'README.md');

  const gathered = gatherContext(cwd);
  if (!gathered) return 1;

  let templateText = '';
  const tmplPath = getFlag(argv, '--template');
  if (tmplPath) {
    try { templateText = fs.readFileSync(tmplPath, 'utf8'); }
    catch { errln(`Template not found: ${tmplPath}`); return 1; }
  }

  async function gen(previous, instruction) {
    if (!json && !printOnly) process.stderr.write(theme.dim('… generating README\n'));
    try {
      const r = await genLocal.generate({
        tool: 'readme',
        ctx: { projectName: gathered.projectName, context: gathered.context, template: templateText, previous: previous || '', instruction: instruction || '' },
        provider: getFlag(argv, '--provider'),
        model: getFlag(argv, '--model'),
        maxTokens: 8192,
        interactive: !nonInteractive,
      });
      return r;
    } catch (e) {
      if (e instanceof genLocal.AIError) { errln(`AI provider error (${e.code}): ${e.message}`); throw { exit: 2 }; }
      errln(e.message); throw { exit: e.message && /gitset config/.test(e.message) ? 1 : 2 };
    }
  }

  let result;
  try { result = await gen(); } catch (e) { return e.exit || 2; }

  if (json) { out(JSON.stringify({ content: result.text, provider: result.provider, model: result.model })); return 0; }
  if (printOnly) { out(result.text); return 0; }

  function write(content) {
    if (fs.existsSync(outFile) && !has(argv, '--force') && nonInteractive) {
      errln(`${path.basename(outFile)} exists. Use --force to overwrite.`);
      return 1;
    }
    fs.writeFileSync(outFile, content.endsWith('\n') ? content : content + '\n');
    out(`${theme.success('✓')} Wrote ${path.relative(cwd, outFile)} (${content.length} bytes, via ${result.provider})`);
    return 0;
  }

  if (nonInteractive) return write(result.text);

  for (;;) {
    out();
    out(theme.bold(`README preview (${result.text.length} chars, via ${result.provider}):`));
    out(theme.dim(result.text.slice(0, 1200) + (result.text.length > 1200 ? '\n… (truncated preview)' : '')));
    out();
    if (!tmplPath) out(theme.dim(`tip: edit ~/.gitset/templates/readme.md (or run \`gitset template edit readme\`) to change the format`));
    const ch = (await ask(
      `${theme.key('w', 'rite')}  ${theme.key('r', 'efine')}  ${theme.key('g', 'regenerate')}  ${theme.key('p', 'rint')}  ${theme.key('q', 'uit')} > `,
    )).toLowerCase();
    if (ch === 'w' || ch === '') {
      if (fs.existsSync(outFile) && !has(argv, '--force')) {
        const ow = (await ask(`${path.basename(outFile)} exists. Overwrite? [y/N] `)).toLowerCase();
        if (ow !== 'y') continue;
      }
      return write(result.text);
    }
    if (ch === 'q') { out('Aborted.'); return 0; }
    if (ch === 'p') { out(result.text); continue; }
    if (ch === 'g') { try { result = await gen(); } catch (e) { return e.exit || 2; } continue; }
    if (ch === 'r') {
      const instr = await ask('Refinement instruction: ');
      if (instr) { try { result = await gen(result.text, instr); } catch (e) { return e.exit || 2; } }
      continue;
    }
    out(theme.warn('Unrecognized option.'));
  }
}

module.exports = { runReadmeCommand };
