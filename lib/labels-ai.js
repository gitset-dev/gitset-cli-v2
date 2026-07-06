'use strict';

/**
 * AI label suggestions for issues / PRs (BYOAI, local). Mirrors the web
 * tools' label generator. Returns an array of {name,color,description}.
 */
const genLocal = require('./generate-local');

function parseLabels(text) {
  let t = String(text || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  const a = t.indexOf('['); const b = t.lastIndexOf(']');
  if (a !== -1 && b !== -1) {
    try {
      const arr = JSON.parse(t.slice(a, b + 1));
      if (Array.isArray(arr)) {
        return arr
          .filter((l) => l && l.name)
          .map((l) => ({
            name: String(l.name).trim(),
            color: String(l.color || '').replace('#', '') || 'ededed',
            description: String(l.description || '').slice(0, 100),
          }));
      }
    } catch {  }
  }
  return [];
}

async function suggestLabels(opts = {}) {
  const r = await genLocal.generate({
    tool: 'labels',
    ctx: { title: opts.title || '', body: opts.body || '', existing: opts.existing || '' },
    provider: opts.provider,
    model: opts.model,
    maxTokens: 1024,
    temperature: 0.3,
  });
  return parseLabels(r.raw || r.text);
}

module.exports = { suggestLabels, parseLabels, AIError: genLocal.AIError };
