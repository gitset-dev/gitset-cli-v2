#!/usr/bin/env node
'use strict';

/**
 * Gitset CLI — everything around your code, drafted in your terminal (BYOAI).
 *
 * Slim dispatcher. Every AI command runs LOCALLY with the user's own
 * provider key (managed by `gitset config`, stored in ~/.gitset, never
 * transmitted). There is NO login and NO Gitset backend — the entire old
 * gitset_key / remote-API system has been removed.
 */

const theme = require('./src/utils/theme');

function showHelp() {
  console.log(`${theme.bold('gitset')} — everything around your code, drafted in your terminal (BYOAI)

${theme.bold('First time?')} Run ${theme.accent('gitset config')} — an interactive wizard sets up your AI provider in under a minute.

${theme.bold('Found a bug or have a suggestion?')} Run ${theme.accent('gitset feedback')} anytime.

${theme.bold('AI commands')} (use your own provider key):
  commit            Generate a commit message from staged changes
  pr                Generate a pull-request description from the branch diff
  issue             Draft a GitHub issue from a description
  readme            Generate a README from repo context
  release           Generate release notes from the commit range
  gitignore         Generate a .gitignore for the detected stack
  repo about        AI repo description + topics, applied via gh

${theme.bold('Local tools')} (no AI):
  repo license      Generate a LICENSE file (offline)
  repo backup       Write a secure mirror-backup GitHub Actions workflow
  tree              Print the repository structure
  labelspack        Apply a label pack to the current repo
  dependabot        Resolve Dependabot alerts
  status            Show git + provider status
  template          Manage local templates (~/.gitset/templates), edit <tool> to customize
  init              Scaffold local templates
  feedback          Report a bug, suggest a feature, or share feedback
  auth              Check GitHub access, or sync org permissions (auth sync)

${theme.bold('Setup')}:
  config                                interactive setup wizard
  config set <provider> --key <key> [--model m] [--default]
  config list | remove <provider> | theme <dark|light> | path

${theme.bold('Common flags')}: --provider <p> --model <m> --yes --json --print
Providers: anthropic · openai · gemini · openrouter · custom
Run ${theme.accent('gitset help <command>')} or ${theme.accent('gitset <command> --help')} for command details.

Gitset is open source & BYOAI: no accounts, no quotas, keys stay on your machine.
${theme.bold('Draft. Refine. Ship.')} — https://gitset.dev`);
}

const USAGE = {
  commit: `Usage: gitset commit [flags]
Generate a commit message from staged changes, with interactive refine.
  --provider <p>   override the default provider for this run
  --model <m>      override the model
  --style <s>      commit style (default: conventional)
  --all, -a        git add -A before generating
  --yes            accept the first result (non-interactive)
  --print          print the message only; do not commit
  --json           machine-readable output
Exit codes: 0 ok · 1 usage/git · 2 provider error`,
  pr: `Usage: gitset pr [flags]
Generate a pull-request description from the branch diff.
  --base <branch>  base branch (default: detected)
  --title <t>      PR title (default: generated)
  --create         open the PR via gh after accepting
  --provider <p> · --model <m> · --yes · --print · --json
Exit codes: 0 ok · 1 usage · 2 provider error`,
  issue: `Usage: gitset issue --message <description> [flags]
Draft a GitHub issue from a description (+ local repo context).
  --message, -m    what the issue is about (required)
  --title <t>      issue title (default: generated)
  --create         create the issue via gh after accepting
  --provider <p> · --model <m> · --yes · --print · --json
Exit codes: 0 ok · 1 usage · 2 provider error`,
  readme: `Usage: gitset readme [flags]
Generate a README from local repo context (git-tracked files).
  --output <file>  write path (default: README.md)
  --template <f>   use a template file as the structural base
  --force          overwrite an existing file
  --provider <p> · --model <m> · --yes · --print · --json
Exit codes: 0 ok · 1 usage/io · 2 provider error`,
  release: `Usage: gitset release [flags]
Generate release notes from a commit range.
  --from <ref>     start ref (default: last tag)
  --to <ref>       end ref (default: HEAD)
  --version <v>    release version/tag name
  --provider <p> · --model <m>`,
  gitignore: `Usage: gitset gitignore [flags]
Generate a .gitignore for the locally detected stack.
  --select         type the stacks yourself instead of auto-detect
  --append         append to the existing .gitignore
  --force          overwrite the existing .gitignore
  --provider <p> · --model <m> · --print`,
  repo: `Usage: gitset repo <about|license|backup> [flags]
  about    AI description + topics from local context, applied via gh
           (--apply · --yes · --provider <p> · --model <m>)
  license  generate a LICENSE file (offline; see gitset license --list)
  backup   write a secure mirror-backup GitHub Actions workflow`,
  license: `Usage: gitset license [--id <spdx>] [--owner <name>] [--list] [--force]
Fully offline LICENSE generator (MIT, ISC, BSD, Apache-2.0, Unlicense).`,
  tree: `Usage: gitset tree [flags]
Print the repository structure.
  --depth <n>      limit depth
  --all            include dotfiles
  --exclude <pat>  exclude pattern (repeatable)
  --no-gitignore   don't honor .gitignore`,
  labelspack: `Usage: gitset labelspack [flags]
Manage & apply a label pack (local pack + gh).
  (none)           list the pack
  --apply          create/update the labels in the current repo via gh
  --init           write the default pack to ~/.gitset/labels.md
  --add --name <x> --color <hex> --description "..."   add a label
  --sync           pull the repo's labels into the local pack`,
  dependabot: `Usage: gitset dependabot [--resolve] [--dry-run] [--save-dev]
Resolve Dependabot alerts for the current repo (local + gh).`,
  status: `Usage: gitset status
Show git + configured-provider status.`,
  template: `Usage: gitset template <list|show|edit|path>
Manage local templates in ~/.gitset/templates.
  list             show templates you have
  show <name>      print a template's contents
  edit <name>      open (or create) a template in $EDITOR
  path             print the templates directory`,
  init: `Usage: gitset init
Scaffold the local template directory.`,
  feedback: `Usage: gitset feedback
Interactively submit a bug report, feature suggestion, or general feedback.
Filed as a GitHub issue in gitset-dev/gitset via your own \`gh\` auth.`,
  auth: `Usage: gitset auth [status|sync]
  status (default)  show your GitHub CLI auth status and access guidance
  sync              re-run GitHub authorization to approve additional
                    organizations or scopes (wraps \`gh auth refresh\`)
Gitset uses your own gh authentication locally — there is no Gitset account.
Web app permissions: gitset.dev/dashboard → GitHub connection.`,
  config: `Usage: gitset config [set|list|remove|theme|path]
  (no args)        interactive setup wizard
  set              interactive wizard, or: set <provider> --key <key> [--model m] [--base-url u] [--default]
  list             show configured providers (keys never printed)
  remove <provider>
  theme <dark|light>   colors tuned for your terminal background
  path             print the config file location
Providers: anthropic · openai · gemini · openrouter · custom`,
};

function showCommandHelp(cmd) {
  if (USAGE[cmd]) { console.log(USAGE[cmd]); return 0; }
  console.error(`${theme.error('✗')} Unknown command: ${cmd}`);
  showHelp();
  return 1;
}

function deprecatedAuth(name) {
  console.log(`${theme.warn('ℹ')} \`gitset ${name}\` was removed — Gitset v2 is BYOAI, there is no login.
  Configure a provider instead:  ${theme.accent('gitset config')}`);
  return 0;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);
  let code = 0;

  if (command === 'help' && rest[0]) {
    process.exitCode = showCommandHelp(rest[0]);
    return;
  }
  if (command && command !== 'help' && (rest.includes('--help') || rest.includes('-h'))) {
    process.exitCode = showCommandHelp(command);
    return;
  }

  switch (command) {
    case 'commit':
      code = await require('./lib/cli-commit').runCommitCommand(rest); break;
    case 'pr':
      code = await require('./lib/cli-pr').runPrCommand(rest); break;
    case 'issue':
      code = await require('./lib/cli-issue').runIssueCommand(rest); break;
    case 'readme':
      code = await require('./lib/cli-readme').runReadmeCommand(rest); break;
    case 'gitignore':
      code = await require('./src/commands/gitignore').runGitignoreCommand(rest); break;
    case 'release':
      code = await require('./src/commands/release')({
        from: optVal(args, '--from'), to: optVal(args, '--to'), version: optVal(args, '--version'),
        provider: optVal(args, '--provider'), model: optVal(args, '--model'),
      }) || 0; break;

    case 'config':
      code = await require('./lib/cli-config').runConfigCommand(rest); break;

    case 'repo':
      code = await require('./src/commands/repo').runRepoCommand(rest); break;

    case 'tree':
      code = require('./src/commands/tree').runTreeCommand(rest); break;
    case 'status':
      code = require('./src/commands/status').runStatusCommand(); break;
    case 'init':
      code = require('./src/commands/init').runInitCommand(); break;
    case 'template':
      code = require('./src/commands/template').runTemplateCommand(rest); break;
    case 'license':
      code = await require('./src/commands/license').runLicenseCommand(rest); break;
    case 'labelspack':
      code = await require('./src/commands/labelspack').runLabelspackCommand(rest); break;
    case 'dependabot':
      code = (await require('./src/commands/dependabot-resolver')(null, rest)) || 0; break;
    case 'feedback':
      code = (await require('./src/commands/feedback')()) || 0; break;

    case 'auth':
      code = require('./src/commands/auth')(rest) || 0; break;

    case 'verify': case 'logout':
      code = deprecatedAuth(command); break;

    case 'help': case '--help': case '-h': case undefined:
      showHelp(); break;

    case 'version': case '--version': case '-v':
      console.log(require('./package.json').version); break;

    default:
      console.error(`${theme.error('✗')} Unknown command: ${command}`);
      showHelp();
      code = 1;
  }

  process.exitCode = code || 0;
}

function optVal(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

main().catch((err) => {
  console.error(`${theme.error('✗')} Fatal: ${err && err.message ? err.message : err}`);
  process.exit(1);
});
