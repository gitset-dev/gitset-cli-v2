'use strict';

/**
 * Local, BYOAI commit-message generation.
 *
 * Runs entirely on the user's machine: reads the staged diff via git, builds
 * the prompt through the vendored prompt boundary, and calls the user's own
 * AI provider through the vendored lib/ai. No Gitset backend, no telemetry,
 * the API key never leaves the process.
 */
const { execFileSync } = require('child_process');
const { createProvider, AIError } = require('./ai');
const promptPack = require('./prompts');
const { loadTemplate } = require('./generate-local');

function getStagedChanges(cwd = process.cwd()) {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  let diff = '';
  let stat = '';
  try {
    diff = git(['diff', '--cached', '--no-color']);
    stat = git(['diff', '--cached', '--shortstat']);
  } catch (e) {
    const err = new Error('Not a git repository, or git is unavailable.');
    err.cause = e;
    throw err;
  }
  return { diff, stat };
}

function parseMessage(raw) {
  let m = String(raw || '').trim();

  m = m.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  return m;
}

async function generateCommitMessage(opts) {
  const { providerCfg, diff, stats = '', style = 'conventional', instruction = '', previous = '', signal } = opts;
  if (!diff || !diff.trim()) {
    const e = new Error('Nothing staged. `git add` your changes first.');
    e.code = 'NO_STAGED_CHANGES';
    throw e;
  }

  const provider = createProvider({
    provider: providerCfg.provider === 'custom' ? 'openai' : providerCfg.provider,
    apiKey: providerCfg.apiKey,
    baseURL: providerCfg.baseUrl || undefined,
    model: providerCfg.model || undefined,
  });

  const req = promptPack.toAIRequest('commit', {
    diff, stats, style, instruction, previous, template: loadTemplate('commit'),
  }, { temperature: 0.4, maxTokens: 1024, signal });

  const result = await provider.generate(req);
  return {
    message: parseMessage(result.text),
    provider: providerCfg.provider,
    model: result.model,
    usage: result.usage,
  };
}

module.exports = { getStagedChanges, generateCommitMessage, parseMessage, AIError };
