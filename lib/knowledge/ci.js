'use strict';

const WORKFLOW_PATH = '.github/workflows/gitset-knowledge.yml';

const MODES = {
  push: 'on every push to the default branch (paths-filtered; unchanged code costs nothing)',
  releases: 'on every published release',
  weekly: 'weekly (Mondays 06:00 UTC)',
};

const SYNC_MODES = {
  commit: 'commit updates directly to the default branch (zero setup, works everywhere)',
  pr: 'open a review pull request for each update',
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

function commitModeLines(defaultBranch) {
  return {
    header: [
      '#',
      `# Updates are committed directly to ${defaultBranch} using the built-in`,
      '# Actions token — no extra permissions, tokens, or settings needed.',
      "# It cannot re-trigger itself: GitHub never runs workflows for pushes",
      '# made with the built-in token, and the path filters ignore these',
      '# files anyway.',
    ],
    permissions: [
      'permissions:',
      '  contents: write',
    ],
    checkoutWith: [
      '        with:',
      `          ref: ${defaultBranch}`,
    ],
    finalStep: [
      '      - name: Commit the updated knowledge base',
      '        run: |',
      '          if git diff --quiet -- docs/gitset-knowledge AGENTS.md; then',
      '            echo "Knowledge base already up to date."',
      '            exit 0',
      '          fi',
      '          git config user.name "github-actions[bot]"',
      '          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
      '          git add docs/gitset-knowledge AGENTS.md',
      '          git commit -m "docs: refresh knowledge base"',
      `          git push origin ${defaultBranch} || (git pull --rebase origin ${defaultBranch} && git push origin ${defaultBranch})`,
      `          echo "Knowledge base refreshed directly on ${defaultBranch}."`,
    ],
  };
}

function prModeLines() {
  return {
    header: [
      '#',
      '# PR mode needs ONE of the following (gitset knowledge automate sets',
      '# this up for you):',
      '#   a. "Allow GitHub Actions to create and approve pull requests"',
      '#      enabled under Settings > Actions > General, OR',
      '#   b. a repository secret GITSET_PR_TOKEN holding a GitHub token',
      '#      that can open pull requests (used automatically when present;',
      '#      not subject to organization-level Actions restrictions).',
      '# Without either, the update still commits and pushes its branch',
      '# safely — only opening the review PR fails, and this job reports',
      '# that as a failure so it is never silently missed.',
    ],
    permissions: [
      'permissions:',
      '  contents: write',
      '  pull-requests: write',
    ],
    checkoutWith: [],
    finalStep: [
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
      '            echo "::error::Could not open the pull request automatically (the branch and commit ARE safely pushed — no work was lost). Run \'gitset knowledge automate\' again and pick PR mode to set this up automatically, or add a repository secret GITSET_PR_TOKEN with a GitHub token that can open PRs, or open it yourself: https://github.com/${{ github.repository }}/pull/new/gitset/knowledge-update"',
      '            exit 1',
      '          fi',
    ],
  };
}

function buildKnowledgeWorkflow({ mode, syncMode = 'commit', provider, envKey, model, defaultBranch = 'main' }) {
  if (!provider || !envKey) throw new Error('provider and envKey are required');
  if (!SYNC_MODES[syncMode]) throw new Error(`Unknown sync mode "${syncMode}". One of: ${Object.keys(SYNC_MODES).join(', ')}`);
  const updateCmd = `gitset knowledge update --yes --provider ${provider}${model ? ` --model ${model}` : ''}`;
  const sync = syncMode === 'commit' ? commitModeLines(defaultBranch) : prModeLines();

  return [
    'name: Gitset Knowledge Mapper',
    `# Incrementally refreshes docs/gitset-knowledge/ with your own AI key.`,
    `# Requires ONE repository secret: ${envKey} (Settings > Secrets > Actions).`,
    '# The key is stored encrypted by GitHub and is only sent to your AI',
    '# provider — never to Gitset. Runs whose mapped source files are',
    '# unchanged exit without any AI call (content-hash diff), so harmless',
    '# triggers cost nothing beyond a few CI seconds.',
    ...sync.header,
    ...buildTrigger(mode, defaultBranch),
    ...sync.permissions,
    'concurrency:',
    '  group: gitset-knowledge',
    '  cancel-in-progress: false',
    'jobs:',
    '  update:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    ...sync.checkoutWith,
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '20'",
    '      - run: npm install -g @gitset-dev/cli',
    '      - name: Update knowledge base',
    '        env:',
    `          ${envKey}: \${{ secrets.${envKey} }}`,
    `        run: ${updateCmd}`,
    ...sync.finalStep,
    '',
  ].join('\n');
}

module.exports = {
  WORKFLOW_PATH,
  MODES,
  SYNC_MODES,
  buildKnowledgeWorkflow,
};
