const { execFileSync } = require('child_process');
const { log } = require('../utils/ui');
const theme = require('../utils/theme');

function ghAvailable() {
    try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; }
    catch { return false; }
}

function showStatus() {
    console.log(`\n=== Gitset Auth (via GitHub CLI) ===\n`);
    try {
        execFileSync('gh', ['auth', 'status'], { stdio: 'inherit' });
    } catch {
        log('\nYou are not logged in with the GitHub CLI. Run: gh auth login', 'yellow');
    }
    console.log(`
${theme.bold('How Gitset access works')}
  Locally, Gitset uses your own ${theme.accent('gh')} authentication for every GitHub
  action (issues, PRs, releases, labels). No Gitset account is involved.

  ${theme.bold('Missing an organization or repository?')}
  - Local CLI:   run ${theme.accent('gitset auth sync')} to re-run GitHub's authorization
                 and approve additional organizations or scopes.
  - Web app:     open ${theme.accent('https://gitset.dev/dashboard')} → GitHub connection →
                 Manage organization access.
`);
    return 0;
}

function sync() {
    console.log(`\n=== Gitset Auth Sync ===\n`);
    log('Re-running GitHub authorization. Approve any missing organizations when your browser opens.', 'dim');
    try {
        execFileSync('gh', ['auth', 'refresh'], { stdio: 'inherit' });
        log('\n✔ GitHub access refreshed. Newly granted organizations are now available.', 'green');
        return 0;
    } catch {
        log('\nAuthorization was not completed. You can retry with `gitset auth sync` or run `gh auth refresh` directly.', 'red');
        return 1;
    }
}

module.exports = function commandAuth(rest = []) {
    if (!ghAvailable()) {
        log('The `gh` CLI is required (https://cli.github.com). Gitset uses your own gh authentication — no Gitset account exists.', 'red');
        return 1;
    }
    const sub = (rest[0] || 'status').toLowerCase();
    if (sub === 'sync' || sub === 'refresh') return sync();
    if (sub === 'status') return showStatus();
    log(`Unknown subcommand "${sub}". Use: gitset auth [status|sync]`, 'red');
    return 1;
};
