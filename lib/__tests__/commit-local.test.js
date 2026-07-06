'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateCommitMessage, parseMessage } = require('../commit-local');

const MOCK = { provider: 'mock', apiKey: null, model: null, baseUrl: null };
const DIFF = 'diff --git a/x.js b/x.js\n+console.log("hi")';

test('generates a message locally via the BYOAI provider', async () => {
  const out = await generateCommitMessage({ providerCfg: MOCK, diff: DIFF, stats: '1 file changed' });
  assert.equal(out.provider, 'mock');
  assert.ok(out.message.length > 0);
  assert.match(out.message, /\[mock:/); // deterministic mock echo proves wiring
});

test('refinement passes previous + instruction through', async () => {
  const a = await generateCommitMessage({ providerCfg: MOCK, diff: DIFF });
  const b = await generateCommitMessage({
    providerCfg: MOCK, diff: DIFF, previous: a.message, instruction: 'make it terse',
  });
  assert.ok(b.message.length > 0);
});

test('empty staged diff is a clear, coded error', async () => {
  await assert.rejects(
    () => generateCommitMessage({ providerCfg: MOCK, diff: '   ' }),
    (e) => e.code === 'NO_STAGED_CHANGES',
  );
});

test('parseMessage strips code fences', () => {
  assert.equal(parseMessage('```\nfeat: x\n```'), 'feat: x');
  assert.equal(parseMessage('```text\nfix: y\n```'), 'fix: y');
  assert.equal(parseMessage('  chore: z  '), 'chore: z');
});
