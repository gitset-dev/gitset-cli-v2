// VENDORED from gitset-core-v2/lib/prompts — do not edit here. Run `pnpm sync:ai`.
'use strict';

const defaults = require('./defaults');
const { dateAwarenessNote } = require('./context');

let _cache = null;

function tryRequire(spec) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(spec);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return null;

    console.warn(`[prompts] overlay "${spec}" failed to load; using defaults. ${err.message}`);
    return null;
  }
}

function resolvePack() {
  if (_cache) return _cache;

  let overlay = null;
  let source = 'defaults';

  if (process.env.GITSET_PROMPT_PACK) {
    overlay = tryRequire(process.env.GITSET_PROMPT_PACK);
    if (overlay) source = `env:${process.env.GITSET_PROMPT_PACK}`;
  }
  if (!overlay) {
    overlay = tryRequire('./private');
    if (overlay) source = 'private';
  }

  const pack = { ...defaults };
  if (overlay && typeof overlay === 'object') {
    for (const [key, val] of Object.entries(overlay)) {
      if (val && typeof val.build === 'function') pack[key] = val;
    }
  }

  _cache = { pack, source, private: source !== 'defaults' };
  return _cache;
}

function _reset() { _cache = null; }

function isPrivatePackLoaded() { return resolvePack().private; }

function packSource() { return resolvePack().source; }

function listPrompts() { return Object.keys(resolvePack().pack); }

function getPrompt(key, ctx = {}) {
  const { pack } = resolvePack();
  const entry = pack[key];
  if (!entry || typeof entry.build !== 'function') {
    throw new Error(`Unknown prompt "${key}". Available: ${Object.keys(pack).join(', ')}`);
  }
  const out = entry.build(ctx);
  if (!out || typeof out.system !== 'string' || typeof out.user !== 'string') {
    throw new Error(`Prompt "${key}" must return { system: string, user: string }`);
  }

  return { ...out, system: `${out.system}\n\n${dateAwarenessNote()}` };
}

function toAIRequest(key, ctx = {}, extra = {}) {
  const { system, user } = getPrompt(key, ctx);
  return { system, messages: [{ role: 'user', content: user }], ...extra };
}

module.exports = {
  getPrompt,
  toAIRequest,
  listPrompts,
  isPrivatePackLoaded,
  packSource,
  _reset,
};
