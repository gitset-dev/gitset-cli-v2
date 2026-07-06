// VENDORED from gitset-core-v2/lib/ai — do not edit here. Run `pnpm sync:ai`.
'use strict';

const { AIError, CODES, normalizeError } = require('./errors');
const { withRetry } = require('./retry');
const { PROVIDERS, SUPPORTED, FORBIDDEN_MODELS, isForbiddenModel, estimateTokens } = require('./capabilities');

const ADAPTERS = {
  anthropic: () => require('./providers/anthropic'),
  openai: () => require('./providers/openai-compatible'),
  openrouter: () => require('./providers/openai-compatible'),
  deepseek: () => require('./providers/openai-compatible'),
  gemini: () => require('./providers/gemini'),
  mock: () => require('./providers/mock'),
};

function createProvider(cfg = {}) {
  const provider = String(cfg.provider || '').toLowerCase();
  const meta = PROVIDERS[provider];
  if (!meta) {
    throw new AIError(CODES.UNSUPPORTED, `Unknown provider "${cfg.provider}". Supported: ${SUPPORTED.join(', ')}.`, { provider });
  }
  if (provider !== 'mock' && !cfg.apiKey) {
    throw new AIError(CODES.AUTH, `No API key supplied for ${meta.label}. Gitset is BYOAI — add your own key.`, { provider });
  }

  const model = cfg.model || meta.defaultModel;
  if (isForbiddenModel(model)) {
    throw new AIError(
      CODES.UNSUPPORTED,
      `Model "${model}" can't be used with Gitset. Pick another model for ${meta.label}.`,
      { provider },
    );
  }
  const baseURL = cfg.baseURL || meta.baseURL;
  const timeoutMs = cfg.timeoutMs ?? 60_000;
  const retry = cfg.retry || {};

  const adapter = ADAPTERS[provider]().create({ apiKey: cfg.apiKey, model, baseURL, timeoutMs });

  function preflight(request) {
    if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
      throw new AIError(CODES.BAD_REQUEST, 'request.messages must be a non-empty array.', { provider });
    }
    if (isForbiddenModel(request.model)) {
      throw new AIError(
        CODES.UNSUPPORTED,
        `Model "${request.model}" can't be used with Gitset. Pick another model for ${meta.label}.`,
        { provider },
      );
    }
    const approx = estimateTokens(
      (request.system || '') + request.messages.map((m) => m.content || '').join('\n'),
    ) + (request.maxTokens || 0);
    if (approx > meta.contextFloor * 1.5) {
      throw new AIError(
        CODES.CONTEXT_LENGTH,
        `Input (~${approx} tokens) likely exceeds ${meta.label}'s context window.`,
        { provider },
      );
    }
  }

  return {
    provider,
    model,
    capabilities: {
      streaming: meta.streaming,
      jsonMode: meta.jsonMode,
      maxContext: meta.contextFloor,
      label: meta.label,
    },

    async generate(request) {
      preflight(request);
      return withRetry(() => adapter.generate(request), { provider, signal: request.signal, ...retry });
    },

    async *stream(request) {
      preflight(request);
      if (!meta.streaming) {
        const r = await this.generate(request);
        yield { done: true, text: r.text, usage: r.usage, finishReason: r.finishReason };
        return;
      }
      try {
        yield* adapter.stream(request);
      } catch (err) {
        throw normalizeError(err, provider);
      }
    },
  };
}

module.exports = {
  createProvider, AIError, CODES, PROVIDERS, SUPPORTED,
  FORBIDDEN_MODELS, isForbiddenModel, estimateTokens,
};
