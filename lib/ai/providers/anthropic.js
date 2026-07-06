'use strict';

function create({ apiKey, model, timeoutMs = 60_000 }) {
  let client;
  function getClient() {
    if (client) return client;
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
    return client;
  }

  function buildParams(req) {
    return {
      model: req.model || model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      ...(req.system ? { system: req.system } : {}),
      messages: (req.messages || []).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };
  }

  return {
    name: 'anthropic',

    async generate(req) {
      const msg = await getClient().messages.create(buildParams(req), { signal: req.signal });
      const text = (msg.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      return {
        text,
        usage: { inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 },
        model: msg.model,
        finishReason: msg.stop_reason || 'stop',
        raw: msg,
      };
    },

    async *stream(req) {
      const s = getClient().messages.stream(buildParams(req), { signal: req.signal });
      for await (const event of s) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield { delta: event.delta.text };
        }
      }
      const final = await s.finalMessage();
      const text = (final.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      yield {
        done: true,
        text,
        usage: { inputTokens: final.usage?.input_tokens ?? 0, outputTokens: final.usage?.output_tokens ?? 0 },
        finishReason: final.stop_reason || 'stop',
      };
    },
  };
}

module.exports = { create };
