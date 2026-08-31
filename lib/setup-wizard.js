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
const { fetchFreeModels } = require('./openrouter-free-models');

const CUSTOM_MODEL = '__custom_model__';
const MORE_MODELS = '__more_models__';

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

// OpenRouter's free tier is the one path in `gitset config` that needs no
// payment method at all — the picker leads with that instead of treating it
// like every other (paid) provider. Shown before the key is requested, so a
// brand-new user learns where to get one before being asked to paste it.
async function pickOpenRouterModel(meta) {
  console.log();
  console.log(theme.bold('Free OpenRouter models — no card, no payment required.'));
  const { models: freeModels, live, cachedAt } = await fetchFreeModels();

  // Nothing live and nothing cached (first run, offline). Inventing a list
  // from memory is how a dead model gets recommended with confidence —
  // say so and let them type an id instead.
  if (!freeModels.length) {
    console.log(theme.dim("Couldn't reach the free-model list, and there's no cached copy yet."));
    console.log(theme.dim(`Browse the current free models at ${theme.accent('https://openrouter.ai/models?max_price=0')}`));
    console.log();
    const typed = (await askQuestion('Model id (blank to pick a paid model instead): ')).trim();
    return typed || pickModel(meta);
  }

  if (!live) {
    const when = cachedAt ? ` from ${String(cachedAt).slice(0, 10)}` : '';
    console.log(theme.dim(`(Offline — showing the last list fetched${when}. Availability may have changed since.)`));
  }
  for (const m of freeModels) {
    console.log(`  ${theme.accent(m.label)}${m.recommended ? theme.dim(' (recommended)') : ''}  ${theme.dim(m.id)}`);
    console.log(`    ${theme.dim(m.goodFor)}`);
  }
  console.log();
  console.log(theme.dim("Don't have a key yet? Create a free one:"));
  console.log(`  1. Sign in at ${theme.accent('https://openrouter.ai')} — Google sign-in is fastest if you have no account.`);
  console.log(`  2. Open ${theme.accent('https://openrouter.ai/workspaces/default/keys')} (new accounts land here by default).`);
  console.log('  3. Click Create Key, name it anything, and paste it when this wizard asks.');
  console.log(theme.dim('  No payment method is required. Daily limits vary by model — pick a different one below if one is busy.'));
  console.log();

  const choices = freeModels.map((m) => ({ label: `${m.label}${m.recommended ? '  (recommended)' : ''} — ${m.id}`, value: m.id }));
  choices.push({ label: 'Use a different / paid model instead', value: MORE_MODELS });
  choices.push({ label: 'Type a different model id', value: CUSTOM_MODEL });

  const picked = await selectOption('Pick a model:', choices);
  if (picked === MORE_MODELS) return pickModel(meta);
  if (picked === CUSTOM_MODEL) {
    const typed = (await askQuestion('Model id: ')).trim();
    return typed || meta.defaultModel;
  }
  return picked;
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

  // OpenRouter's free models need no key at all to browse — show them (and
  // how to get a free key) before asking for one, not after.
  let model;
  if (provider === 'openrouter') {
    model = await pickOpenRouterModel(meta);
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

  if (provider === 'custom') {
    model = (await askQuestion('Model id for this endpoint: ')).trim();
  } else if (provider !== 'openrouter') {
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
