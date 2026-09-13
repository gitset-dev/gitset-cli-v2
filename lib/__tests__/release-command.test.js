'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseLog, LOG_FORMAT } = require('../../src/commands/release');

test('parseLog: a pipe in the subject no longer cuts the message short', () => {
  const line = ['a'.repeat(40), 'aaaaaaa', 'Ann Dev', 'feat: support a | b in filters'].join('\x1f');
  const [c] = parseLog(line);
  assert.equal(c.message, 'feat: support a | b in filters');
  assert.equal(c.author, 'Ann Dev');
  assert.equal(c.hash, 'aaaaaaa');
  assert.equal(c.fullHash, 'a'.repeat(40));
});

// Against real git output, not a hand-built string: the separator has to
// survive `git log` and the shell quoting the command uses.
test('parseLog: reads real `git log` output, full and short SHA included', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitset-log-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('-c', 'user.name=Ann Dev', '-c', 'user.email=a@x.dev', 'commit', '-q', '--allow-empty', '-m', 'feat: pipes | everywhere');
    const out = execFileSync('sh', ['-c', `git log --pretty=format:"${LOG_FORMAT}"`], { cwd: dir, encoding: 'utf8' });
    const [c] = parseLog(out);
    assert.equal(c.message, 'feat: pipes | everywhere');
    assert.match(c.fullHash, /^[0-9a-f]{40}$/);
    assert.ok(c.fullHash.startsWith(c.hash));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parseLog: empty output is an empty list', () => {
  assert.deepEqual(parseLog(''), []);
  assert.deepEqual(parseLog(null), []);
});

// The release prompt now requires lib/release-notes. If the sync ever stops
// vendoring it, every prompt in the CLI fails to load — not just release.
test('vendored prompts load, with release-notes alongside them', () => {
  const prompts = require('../prompts');
  assert.ok(prompts.listPrompts().includes('release'));
  const { system } = prompts.getPrompt('release', { commits: '- abc1234 feat: x (Ann)' });
  assert.match(system, /short SHA of each commit/);
});
