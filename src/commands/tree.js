'use strict';

/**
 * `gitset tree` — local repo structure visualizer. No backend, no AI.
 * Flags: --all (include dotfiles) --depth <n> --exclude <pat> (repeatable)
 *        --no-gitignore (don't honor .gitignore)
 */
const fs = require('fs');
const path = require('path');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);

function loadGitignore(root) {
  const f = path.join(root, '.gitignore');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\/$/, ''));
}

function makeExcluder(patterns) {
  const set = new Set(['.git', ...patterns]);
  return (name) => {
    if (set.has(name)) return true;
    for (const p of patterns) {
      if (p.startsWith('*.') && name.endsWith(p.slice(1))) return true;
      if (p === name) return true;
    }
    return false;
  };
}

function walk(dir, prefix, opts, depth, stats) {
  if (opts.maxDepth >= 0 && depth > opts.maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries = entries
    .filter((e) => opts.all || !e.name.startsWith('.') || e.name === '.github' || e.name === '.gitignore')
    .filter((e) => !opts.exclude(e.name))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

  entries.forEach((e, i) => {
    const last = i === entries.length - 1;
    const branch = last ? '└── ' : '├── ';
    if (e.isDirectory()) {
      stats.dirs++;
      console.log(prefix + branch + c('36', e.name + '/'));
      walk(path.join(dir, e.name), prefix + (last ? '    ' : '│   '), opts, depth + 1, stats);
    } else {
      stats.files++;
      console.log(prefix + branch + e.name);
    }
  });
}

function runTreeCommand(argv) {
  const root = process.cwd();
  const exclude = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--exclude' && argv[i + 1]) { exclude.push(argv[i + 1]); i++; }
  }
  const depthIdx = argv.indexOf('--depth');
  const maxDepth = depthIdx !== -1 && argv[depthIdx + 1] ? parseInt(argv[depthIdx + 1], 10) : -1;
  const useGitignore = !argv.includes('--no-gitignore');
  const patterns = [...exclude, ...(useGitignore ? loadGitignore(root) : [])];

  const opts = { all: argv.includes('--all'), maxDepth, exclude: makeExcluder(patterns) };
  const stats = { dirs: 0, files: 0 };

  console.log(c('1', path.basename(root) + '/'));
  walk(root, '', opts, 0, stats);
  console.log(c('90', `\n${stats.dirs} directories, ${stats.files} files`));
  return 0;
}

module.exports = { runTreeCommand };
