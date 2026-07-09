const { execFileSync } = require('child_process');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');

const REPO = 'gitset-dev/gitset';

const TYPE_LABELS = {
    bug: ['user-feedback', 'bug'],
    suggestion: ['user-feedback', 'feature-request'],
    qos: ['user-feedback'],
};

const TYPE_TITLES = {
    bug: 'Bug Report',
    suggestion: 'Feature Suggestion',
    qos: 'Quality of Service Feedback',
};

function ghAvailable() {
    try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; }
    catch { return false; }
}

function ensureLabel(name, color, description) {
    try {
        execFileSync('gh', ['label', 'create', name, '--repo', REPO, '--color', color, '--description', description], { stdio: 'ignore' });
    } catch { }
}

function buildBody(message, tool, version, includeSystemInfo) {
    const lines = [message.trim(), ''];
    if (includeSystemInfo) {
        lines.push(
            '<details>',
            '<summary>Metadata</summary>',
            '',
            '- Source: cli',
            tool ? `- Tool/command: ${tool}` : null,
            `- Version: ${version}`,
            `- OS: ${os.platform()}-${os.arch()}`,
            '',
            '</details>',
        );
    }
    return lines.filter((l) => l !== null).join('\n');
}

module.exports = async function commandFeedback() {
    console.log('\n=== Gitset Feedback ===\n');

    if (!ghAvailable()) {
        log('The `gh` CLI is required to submit feedback (https://cli.github.com).', 'red');
        return 1;
    }

    const type = await selectOption('What kind of feedback would you like to share?', [
        { label: 'Bug Report', value: 'bug' },
        { label: 'Feature Suggestion', value: 'suggestion' },
        { label: 'Quality of Service / General Feedback', value: 'qos' },
    ]);

    let title = '';
    while (!title) {
        title = (await askQuestion('Short title for your feedback: ')).slice(0, 120);
        if (!title) log('A title is required.', 'red');
    }

    const tool = await askQuestion('Which tool or command does this relate to? (optional): ');

    let message = '';
    while (!message) {
        message = await askQuestion('Please describe your feedback: ');
        if (!message) log('A description is required.', 'red');
    }

    const version = require('../../package.json').version;
    const consent = await askQuestion(`May we include your CLI version (${version}) and OS automatically? (Y/n): `);
    const includeSystemInfo = consent.trim().toLowerCase() !== 'n';

    ensureLabel('user-feedback', 'D4A5A5', 'Submitted via the in-app/CLI feedback tool (issue #20).');

    const issueTitle = `[${TYPE_TITLES[type]}] ${title}`;
    const body = buildBody(message, tool, version, includeSystemInfo);
    const labels = TYPE_LABELS[type];

    const args = ['issue', 'create', '--repo', REPO, '--title', issueTitle, '--body', body];
    for (const l of labels) args.push('--label', l);

    log('\nSubmitting feedback...', 'dim');
    try {
        const url = execFileSync('gh', args, { encoding: 'utf8' }).trim();
        log(`\n✔ Feedback successfully submitted! View your issue here: ${url}`, 'green');
        return 0;
    } catch (e) {
        log('Failed to submit feedback (is `gh` authenticated?).', 'red');
        return 1;
    }
};
