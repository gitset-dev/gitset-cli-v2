'use strict';

/**
 * `gitset config` — manage local BYOAI provider credentials.
 * Keys are stored only on this machine (~/.gitset/config.json, chmod 600)
 * and are sent directly to the chosen AI provider, never to Gitset.
 */
const config = require('./config');
const { SUPPORTED, isForbiddenModel } = require('./ai');
const theme = require('../src/utils/theme');
const { selectOption } = require('../src/utils/ui');
const { runQuickSetup } = require('./setup-wizard');

const ok = (s) => console.log(`${theme.success('✓')} ${s}`);
const err = (s) => console.error(`${theme.error('✗')} ${s}`);

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}
const has = (argv, name) => argv.includes(name);

const PROVIDERS = [...SUPPORTED.filter((p) => p !== 'mock'), 'custom'];

function usage() {
  console.log(`gitset config — BYOAI provider setup

  ${theme.accent('gitset config')}                interactive setup (recommended)
  gitset config set <provider> --key <api-key> [--model <m>] [--base-url <url>] [--default]
  gitset config list
  gitset config remove <provider>
  gitset config theme <dark|light>
  gitset config path

Providers: ${PROVIDERS.join(', ')}
Env override: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY`);
}

function printList() {
  const rows = config.list();
  if (rows.length === 0) {
    console.log('No providers configured yet.');
    return;
  }
  for (const r of rows) {
    const def = r.isDefault ? theme.success(' (default)') : '';
    const key = r.keyLast4 ? `••••${r.keyLast4}` : theme.warn('no key');
    console.log(`${theme.bold(r.provider)}${def}\n  key: ${key}${r.model ? `  model: ${theme.accent(r.model)}` : ''}${r.baseUrl ? `  base: ${r.baseUrl}` : ''}`);
  }
}

// Bare `gitset config` — an always-interactive control panel, not a one-shot
// printout. Nothing set up yet? Straight to the add-provider wizard. Already
// configured? A real menu (add / remove / default / theme), looping until
// the user picks "Done" — never a dead end that just prints and exits.
async function runInteractiveHub() {
  for (;;) {
    const rows = config.list();
    if (rows.length === 0) {
      return await runQuickSetup();
    }

    console.log();
    console.log(theme.bold('Configured providers:'));
    printList();

    let choice;
    try {
      choice = await selectOption('What do you want to do?', [
        { label: 'Add another provider', value: 'add' },
        { label: 'Set the default provider', value: 'default' },
        { label: 'Remove a provider', value: 'remove' },
        { label: `Switch theme (currently ${theme.mode()})`, value: 'theme' },
        { label: 'Done', value: 'done' },
      ]);
    } catch {
      return true; // e.g. Ctrl+D — leave quietly, nothing pending to save
    }

    if (choice === 'done') return true;

    if (choice === 'add') { await runQuickSetup(); continue; }

    if (choice === 'default') {
      const provider = await selectOption(
        'Make which provider the default?',
        rows.map((r) => ({ label: r.provider + (r.isDefault ? '  (current default)' : ''), value: r.provider })),
      );
      const row = rows.find((r) => r.provider === provider);
      config.setProvider(provider, { model: row.model || undefined, baseUrl: row.baseUrl || undefined, makeDefault: true });
      ok(`${provider} is now the default.`);
      continue;
    }

    if (choice === 'remove') {
      const provider = await selectOption(
        'Remove which provider?',
        rows.map((r) => ({ label: r.provider + (r.isDefault ? '  (default)' : ''), value: r.provider })),
      );
      config.removeProvider(provider);
      ok(`Removed ${provider}.`);
      continue;
    }

    if (choice === 'theme') {
      const mode = await selectOption('Pick a theme:', [
        { label: 'Dark terminal', value: 'dark' },
        { label: 'Light terminal', value: 'light' },
      ]);
      config.setTheme(mode);
      ok(`Theme set to ${mode}.`);
      continue;
    }
  }
}

async function runConfigCommand(argv) {
  const sub = argv[0];

  if (!sub) {
    if (!process.stdin.isTTY) {
      if (config.list().length === 0) {
        err('No AI provider configured. In a non-interactive shell, set one directly:');
        console.log('  gitset config set anthropic --key <api-key> --default');
        return 1;
      }
      printList();
      return 0;
    }
    const ranOk = await runInteractiveHub();
    return ranOk ? 0 : 1;
  }

  if (sub === 'help' || sub === '--help') { usage(); return 0; }

  if (sub === 'path') { console.log(config.FILE); return 0; }

  if (sub === 'list') { printList(); return 0; }

  if (sub === 'theme') {
    const value = argv[1];
    if (value !== 'dark' && value !== 'light') {
      err('Usage: gitset config theme <dark|light>');
      return 1;
    }
    config.setTheme(value);
    ok(`Theme set to ${value}.`);
    return 0;
  }

  if (sub === 'set') {
    const provider = argv[1] && !argv[1].startsWith('--') ? argv[1].toLowerCase() : null;

    // `gitset config set` with no provider named — same wizard as bare
    // `gitset config`, just reachable from the more discoverable verb.
    if (!provider) {
      if (!process.stdin.isTTY) {
        err('Usage: gitset config set <provider> --key <api-key> [--model m] [--default]');
        return 1;
      }
      const didSetUp = await runQuickSetup();
      return didSetUp ? 0 : 1;
    }

    if (!PROVIDERS.includes(provider)) {
      err(`Unknown provider "${provider}". One of: ${PROVIDERS.join(', ')}`);
      return 1;
    }
    const apiKey = flag(argv, '--key');
    const model = flag(argv, '--model');
    const baseUrl = flag(argv, '--base-url');
    if (!apiKey && !model && !baseUrl) {
      err('Nothing to set. Provide at least --key (or --model / --base-url).');
      return 1;
    }
    if (isForbiddenModel(model)) {
      err(`Model "${model}" can't be used with Gitset — choose a different model.`);
      return 1;
    }
    if (provider === 'custom' && !baseUrl && !config.list().find((x) => x.provider === 'custom')) {
      err('Provider "custom" requires --base-url (an OpenAI-compatible endpoint).');
      return 1;
    }
    config.setProvider(provider, {
      apiKey: apiKey || undefined,
      model: model || undefined,
      baseUrl: baseUrl || undefined,
      makeDefault: has(argv, '--default'),
    });
    ok(`Saved ${provider}${has(argv, '--default') ? ' (default)' : ''}. Stored locally at ${config.FILE} (chmod 600).`);
    return 0;
  }

  if (sub === 'remove') {
    const provider = argv[1] ? argv[1].toLowerCase() : null;
    if (!provider) { err('Usage: gitset config remove <provider>'); return 1; }
    if (config.removeProvider(provider)) { ok(`Removed ${provider}.`); return 0; }
    err(`Provider "${provider}" was not configured.`);
    return 1;
  }

  err(`Unknown subcommand "${sub}".`);
  usage();
  return 1;
}

module.exports = { runConfigCommand };
