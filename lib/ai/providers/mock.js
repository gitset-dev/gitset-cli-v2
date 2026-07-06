'use strict';

const { estimateTokens } = require('../capabilities');

function create({ model = 'mock-1' } = {}) {
  function answer(req) {
    const last = [...(req.messages || [])].reverse().find((m) => m.role !== 'assistant');
    const seed = (last?.content || '').trim();
    return `[mock:${model}] ${seed ? seed.slice(0, 280) : 'no input'}`;
  }

  return {
    name: 'mock',

    async generate(req) {
      if (req.signal?.aborted) throw new Error('aborted');
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
