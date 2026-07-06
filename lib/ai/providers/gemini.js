'use strict';

function create({ apiKey, model, timeoutMs = 60_000 }) {
  let ai;
  function getClient() {
    if (ai) return ai;
    const { GoogleGenAI } = require('@google/genai');
    ai = new GoogleGenAI({ apiKey });
    return ai;
  }

  function toContents(req) {
    return (req.messages || []).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  }

  function buildConfig(req) {
    const cfg = {
      temperature: req.temperature ?? 0.7,
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      ...(req.system ? { systemInstruction: req.system } : {}),
    };
    const ac = req.signal ? { abortSignal: req.signal } : {};
    return { config: cfg, http: { ...ac, timeout: timeoutMs } };
  }

  return {
    name: 'gemini',

    async generate(req) {
      const { config, http } = buildConfig(req);
      const resp = await getClient().models.generateContent({
        model: req.model || model,
        contents: toContents(req),
        config,
        httpOptions: http,
      });
      const u = resp.usageMetadata || {};
      return {
        text: resp.text || '',
        usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: u.candidatesTokenCount ?? 0 },
        model: req.model || model,
        finishReason: resp.candidates?.[0]?.finishReason || 'stop',
        raw: resp,
      };
    },

    async *stream(req) {
      const { config, http } = buildConfig(req);
      const s = await getClient().models.generateContentStream({
        model: req.model || model,
        contents: toContents(req),
        config,
        httpOptions: http,
      });
      let text = '';
      let usage = { inputTokens: 0, outputTokens: 0 };
      let finishReason = 'stop';
      for await (const chunk of s) {
        if (chunk.text) { text += chunk.text; yield { delta: chunk.text }; }
        if (chunk.usageMetadata) {
          usage = {
            inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
            outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
          };
        }
        const fr = chunk.candidates?.[0]?.finishReason;
        if (fr) finishReason = fr;
      }
      yield { done: true, text, usage, finishReason };
    },
  };
}

module.exports = { create };
