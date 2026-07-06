'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = path.join(os.tmpdir(), `gitset_cfg_${process.pid}_${Date.now()}`);
process.env.GITSET_CONFIG_DIR = TMP;
delete process.env.ANTHROPIC_API_KEY;

const config = require('../config');

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });

test('set + resolve + default selection', () => {
  config.setProvider('anthropic', { apiKey: 'sk-ant-SECRET1234', model: 'claude-x', makeDefault: true });
  const r = config.resolve();
  assert.equal(r.provider, 'anthropic');
  assert.equal(r.apiKey, 'sk-ant-SECRET1234');
  assert.equal(r.model, 'claude-x');
});

test('list never exposes the full key', () => {
  const rows = config.list();
  const row = rows.find((x) => x.provider === 'anthropic');
  assert.equal(row.keyLast4, '1234');
  assert.equal(row.isDefault, true);
  assert.ok(!JSON.stringify(rows).includes('sk-ant-SECRET1234'));
});

test('env var overrides stored key', () => {
  process.env.ANTHROPIC_API_KEY = 'env-key-9999';
  assert.equal(config.resolve('anthropic').apiKey, 'env-key-9999');
  delete process.env.ANTHROPIC_API_KEY;
});

test('config file is written 0600', () => {
  if (process.platform === 'win32') return;
  const mode = fs.statSync(config.FILE).mode & 0o777;
  assert.equal(mode, 0o600);
});

test('resolve throws actionable error when unconfigured', () => {
  assert.throws(() => config.resolve('openai'), /gitset config set openai/);
});

test('removeProvider reassigns default', () => {
  config.setProvider('openai', { apiKey: 'sk-oai-1', makeDefault: false });
  assert.equal(config.removeProvider('anthropic'), true);
  const def = config.list().find((x) => x.isDefault);
  assert.equal(def.provider, 'openai');
});
