'use strict';

const PROVIDERS = Object.freeze({
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'],
    streaming: true,
    jsonMode: false,
    contextFloor: 200_000,
    keyHint: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5.6-terra',
    models: ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'],
    streaming: true,
    jsonMode: true,
    contextFloor: 128_000,
    keyHint: 'sk-...',
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-3.7-flash',
    models: ['gemini-3.7-flash', 'gemini-2.5-pro'],
    streaming: true,
    jsonMode: true,
    contextFloor: 1_000_000,
    keyHint: 'AIza...',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'anthropic/claude-sonnet-5',
    models: ['anthropic/claude-sonnet-5', 'openai/gpt-5.6-terra'],
    streaming: true,
    jsonMode: true,
    contextFloor: 32_000,
    keyHint: 'sk-or-...',
    baseURL: 'https://openrouter.ai/api/v1',

    freeModels: [
      {
        id: 'z-ai/glm-5.2:free',
        label: 'GLM 5.2',
        contextTokens: 256_000,
        maxOutputTokens: 230_000,
        goodFor: 'Long documents and code-aware writing — READMEs, PR descriptions, release notes.',
        recommended: true,
      },
      {
        id: 'minimax/minimax-m3:free',
        label: 'MiniMax M3',
        contextTokens: 1_000_000,
        maxOutputTokens: 944_000,
        goodFor: 'General-purpose writing with a very large context window.',
      },
      {
        id: 'google/gemma-4-31b-it:free',
        label: 'Gemma 4 31B',
        contextTokens: 262_000,
        maxOutputTokens: 33_000,
        goodFor: 'General-purpose writing and structured output.',
      },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    streaming: true,
    jsonMode: true,
    contextFloor: 64_000,
    keyHint: 'sk-...',
    baseURL: 'https://api.deepseek.com',
  },
  mock: {
    label: 'Mock (offline/testing)',
    defaultModel: 'mock-1',
    streaming: true,
    jsonMode: true,
    contextFloor: 1_000_000,
    keyHint: 'any',
  },
});

const SUPPORTED = Object.keys(PROVIDERS);

const FORBIDDEN_MODELS = Object.freeze([
  'claude-opus-4-8',
  'claude-fable-5',
  'claude-mythos-5',
  'claude-mythos-preview',
]);

function isForbiddenModel(model) {
  if (!model) return false;
  const bare = String(model).trim().toLowerCase().split('/').pop();
  return FORBIDDEN_MODELS.includes(bare);
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

module.exports = { PROVIDERS, SUPPORTED, FORBIDDEN_MODELS, isForbiddenModel, estimateTokens };
