'use strict';

function create({ apiKey, model, baseURL, timeoutMs = 60_000 }) {
  let client;
  function getClient() {
    if (client) return client;
    const OpenAI = require('openai');
    client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), timeout: timeoutMs, maxRetries: 0 });
    return client;
  }

  function buildMessages(req) {
    const msgs = [];
    if (req.system) msgs.push({ role: 'system', content: req.system });
    for (const m of req.messages || []) {
      msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
    return msgs;
  }

  function baseParams(req) {
    return {
      model: req.model || model,
      messages: buildMessages(req),
      temperature: req.temperature ?? 0.7,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    };
  }

  return {
    name: 'openai-compatible',

    async generate(req) {
      const r = await getClient().chat.completions.create(
        baseParams(req),
        { signal: req.signal },
      );
      const choice = r.choices?.[0];
      return {
        text: choice?.message?.content || '',
        usage: {
          inputTokens: r.usage?.prompt_tokens ?? 0,
          outputTokens: r.usage?.completion_tokens ?? 0,
        },
        model: r.model,
        finishReason: choice?.finish_reason || 'stop',
        raw: r,
      };
    },

    async *stream(req) {
      const s = await getClient().chat.completions.create(
        { ...baseParams(req), stream: true, stream_options: { include_usage: true } },
        { signal: req.signal },
      );
      let text = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      let finishReason = 'stop';
      for await (const part of s) {
        const d = part.choices?.[0]?.delta?.content;
        if (d) { text += d; yield { delta: d }; }
        if (part.choices?.[0]?.finish_reason) finishReason = part.choices[0].finish_reason;
        if (part.usage) {
          usage = { inputTokens: part.usage.prompt_tokens ?? 0, outputTokens: part.usage.completion_tokens ?? 0 };
        }
      }
      yield { done: true, text, usage, finishReason };
    },
  };
}

module.exports = { create };
