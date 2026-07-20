'use strict';

/**
 * Generic local BYOAI text generation for any Gitset tool (commit/issue/pr/
 * readme/release/about). Runs on the user's machine with their own key via
 * the vendored lib/ai + lib/prompts boundary — no backend, no telemetry.
 *
 * This is the shared engine the CLI commands route through (commit has its
 * own thin wrapper in commit-local.js; everything else uses this).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('./config');
const { createProvider, AIError } = require('./ai');
const promptPack = require('./prompts');

function stripFences(raw) {
  let m = String(raw || '').trim();
  return m.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

function loadTemplate(tool) {
  const dir = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
  try {
    return fs.readFileSync(path.join(dir, 'templates', `${tool}.md`), 'utf8').trim();
  } catch {
    return '';
  }
}

async function generate(opts) {
  const { tool, ctx = {}, provider: providerName, model, maxTokens = 4096, temperature = 0.4, signal, interactive = false } = opts;

  if (!promptPack.listPrompts().includes(tool)) {
    throw new Error(`Unknown tool "${tool}". One of: ${promptPack.listPrompts().join(', ')}`);
  }

  const cfg = await config.ensureConfigured(providerName, { interactive });
  const provider = createProvider({
    provider: cfg.provider === 'custom' ? 'openai' : cfg.provider,
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    model: model || cfg.model || undefined,
  });

  const fullCtx = { ...ctx, template: ctx.template || loadTemplate(tool) };
  const req = promptPack.toAIRequest(tool, fullCtx, { maxTokens, temperature, signal });
  const result = await provider.generate(req);
  return {
    text: stripFences(result.text),
    raw: result.text,
    provider: cfg.provider,
    model: result.model,
    usage: result.usage,
    finishReason: result.finishReason,
  };
}

module.exports = { generate, stripFences, loadTemplate, AIError };
