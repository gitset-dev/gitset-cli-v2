'use strict';

/**
 * `gitset gitignore` — local BYOAI .gitignore generation.
 * Auto-detects the stack locally, generates via the user's own provider
 * (vendored lib/ai through lib/generate-local). No backend, no gitset_key.
 *
 * Flags: --select (type stacks) | --<stack> ... | --provider --model
 *        --append --force --print
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const genLocal = require('../../lib/generate-local');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);
const ask = (q) => new Promise((r) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); r(a.trim()); });
});
function flag(argv, n) {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
}

const DETECT = {
  'package.json': ['Node'], 'requirements.txt': ['Python'], 'pyproject.toml': ['Python'],
  'Pipfile': ['Python'], 'go.mod': ['Go'], 'Cargo.toml': ['Rust'], 'Gemfile': ['Ruby'],
  'pom.xml': ['Java', 'Maven'], 'build.gradle': ['Java', 'Gradle'], 'composer.json': ['PHP'],
  'mix.exs': ['Elixir'], 'CMakeLists.txt': ['C++', 'CMake'], 'pubspec.yaml': ['Dart', 'Flutter'],
  'tsconfig.json': ['TypeScript'], 'next.config.js': ['Next.js'], 'Dockerfile': ['Docker'],
};

function detectStacks(cwd) {
  const found = new Set();
  if (process.platform === 'darwin') found.add('macOS');
  if (process.platform === 'win32') found.add('Windows');
  if (process.platform === 'linux') found.add('Linux');
  let files = [];
  try { files = fs.readdirSync(cwd); } catch {  }
  for (const f of files) (DETECT[f] || []).forEach((s) => found.add(s));
  return [...found];
}

async function runGitignoreCommand(argv) {
  const cwd = process.cwd();
  const printOnly = argv.includes('--print');
  const nonInteractive = printOnly || !process.stdin.isTTY || argv.includes('--yes') || argv.includes('-y');

  const RESERVED = new Set(['select', 'provider', 'model', 'append', 'force', 'print', 'yes']);
  let stacks = argv.filter((a) => a.startsWith('--') && !RESERVED.has(a.slice(2)) && a !== '-y').map((a) => a.slice(2));

  if (argv.includes('--select')) {
    if (nonInteractive) { console.error(`${c('31', '✗')} --select needs a TTY. Pass stacks as --node --python …`); return 1; }
    const ans = await ask('Stacks/tools (comma separated, e.g. Node, TypeScript, Docker): ');
    stacks = ans.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (stacks.length === 0) {
    stacks = detectStacks(cwd);
    if (stacks.length === 0) {
      console.error(`${c('31', '✗')} Could not detect a stack. Use --select or --<stack> (e.g. --node).`);
      return 1;
    }
    console.log(`${c('36', 'detected')}: ${stacks.join(', ')}`);
    if (!nonInteractive) {
      const ok = (await ask('Generate .gitignore for these? [Y/n] ')).toLowerCase();
      if (ok === 'n') { console.log('Aborted.'); return 0; }
    }
  }

  const giPath = path.join(cwd, '.gitignore');
  const existing = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';

  let result;
  try {
    process.stderr.write(c('90', `… generating .gitignore (${stacks.join(', ')})\n`));
    result = await genLocal.generate({
      tool: 'gitignore',
      ctx: { stack: stacks.join(', '), previous: argv.includes('--append') ? existing : '' },
      provider: flag(argv, '--provider'),
      model: flag(argv, '--model'),
      maxTokens: 2048,
    });
  } catch (e) {
    if (e instanceof genLocal.AIError) { console.error(`${c('31', '✗')} AI provider error (${e.code}): ${e.message}`); return 2; }
    console.error(`${c('31', '✗')} ${e.message}`);
    return /gitset config/.test(e.message || '') ? 1 : 2;
  }

  const body = result.text.trim() + '\n';
  if (printOnly) { process.stdout.write(body); return 0; }

  let finalContent = body;
  let mode = 'created';
  if (existing) {
    let action = argv.includes('--append') ? 'append' : argv.includes('--force') ? 'overwrite' : null;
    if (!action) {
      if (nonInteractive) { console.error(`${c('31', '✗')} .gitignore exists. Use --append or --force.`); return 1; }
      action = (await ask('.gitignore exists — [a]ppend / [o]verwrite / [c]ancel? ')).toLowerCase();
      action = action === 'a' ? 'append' : action === 'o' ? 'overwrite' : 'cancel';
    }
    if (action === 'cancel') { console.log('Aborted.'); return 0; }
    if (action === 'append') { finalContent = existing.replace(/\n*$/, '\n') + '\n# --- added by gitset ---\n' + body; mode = 'updated'; }
  }
  fs.writeFileSync(giPath, finalContent);
  console.log(`${c('32', '✓')} .gitignore ${mode} (${stacks.join(', ')}, via ${result.provider})`);
  return 0;
}

module.exports = { runGitignoreCommand };
