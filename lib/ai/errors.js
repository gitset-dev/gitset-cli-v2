'use strict';

const CODES = Object.freeze({
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  CONTEXT_LENGTH: 'context_length',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  BAD_REQUEST: 'bad_request',
  PROVIDER_ERROR: 'provider_error',
  UNSUPPORTED: 'unsupported',
});

const RETRYABLE = new Set([
  CODES.RATE_LIMIT,
  CODES.NETWORK,
  CODES.TIMEOUT,
  CODES.PROVIDER_ERROR,
]);

class AIError extends Error {

  constructor(code, message, opts = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.provider = opts.provider || null;
    this.status = opts.status ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;

    this.retryable = opts.retryable ?? RETRYABLE.has(code);
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      provider: this.provider,
      retryable: this.retryable,
    };
  }
}

function normalizeError(err, provider) {
  if (err instanceof AIError) return err;

  const status = err?.status ?? err?.statusCode ?? err?.response?.status ?? null;
  const sysCode = err?.code || err?.cause?.code || null;
  const msg = String(err?.message || err || 'Unknown AI provider error');

  if (err?.name === 'AbortError' || sysCode === 'ABORT_ERR') {
    return new AIError(CODES.TIMEOUT, 'AI request timed out or was aborted.', { provider, cause: err });
  }
  if (['ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(sysCode)) {
    return new AIError(CODES.NETWORK, `Could not reach the ${provider} API.`, { provider, cause: err });
  }
  if (status === 401 || status === 403) {
    const detail = upstreamDetail(err);
    const base = `The ${provider} API key was rejected (HTTP ${status}). Check the key and model access.`;
    return new AIError(CODES.AUTH, detail ? `${base} ${detail}` : base, { provider, status, cause: err });
  }
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(err);
    const detail = upstreamDetail(err);

    const hardLimit = /credit|billing|prepay|plan and billing|exceeded your current quota|quota.*(exhausted|depleted)|insufficient|payment/i.test(detail);
    const message = detail
      ? `${provider}: ${detail}`
      : `Rate limited by ${provider}. This is your provider account's limit.`;
    return new AIError(CODES.RATE_LIMIT, message, { provider, status, retryAfterMs, retryable: !hardLimit, cause: err });
  }
  if (status === 400 || status === 422) {
    if (/context length|too long|maximum.*tokens|max_tokens|token limit/i.test(msg)) {
      return new AIError(CODES.CONTEXT_LENGTH, 'The input is too large for this model\'s context window.', { provider, status, cause: err });
    }
    return new AIError(CODES.BAD_REQUEST, `${provider} rejected the request: ${msg}`, { provider, status, cause: err });
  }
  if (status === 408 || status === 504) {
    return new AIError(CODES.TIMEOUT, `${provider} timed out.`, { provider, status, cause: err });
  }
  if (status != null && status >= 500) {

    const detail = upstreamDetail(err);
    const base = `${provider} is unavailable (HTTP ${status}).`;
    return new AIError(CODES.PROVIDER_ERROR, detail ? `${base} ${detail}` : base, { provider, status, cause: err });
  }

  const detail = upstreamDetail(err);
  return new AIError(CODES.PROVIDER_ERROR, `${provider} error: ${detail || msg}`, { provider, status, cause: err });
}

function upstreamDetail(err) {
  const raw = String(err?.message || '').trim();
  if (!raw) return '';
  const brace = raw.indexOf('{');
  if (brace !== -1) {
    try {
      const j = JSON.parse(raw.slice(brace));
      const m = j?.error?.message || j?.message;
      if (m) return String(m).trim().slice(0, 300);
    } catch {  }
  }
  return raw.replace(/^got status:\s*\d*\s*/i, '').slice(0, 300);
}

function parseRetryAfter(err) {
  const h = err?.headers?.get?.('retry-after') ?? err?.response?.headers?.['retry-after'];
  if (!h) return null;
  const secs = Number(h);
  return Number.isFinite(secs) ? secs * 1000 : null;
}

module.exports = { AIError, CODES, normalizeError };
