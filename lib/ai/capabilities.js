'use strict';

const PROVIDERS = Object.freeze({
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-4-6',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
    streaming: true,
    jsonMode: false,
    contextFloor: 200_000,
    keyHint: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
    streaming: true,
    jsonMode: true,
    contextFloor: 128_000,
    keyHint: 'sk-...',
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    streaming: true,
    jsonMode: true,
    contextFloor: 1_000_000,
    keyHint: 'AIza...',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    models: ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o'],
    streaming: true,
    jsonMode: true,
    contextFloor: 32_000,
    keyHint: 'sk-or-...',
    baseURL: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
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
