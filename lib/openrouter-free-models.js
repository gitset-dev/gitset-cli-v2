'use strict';

/**
 * The one place this CLI ever talks to a Gitset-operated server — and only
 * for this: which OpenRouter models are free and currently confirmed
 * working. No key, no code, no prompt, nothing about the user is sent or
 * received; it's a public, unauthenticated read of a daily-refreshed
 * catalogue. See gitset-dev/gitset#52.
 *
 * The same shaping (recommended model first, confirmed-broken models
 * dropped, editorial "good for" copy) that the web app's picker gets —
 * gitset-core-v2's lib/openrouter-free/describeFreeModels() — is applied
 * server-side before this ever sees the response, so there's no separate
 * curation logic to keep in sync here.
 */
const CATALOGUE_URL = 'https://gitset-core-haf5ercd2q-ue.a.run.app/api/openrouter-free-models';

// Used only when the live lookup is unreachable (offline, DNS, timeout) —
// keeps `gitset config` fully usable without a network call to Gitset at
// all. Each entry here was empirically confirmed working at some point
// (gitset-dev/gitset#52: a real API probe, not just a capability score),
// but may not reflect what's live right now the way the fetched list does.
const FALLBACK_MODELS = [
  {
    id: 'z-ai/glm-5.2:free',
    label: 'GLM 5.2',
    goodFor: 'Long documents and code-aware writing — READMEs, PR descriptions, release notes.',
    recommended: true,
  },
  { id: 'minimax/minimax-m3:free', label: 'MiniMax M3', goodFor: 'General-purpose writing with a very large context window.' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', goodFor: 'General-purpose writing and structured output.' },
];

/**
 * @returns {{ models: Array, live: boolean }} `live` is false whenever the
 *   fallback list was used — callers should say so rather than presenting
 *   it as current.
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
    return { models, live: true };
  } catch {
    return { models: FALLBACK_MODELS, live: false };
  }
}

module.exports = { fetchFreeModels, FALLBACK_MODELS, CATALOGUE_URL };
