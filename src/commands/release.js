const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');
const genLocal = require('../../lib/generate-local');
const manifestLib = require('../../lib/manifest');

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

function getTags() {
    const tagsOutput = execCommand('git tag --sort=-creatordate');
    return tagsOutput ? tagsOutput.split('\n').filter(Boolean) : [];
}

function getCommits(from, to) {
    const cmd = `git log ${from}..${to} --pretty=format:"%h|%an|%s"`;
    const output = execCommand(cmd);
    if (!output) return [];
    return output.split('\n').filter(Boolean).map(line => {
        const [hash, author, message] = line.split('|');
        return { hash, author, message };
    });
}

function getCurrentBranch() {
    return execCommand('git rev-parse --abbrev-ref HEAD') || 'HEAD';
}

function getRepoOwnerName() {
    const remoteUrl = execCommand('git config --get remote.origin.url');
    if (!remoteUrl) return '';
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    return match ? `${match[1]}/${match[2]}` : '';
}

function commitsToText(commits) {
    if (!commits || commits.length === 0) return '';
    return commits.map(c => `- ${c.hash || ''} ${c.message || ''} (${c.author || ''})`).join('\n');
}

async function syncManifestVersion(tagName) {
    const newVersion = manifestLib.normalizeVersion(tagName);
    if (!newVersion) return;

    let fileNames;
    try {
        fileNames = fs.readdirSync(process.cwd());
    } catch {
        return;
    }

    const found = manifestLib.detectManifestFile(fileNames);
    if (!found) return;

    const filePath = path.join(process.cwd(), found.file);
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch {
        return;
    }

    let oldVersion;
    try {
        oldVersion = manifestLib.readVersion(found.type, content);
    } catch (err) {
        log(`\nCould not parse ${found.file}, skipping version sync (${err.message}).`, 'yellow');
        return;
    }

    if (!oldVersion) {
        log(`\n${found.file} has no static top-level version field, skipping version sync.`, 'dim');
        return;
    }

    if (oldVersion === newVersion) return;

    let newContent;
    try {
        newContent = manifestLib.bumpVersion(found.type, content, newVersion);
    } catch (err) {
        log(`\nCould not bump ${found.file}, skipping version sync (${err.message}).`, 'yellow');
        return;
    }
    if (!newContent) return;

    log(`\n${found.file} version differs from this release:`, 'cyan');
    log(`  - version: ${oldVersion}`, 'red');
    log(`  + version: ${newVersion}`, 'green');
    log('  Only the top-level version field changes — dependency versions are left untouched.', 'dim');

    const bumpChoice = await selectOption(`Update ${found.file} to ${newVersion} as part of this release?`, [
        { label: `Yes, update ${found.file}`, value: 'yes' },
        { label: 'No, skip', value: 'no' },
    ]);
    if (bumpChoice !== 'yes') return;

    try {
        fs.writeFileSync(filePath, newContent);
        execFileSync('git', ['add', found.file], { stdio: 'pipe' });
        execFileSync('git', ['commit', '-m', `chore: bump version to ${newVersion}`], { stdio: 'pipe' });
        log(`Committed: chore: bump version to ${newVersion}`, 'green');
    } catch (err) {
        log(`Failed to commit the version bump: ${err.message}`, 'red');
        return;
    }

    log('\nThis commit needs to be pushed before creating the release, otherwise the release tag will not include it.', 'dim');
    const pushChoice = await selectOption('Push this commit now?', [
        { label: 'Yes, push', value: 'yes' },
        { label: 'No, I\'ll push it myself', value: 'no' },
    ]);
    if (pushChoice === 'yes') {
        try {
            execFileSync('git', ['push'], { stdio: 'inherit' });
            log('Pushed.', 'green');
        } catch {
            log('Failed to push. Push manually before the release tag will reflect this version.', 'red');
        }
    } else {
        log('Not pushed — the release tag will not include this version bump until you push it.', 'yellow');
    }
}

module.exports = async function commandRelease(options = {}) {
    console.log('\n=== Gitset Release Manager (BYOAI) ===\n');

    let fromRef = options.from;
    let toRef = options.to || getCurrentBranch();

    if (!fromRef) {
        const tags = getTags();
        if (tags.length > 0) {
            const useLatestTag = await selectOption('Select previous tag (From):', [
                { label: `Latest Tag (${tags[0]})`, value: tags[0] },
                { label: 'Select from list', value: 'list' },
                { label: 'Manual Input', value: 'manual' },
                { label: 'No previous tag (Initial Release)', value: 'initial' }
            ]);

            if (useLatestTag === 'list') {
                fromRef = await selectOption('Select tag:', tags.slice(0, 10).map(t => ({ label: t, value: t })));
            } else if (useLatestTag === 'manual') {
                fromRef = await askQuestion('Enter start reference (tag/sha): ');
            } else if (useLatestTag === 'initial') {
                fromRef = null;
            } else {
                fromRef = useLatestTag;
            }
        } else {
            log('No tags found. Assuming initial release.', 'yellow');
            fromRef = null;
        }
    }

    log(`\nAnalyzing commits from ${fromRef ? fromRef : 'start'} to ${toRef}...`, 'dim');
    let commits = [];
    if (fromRef) {
        commits = getCommits(fromRef, toRef);
    } else {
        const output = execCommand(`git log ${toRef} --pretty=format:"%h|%an|%s"`);
        if (output) {
            commits = output.split('\n').filter(Boolean).map(line => {
                const [hash, author, message] = line.split('|');
                return { hash, author, message };
            });
        }
    }

    if (commits.length === 0) {
        log('No commits found in range.', 'yellow');
        const proceed = await selectOption('Proceed anyway?', [
            { label: 'Yes, use Manual Mode', value: 'manual' },
            { label: 'Abort', value: 'abort' }
        ]);
        if (proceed === 'abort') return 0;
    } else {
        log(`Found ${commits.length} commits.`, 'green');
    }

    let tagName = options.version;
    while (!tagName) {
        tagName = await askQuestion('Enter new tag name (e.g. v1.2.0): ');
        if (!tagName) log('Tag name is required.', 'red');
    }

    let currentNotes = '';
    const repo = getRepoOwnerName();

    const generate = async (instr = '') => {
        log('\nGenerating release notes…', 'cyan');
        try {
            const result = await genLocal.generate({
                tool: 'release',
                ctx: {
                    tag: tagName,
                    repo,
                    commits: commitsToText(commits),
                    mode: commits.length === 0 ? 'manual' : 'summary',
                    instruction: instr,
                    previous: instr ? currentNotes : '',
                },
                provider: options.provider,
                model: options.model,
                maxTokens: 4096,
                interactive: true,
            });
            currentNotes = result.text;
            log(`\n--- Release Notes (via ${result.provider}) ---\n`, 'green');
            console.log(currentNotes);
            log('\n-------------------------------\n', 'green');
            return true;
        } catch (err) {
            if (err instanceof genLocal.AIError) {
                log(`AI provider error (${err.code}): ${err.message}`, 'red');
            } else {
                log(err.message, 'red');
            }
            return false;
        }
    };

    if (!(await generate())) return 2;

    while (true) {
        const action = await selectOption('What would you like to do?', [
            { label: 'Create Release (GitHub)', value: 'create' },
            { label: 'Refine with AI', value: 'refine' },
            { label: 'Edit Manually (Open Editor)', value: 'edit' },
            { label: 'Abort', value: 'abort' }
        ]);

        if (action === 'abort') return 0;

        if (action === 'refine') {
            const instruction = await askQuestion('Enter refinement instruction: ');
            if (instruction) await generate(instruction);
        } else if (action === 'edit') {
            const tempFile = path.join(os.tmpdir(), 'RELEASE_NOTES.md');
            fs.writeFileSync(tempFile, currentNotes);
            log(`Opening ${tempFile} in default editor…`, 'dim');
            try {
                execFileSync(process.env.EDITOR || 'vi', [tempFile], { stdio: 'inherit' });
                currentNotes = fs.readFileSync(tempFile, 'utf8');
                log('Notes updated from editor.', 'green');
            } catch (e) {
                log('Failed to open editor. You can edit the file manually.', 'red');
            }
        } else if (action === 'create') {
            const notesFile = 'RELEASE_NOTES.md';
            fs.writeFileSync(notesFile, currentNotes);
            log(`Saved notes to ${notesFile}`, 'dim');

            await syncManifestVersion(tagName);

            log('\nCreating release via gh CLI…', 'cyan');
            try {
                execFileSync('gh', ['release', 'create', tagName, '--title', tagName, '--notes-file', notesFile], { stdio: 'inherit' });
                log('\nRelease created successfully!', 'green');
                try { fs.unlinkSync(notesFile); } catch {  }
                return 0;
            } catch (e) {
                log('\nFailed to create release with gh CLI.', 'red');
                log('Ensure "gh" is installed and authenticated.', 'dim');
                log(`Your notes are saved in ${notesFile}`, 'yellow');
                return 1;
            }
        }
    }
};
