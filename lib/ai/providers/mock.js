'use strict';

const { estimateTokens } = require('../capabilities');

function create({ model = 'mock-1' } = {}) {
  function answer(req) {
    const last = [...(req.messages || [])].reverse().find((m) => m.role !== 'assistant');
    const seed = (last?.content || '').trim();
    return `[mock:${model}] ${seed ? seed.slice(0, 280) : 'no input'}`;
  }

  function emptyRequested(req) {
    const last = [...(req.messages || [])].reverse().find((m) => m.role !== 'assistant');
    return String(last?.content || '').includes('__EMPTY_COMPLETION__');
  }

  return {
    name: 'mock',

    async generate(req) {
      if (req.signal?.aborted) throw new Error('aborted');
      if (emptyRequested(req)) {
        return { text: '', usage: { inputTokens: 0, outputTokens: 0 }, model, finishReason: 'length', raw: { mock: true } };
      }
      const text = answer(req);
      const inputTokens = estimateTokens((req.system || '') + JSON.stringify(req.messages || []));
      return {
        text,
        usage: { inputTokens, outputTokens: estimateTokens(text) },
        model,
        finishReason: 'stop',
        raw: { mock: true },
      };
    },

    async *stream(req) {
      if (emptyRequested(req)) {
        yield { done: true, text: '', usage: { inputTokens: 0, outputTokens: 0 }, finishReason: 'length' };
        return;
      }
      const text = answer(req);
      for (const word of text.split(' ')) yield { delta: word + ' ' };
      yield {
        done: true,
        text,
        usage: { inputTokens: estimateTokens(JSON.stringify(req.messages || [])), outputTokens: estimateTokens(text) },
        finishReason: 'stop',
      };
    },
  };
}

module.exports = { create };
