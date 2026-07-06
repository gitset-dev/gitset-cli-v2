'use strict';

/**
 * `gitset repo <about|license|backup>` — local, BYOAI, no backend.
 *
 *  about   : AI description + topics from local repo context, applied via `gh`
 *  license : delegates to the local license generator
 *  backup  : writes a SECURE local GitHub Actions mirror workflow. We NEVER
 *            handle the user's PAT (the old remote/PAT flow was insecure and
 *            half-broken — removed). The user sets one repo secret in GitHub.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const readline = require('readline');
const genLocal = require('../../lib/generate-local');
const { runLicenseCommand } = require('./license');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);
const ask = (q) => new Promise((r) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); r(a.trim()); });
});
const flag = (argv, n) => {
  const i = argv.indexOf(n);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
};
function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
function parseJsonish(text) {
  let t = String(text).trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1) { try { return JSON.parse(t.slice(a, b + 1)); } catch {  } }
  return { description: t.slice(0, 350), topics: [] };
}

async function aboutCmd(argv) {
  const remote = git(['config', '--get', 'remote.origin.url']);
  let owner = '', name = '';
  const m = remote && remote.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (m) { owner = m[1]; name = m[2]; }
  if (!name) { console.error(`${c('31', '✗')} No git remote origin found.`); return 1; }
  console.log(`${c('1', `${owner}/${name}`)}`);

  let ctx = '';
  for (const f of ['README.md', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']) {
    if (fs.existsSync(f)) ctx += `\n--- ${f} ---\n${fs.readFileSync(f, 'utf8').slice(0, 6000)}\n`;
  }
  if (!ctx && !process.stdin.isTTY) { console.error(`${c('31', '✗')} No README/manifest; run interactively to describe it.`); return 1; }
  if (!ctx) ctx = await ask('Briefly describe the project: ');

  async function gen(previous, instruction) {
    process.stderr.write(c('90', '… generating about\n'));
    const r = await genLocal.generate({
      tool: 'about',
      ctx: { context: ctx, previous: previous || '', instruction: instruction || '' },
      provider: flag(argv, '--provider'), model: flag(argv, '--model'), maxTokens: 1024,
    });
    return parseJsonish(r.text);
  }

  let data;
  try { data = await gen(); }
  catch (e) {
    if (e instanceof genLocal.AIError) { console.error(`${c('31', '✗')} AI provider error (${e.code}): ${e.message}`); return 2; }
    console.error(`${c('31', '✗')} ${e.message}`); return /gitset config/.test(e.message || '') ? 1 : 2;
  }
  let { description = '', topics = [] } = data;

  const nonInteractive = !process.stdin.isTTY || argv.includes('--yes') || argv.includes('-y');
  for (;;) {
    console.log(`\n${c('1', 'Description:')} ${description}`);
    console.log(`${c('1', 'Topics:')} ${(topics || []).join(', ')}`);
    if (nonInteractive) {
      if (!argv.includes('--apply')) return 0;
    }
    const action = nonInteractive ? 'apply'
      : (await ask(`\n${c('1', '[a]')}pply to GitHub  ${c('1', '[r]')}efine  ${c('1', '[e]')}dit  ${c('1', '[q]')}uit > `)).toLowerCase();

    if (action === 'q' || action === '') return 0;
    if (action === 'a' || action === 'apply') {
      try {
        if (description) execFileSync('gh', ['repo', 'edit', `${owner}/${name}`, '--description', description], { stdio: 'ignore' });
        if (topics && topics.length) {
          const args = ['repo', 'edit', `${owner}/${name}`];
          for (const t of topics) args.push('--add-topic', String(t).trim());
          execFileSync('gh', args, { stdio: 'ignore' });
        }
        console.log(`${c('32', '✓')} Applied to ${owner}/${name}`);
        return 0;
      } catch {
        console.error(`${c('31', '✗')} gh repo edit failed (is gh installed & authenticated?).`);
        return 1;
      }
    }
    if (action === 'e') {
      description = (await ask(`Description: `)) || description;
      const t = await ask('Topics (comma separated): ');
      if (t) topics = t.split(',').map((x) => x.trim()).filter(Boolean);
    }
    if (action === 'r') {
      const instr = await ask('Refinement instruction: ');
      if (instr) { try { ({ description = description, topics = topics } = await gen(JSON.stringify({ description, topics }), instr)); } catch (e) { console.error(`${c('31', '✗')} ${e.message}`); } }
    }
  }
}

const BACKUP_WORKFLOW = (schedule) => `name: Gitset Backup Mirror
# Pushes this repository to a mirror you control.
# Set repo secret BACKUP_MIRROR_URL, e.g.
#   https://<user>:<TOKEN>@github.com/<user>/<repo>-backup.git
# (Create the token yourself in GitHub → Settings → Developer settings.
#  Gitset never sees or stores it.)
on:
  schedule:
    - cron: '${schedule}'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: Push mirror
        run: |
          if [ -z "\${{ secrets.BACKUP_MIRROR_URL }}" ]; then
            echo "::error::Set the BACKUP_MIRROR_URL repo secret."; exit 1
          fi
          git push --mirror "\${{ secrets.BACKUP_MIRROR_URL }}"
`;

async function backupCmd(argv) {
  const schedules = { daily: '0 0 * * *', weekly: '0 0 * * 0', monthly: '0 0 1 * *' };
  const sched = schedules[flag(argv, '--schedule') || 'daily'] || schedules.daily;
  const dir = path.join(process.cwd(), '.github', 'workflows');
  const file = path.join(dir, 'gitset-backup.yml');
  if (fs.existsSync(file) && !argv.includes('--force')) {
    console.error(`${c('31', '✗')} ${path.relative(process.cwd(), file)} exists. Use --force.`);
    return 1;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, BACKUP_WORKFLOW(sched));
  console.log(`${c('32', '✓')} Wrote ${path.relative(process.cwd(), file)} (schedule: ${sched})`);
  console.log(c('1', '\nNext (you control the credentials — Gitset never touches them):'));
  console.log('  1. Create an empty mirror repo + a token with repo scope.');
  console.log('  2. Repo → Settings → Secrets → Actions → add BACKUP_MIRROR_URL');
  console.log('     = https://<user>:<TOKEN>@github.com/<user>/<repo>-backup.git');
  console.log('  3. git add .github/workflows/gitset-backup.yml && commit && push\n');
  return 0;
}

async function runRepoCommand(argv) {
  const sub = argv[0] && !argv[0].startsWith('-') ? argv[0]
    : argv.includes('--about') ? 'about'
      : argv.includes('--license') ? 'license'
        : argv.includes('--backup') ? 'backup' : null;

  if (sub === 'about') return aboutCmd(argv.slice(1));
  if (sub === 'license') return runLicenseCommand(argv.filter((a) => a !== 'license'));
  if (sub === 'backup') return backupCmd(argv.slice(1));

  console.log(`${c('1', 'gitset repo')} — repository tools (local, BYOAI)

  gitset repo about     AI description + topics, applied via gh
  gitset repo license   generate a LICENSE file (offline)
  gitset repo backup    write a secure mirror-backup GitHub Actions workflow
`);
  return sub ? 1 : 0;
}

module.exports = { runRepoCommand };
