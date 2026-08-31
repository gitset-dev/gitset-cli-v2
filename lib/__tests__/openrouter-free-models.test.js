'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = path.join(os.tmpdir(), `gitset_orfm_${crypto.randomBytes(6).toString('hex')}`);
process.env.GITSET_CONFIG_DIR = DIR;

const { fetchFreeModels, CACHE_FILE } = require('../openrouter-free-models');

function withFetch(impl, fn) {
  const real = global.fetch;
  global.fetch = impl;
  return fn().finally(() => { global.fetch = real; });
}

const okResponse = (models) => ({ ok: true, status: 200, json: async () => ({ models }) });
const LIVE = [{ id: 'live/model:free', label: 'Live', goodFor: '262K context — handles long, multi-file diffs; enough room for PR descriptions and release notes.', recommended: true }];

test.beforeEach(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* ignore */ } });
test.after(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* ignore */ } });

test('a successful fetch is returned live and written to the cache', async () => {
  await withFetch(async () => okResponse(LIVE), async () => {
    const r = await fetchFreeModels();
    assert.equal(r.live, true);
    assert.deepEqual(r.models, LIVE);
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')).models, LIVE);
});

test('when the network fails, the last good list is served as stale — not a list frozen into the source', async () => {
  await withFetch(async () => okResponse(LIVE), async () => { await fetchFreeModels(); });

  await withFetch(async () => { throw new Error('ENOTFOUND'); }, async () => {
    const r = await fetchFreeModels();
    assert.equal(r.live, false, 'must not be presented as current');
    assert.deepEqual(r.models, LIVE);
    assert.ok(r.cachedAt, 'callers need the date to tell the user how stale this is');
  });
});

test('offline with no cache yet returns nothing at all, rather than inventing a list', async () => {
  await withFetch(async () => { throw new Error('offline'); }, async () => {
    const r = await fetchFreeModels();
    assert.deepEqual(r.models, []);
    assert.equal(r.live, false);
    assert.equal(r.cachedAt, null);
  });
});

test('a non-200 or empty response falls back to cache instead of caching the bad answer', async () => {
  await withFetch(async () => okResponse(LIVE), async () => { await fetchFreeModels(); });

  await withFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }), async () => {
    const r = await fetchFreeModels();
    assert.equal(r.live, false);
    assert.deepEqual(r.models, LIVE, 'the good cache must survive a bad response');
  });

  await withFetch(async () => okResponse([]), async () => {
    const r = await fetchFreeModels();
    assert.deepEqual(r.models, LIVE);
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')).models, LIVE, 'cache not overwritten by an empty list');
});

test('a corrupt cache file is ignored, not thrown', async () => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, '{ not json');
  await withFetch(async () => { throw new Error('offline'); }, async () => {
    const r = await fetchFreeModels();
    assert.deepEqual(r.models, []);
  });
});
