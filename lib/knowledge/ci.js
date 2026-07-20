'use strict';

const WORKFLOW_PATH = '.github/workflows/gitset-knowledge.yml';

const MODES = {
  push: 'on every push to the default branch (paths-filtered; unchanged code costs nothing)',
  releases: 'on every published release',
  weekly: 'weekly (Mondays 06:00 UTC)',
};

function buildTrigger(mode, defaultBranch) {
  if (mode === 'push') {
    return [
      'on:',
      '  workflow_dispatch:',
      '  push:',
      `    branches: [${defaultBranch}]`,
      '    paths-ignore:',
      "      - 'docs/**'",
      "      - '**.md'",
      "      - '.gitignore'",
      "      - 'LICENSE'",
    ];
  }
  if (mode === 'releases') {
    return [
      'on:',
      '  workflow_dispatch:',
      '  release:',
      '    types: [published]',
    ];
  }
  if (mode === 'weekly') {
    return [
      'on:',
      '  workflow_dispatch:',
      '  schedule:',
      "    - cron: '0 6 * * 1'",
    ];
  }
  throw new Error(`Unknown automation mode "${mode}". One of: ${Object.keys(MODES).join(', ')}`);
}

function buildKnowledgeWorkflow({ mode, provider, envKey, model, defaultBranch = 'main' }) {
  if (!provider || !envKey) throw new Error('provider and envKey are required');
  const updateCmd = `gitset knowledge update --yes --provider ${provider}${model ? ` --model ${model}` : ''}`;

  return [
    'name: Gitset Knowledge Mapper',
    `# Incrementally refreshes docs/gitset-knowledge/ with your own AI key.`,
    `# Requires ONE repository secret: ${envKey} (Settings > Secrets > Actions).`,
    '# The key is stored encrypted by GitHub and is only sent to your AI',
    '# provider — never to Gitset. Runs whose mapped source files are',
    '# unchanged exit without any AI call (content-hash diff), so harmless',
    '# triggers cost nothing beyond a few CI seconds.',
    '#',
    '# Also requires "Allow GitHub Actions to create and approve pull',
    '# requests" to be enabled: Settings > Actions > General > Workflow',
    '# permissions. Without it, the update still commits and pushes',
    '# safely, but opening the review PR fails and this job reports it',
    '# as a failure so it is never silently missed.',
    '#',
    '# If your organization enforces that setting off and it cannot be',
    '# changed (the checkbox is greyed out even at the org level), add an',
    '# optional repository secret GITSET_PR_TOKEN — a personal access',
    '# token (classic: repo scope; fine-grained: Pull requests write) —',
    '# and this workflow uses it instead of the default token, which is',
    "# the standard workaround: an organization's PR-creation restriction",
    '# applies to the auto-generated Actions token, not to a real PAT.',
    '# No workflow changes needed after adding it — the next run picks it',
    '# up automatically.',
    ...buildTrigger(mode, defaultBranch),
    'permissions:',
    '  contents: write',
    '  pull-requests: write',
    'concurrency:',
    '  group: gitset-knowledge',
    '  cancel-in-progress: false',
    'jobs:',
    '  update:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '20'",
    '      - run: npm install -g @gitset-dev/cli',
    '      - name: Update knowledge base',
    '        env:',
    `          ${envKey}: \${{ secrets.${envKey} }}`,
    `        run: ${updateCmd}`,
    '      - name: Open a PR when the knowledge base changed',
    '        env:',
    '          GH_TOKEN: ${{ secrets.GITSET_PR_TOKEN || github.token }}',
    '        run: |',
    '          if git diff --quiet -- docs/gitset-knowledge AGENTS.md; then',
    '            echo "Knowledge base already up to date."',
    '            exit 0',
    '          fi',
    '          git config user.name "github-actions[bot]"',
    '          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
    '          git switch -c gitset/knowledge-update',
    '          git add docs/gitset-knowledge AGENTS.md',
    '          git commit -m "docs: refresh knowledge base"',
    '          git push -f origin gitset/knowledge-update',
    '          echo "Committed and pushed gitset/knowledge-update — this work is now safe on GitHub regardless of the next step."',
    '          if PR_OUTPUT=$(gh pr create --title "docs: refresh knowledge base" --body "Automated incremental update by [Gitset](https://gitset.dev) Knowledge Mapper. Only changed modules were re-analyzed; review like any other docs change." 2>&1); then',
    '            echo "$PR_OUTPUT"',
    '          elif echo "$PR_OUTPUT" | grep -qi "already exists"; then',
    '            echo "A pull request for gitset/knowledge-update already exists — nothing further to do."',
    '            echo "$PR_OUTPUT"',
    '          else',
    '            echo "$PR_OUTPUT"',
    '            echo "::error::Could not open the pull request automatically (the branch and commit ARE safely pushed — no work was lost). Try, in order: (1) enable \'Allow GitHub Actions to create and approve pull requests\' under Settings > Actions > General > Workflow permissions; (2) if that checkbox is greyed out, your organization enforces it off — add a repository secret named GITSET_PR_TOKEN with a personal access token (repo scope) and re-run, no workflow change needed; (3) open the PR yourself: https://github.com/${{ github.repository }}/pull/new/gitset/knowledge-update"',
    '            exit 1',
    '          fi',
    '',
  ].join('\n');
}

module.exports = {
  WORKFLOW_PATH,
  MODES,
  buildKnowledgeWorkflow,
};
