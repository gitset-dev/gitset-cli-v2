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
    '          GH_TOKEN: ${{ github.token }}',
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
    '          gh pr create --title "docs: refresh knowledge base" --body "Automated incremental update by [Gitset](https://gitset.dev) Knowledge Mapper. Only changed modules were re-analyzed; review like any other docs change." || true',
    '',
  ].join('\n');
}

module.exports = {
  WORKFLOW_PATH,
  MODES,
  buildKnowledgeWorkflow,
};
