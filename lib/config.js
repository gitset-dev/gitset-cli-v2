'use strict';

/**
 * Local BYOAI config for the CLI.
 *
 * Keys live ONLY on the user's machine in ~/.gitset/config.json (chmod 600).
 * They are never sent to any Gitset server — the CLI calls the AI provider
 * directly with the vendored lib/ai. Env vars override stored keys so users
 * can avoid persisting secrets at all (CI-friendly).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
const FILE = path.join(DIR, 'config.json');

const ENV_KEYS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { defaultProvider: null, providers: {} };
  }
}

function writeRaw(cfg) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { fs.chmodSync(FILE, 0o600); } catch {  }
}

function setProvider(name, { apiKey, model, baseUrl, makeDefault } = {}) {
  const provider = String(name || '').toLowerCase();
  if (!provider) throw new Error('Provider name is required.');
  const cfg = readRaw();
  cfg.providers = cfg.providers || {};
  const prev = cfg.providers[provider] || {};
  cfg.providers[provider] = {
    apiKey: apiKey !== undefined ? apiKey : prev.apiKey || null,
    model: model !== undefined ? model : prev.model || null,
    baseUrl: baseUrl !== undefined ? baseUrl : prev.baseUrl || null,
  };
  if (makeDefault || !cfg.defaultProvider) cfg.defaultProvider = provider;
  writeRaw(cfg);
  return cfg.providers[provider];
}

function removeProvider(name) {
  const provider = String(name || '').toLowerCase();
  const cfg = readRaw();
  if (cfg.providers && cfg.providers[provider]) {
    delete cfg.providers[provider];
    if (cfg.defaultProvider === provider) {
      cfg.defaultProvider = Object.keys(cfg.providers)[0] || null;
    }
    writeRaw(cfg);
    return true;
  }
  return false;
}

function list() {
  const cfg = readRaw();
  return Object.entries(cfg.providers || {}).map(([name, p]) => ({
    provider: name,
    isDefault: cfg.defaultProvider === name,
    keyLast4: p.apiKey ? String(p.apiKey).slice(-4) : (process.env[ENV_KEYS[name]] ? 'env' : null),
    model: p.model || null,
    baseUrl: p.baseUrl || null,
  }));
}

function resolve(requested) {
  const cfg = readRaw();
  const provider = String(requested || cfg.defaultProvider || '').toLowerCase();
  if (!provider) {
    throw new Error('No AI provider configured. Run:  gitset config set <provider> --key <api-key>');
  }
  const stored = (cfg.providers && cfg.providers[provider]) || {};
  const envKey = ENV_KEYS[provider] && process.env[ENV_KEYS[provider]];
  const apiKey = envKey || stored.apiKey;
  if (provider !== 'mock' && !apiKey) {
    throw new Error(
      `No API key for "${provider}". Set one:  gitset config set ${provider} --key <api-key>` +
      (ENV_KEYS[provider] ? `  (or export ${ENV_KEYS[provider]})` : ''),
    );
  }
  return {
    provider,
    apiKey: apiKey || null,
    model: stored.model || null,
    baseUrl: stored.baseUrl || null,
  };
}

function getTheme() {
  const cfg = readRaw();
  return cfg.theme === 'light' || cfg.theme === 'dark' ? cfg.theme : null;
}

function setTheme(mode) {
  if (mode !== 'dark' && mode !== 'light') throw new Error('Theme must be "dark" or "light".');
  const cfg = readRaw();
  cfg.theme = mode;
  writeRaw(cfg);
}

// Resolves a provider, and — only when running interactively — offers the
// quick-setup wizard instead of a bare error when nothing is configured yet.
// Non-interactive callers (scripts, --yes, --json) always get the plain
// error, never a prompt.
async function ensureConfigured(requested, { interactive = false } = {}) {
  try {
    return resolve(requested);
  } catch (e) {
    if (!interactive) throw e;
    const { runQuickSetup } = require('./setup-wizard');
    const didSetUp = await runQuickSetup();
    if (!didSetUp) throw e;
    return resolve(requested);
  }
}

module.exports = {
  setProvider, removeProvider, list, resolve, ensureConfigured, getTheme, setTheme, FILE, DIR, ENV_KEYS,
};
