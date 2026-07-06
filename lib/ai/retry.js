'use strict';

const { normalizeError } = require('./errors');

async function withRetry(fn, opts = {}) {
  const { provider, retries = 3, baseDelayMs = 500, maxDelayMs = 8000, signal } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (raw) {
      const err = normalizeError(raw, provider);
      if (!err.retryable || attempt >= retries) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.random() * backoff * 0.25;
      const delay = err.retryAfterMs != null ? err.retryAfterMs : backoff + jitter;
      attempt += 1;
      await sleep(delay, signal);
    }
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}

module.exports = { withRetry };
