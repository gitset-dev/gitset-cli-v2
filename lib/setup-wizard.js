'use strict';

/**
 * Interactive BYOAI provider setup. Triggered by:
 *   - `gitset config` with no providers configured yet
 *   - `gitset config set` with no provider argument
 *   - any AI command hitting "no provider configured" while running
 *     interactively (never in scripts/--yes/--json — those keep the plain
 *     error so they never block on a prompt)
 *
 * Returns true if a provider was saved, false if the user backed out.
 */
const { askQuestion, askSecret, selectOption } = require('../src/utils/ui');
const theme = require('../src/utils/theme');
const config = require('./config');
const { PROVIDERS, SUPPORTED, isForbiddenModel } = require('./ai/capabilities');

const CUSTOM_MODEL = '__custom_model__';

async function pickModel(meta) {
  const models = Array.isArray(meta.models) && meta.models.length ? meta.models : [meta.defaultModel];
  const choices = models.map((m, i) => ({
    label: i === 0 ? `${m}  ${theme.dim('(recommended)')}` : m,
    value: m,
  }));
  choices.push({ label: 'Type a different model id', value: CUSTOM_MODEL });

  const picked = await selectOption(`Model (default: ${meta.defaultModel}):`, choices);
  if (picked !== CUSTOM_MODEL) return picked;

  const typed = (await askQuestion('Model id: ')).trim();
  return typed || meta.defaultModel;
}

async function runQuickSetup() {
  if (!process.stdin.isTTY) return false;

  console.log();
  console.log(theme.bold("Let's connect your AI provider."));
  console.log(theme.dim('Your key is stored only on this machine — it never touches a Gitset server.'));

  const providerChoices = SUPPORTED.filter((p) => p !== 'mock').map((id) => ({
    label: PROVIDERS[id].label,
    value: id,
  }));
  providerChoices.push({ label: 'Custom (any OpenAI-compatible endpoint)', value: 'custom' });

  let provider;
  try {
    provider = await selectOption('Pick your AI provider:', providerChoices);
  } catch {
    return false;
  }

  const meta = PROVIDERS[provider] || {};

  let baseUrl;
  if (provider === 'custom') {
    baseUrl = (await askQuestion('Base URL (e.g. https://api.example.com/v1): ')).trim();
    if (!baseUrl) {
      console.log(theme.warn('A base URL is required for a custom provider. Setup cancelled.'));
      return false;
    }
  }

  const hint = meta.keyHint ? theme.dim(` (starts like ${meta.keyHint})`) : '';
  let apiKey;
  try {
    apiKey = await askSecret(`Paste your ${meta.label || provider} API key${hint}: `);
  } catch {
    console.log(theme.warn('\nSetup cancelled.'));
    return false;
  }
  if (!apiKey) {
    console.log(theme.warn('No key entered — setup cancelled.'));
    return false;
  }

  let model;
  if (provider === 'custom') {
    model = (await askQuestion('Model id for this endpoint: ')).trim();
  } else {
    model = await pickModel(meta);
  }
  if (isForbiddenModel(model)) {
    console.log(theme.error(`"${model}" isn't available through Gitset — using ${meta.defaultModel} instead.`));
    model = meta.defaultModel;
  }

  const existing = config.list();
  let makeDefault = true;
  if (existing.length > 0) {
    const ans = (await askQuestion(`Make ${provider} your default provider? [Y/n] `)).trim().toLowerCase();
    makeDefault = ans !== 'n';
  }

  config.setProvider(provider, { apiKey, model: model || undefined, baseUrl, makeDefault });

  console.log();
  console.log(
    `${theme.success('✓')} ${provider} configured` +
      (makeDefault ? ' (default)' : '') +
      (model ? ` — model: ${theme.accent(model)}` : ''),
  );
  console.log(theme.dim(`Stored locally at ${config.FILE} (chmod 600).`));
  console.log();
  console.log(theme.dim('Try it now:'));
  console.log(`  ${theme.accent('gitset commit')}    draft a commit message from staged changes`);
  console.log(`  ${theme.accent('gitset init')}      scaffold editable templates for every tool`);
  console.log();

  return true;
}

module.exports = { runQuickSetup };
