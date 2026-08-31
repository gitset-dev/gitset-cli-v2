'use strict';

/**
 * The one place this CLI ever talks to a Gitset-operated server — and only
 * for this: which OpenRouter models are free and currently confirmed
 * working. No key, no code, no prompt, nothing about the user is sent or
 * received; it's a public, unauthenticated read of a daily-refreshed
 * catalogue. See gitset-dev/gitset#52.
 *
 * The same shaping (healthiest model first, confirmed-broken models
 * dropped, descriptions derived from each model's live metadata) that the
 * web app's picker gets — gitset-core-v2's describeFreeModels() — is
 * applied server-side before this ever sees the response, so there's no
 * separate curation logic to keep in sync here.
 *
 * Offline behaviour is a cache of the last good answer, never a hardcoded
 * list: free models rotate and degrade constantly (one shipped here as
 * "recommended" was serving at 17% uptime within days), so a list frozen
 * into this file ages into confidently recommending something broken.
 * Yesterday's real answer, labelled as stale, beats last release's guess.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CATALOGUE_URL = 'https://gitset-core-haf5ercd2q-ue.a.run.app/api/openrouter-free-models';

const CACHE_DIR = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
const CACHE_FILE = path.join(CACHE_DIR, 'openrouter-free-models.json');

function readCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const models = Array.isArray(parsed.models) ? parsed.models : [];
    if (!models.length) return null;
    return { models, cachedAt: parsed.cachedAt || null };
  } catch {
    return null;
  }
}

function writeCache(models) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ cachedAt: new Date().toISOString(), models }, null, 2));
  } catch {
    // A cache we cannot persist is not worth failing a working lookup over.
  }
}

/**
 * @returns {{ models: Array, live: boolean, cachedAt: string|null }}
 *   `live` is false whenever the cached copy was used — callers must say so
 *   rather than presenting it as current. An empty `models` with
 *   `live: false` means there is nothing trustworthy to show at all
 *   (first run, offline): ask for a model id instead of inventing a list.
 */
async function fetchFreeModels({ timeoutMs = 4000 } = {}) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(CATALOGUE_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    if (!models.length) throw new Error('empty response');
    writeCache(models);
    return { models, live: true, cachedAt: null };
  } catch {
    const cached = readCache();
    if (cached) return { models: cached.models, live: false, cachedAt: cached.cachedAt };
    return { models: [], live: false, cachedAt: null };
  }
}

module.exports = { fetchFreeModels, CATALOGUE_URL, CACHE_FILE };
