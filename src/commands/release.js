const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');
const genLocal = require('../../lib/generate-local');

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

function commitsToText(commits) {
    if (!commits || commits.length === 0) return '';
    return commits.map(c => `- ${c.hash || ''} ${c.message || ''} (${c.author || ''})`).join('\n');
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

    const generate = async (instr = '') => {
        log('\nGenerating release notes…', 'cyan');
        try {
            const result = await genLocal.generate({
                tool: 'release',
                ctx: {
                    tag: tagName,
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
            log('Creating release via gh CLI…', 'cyan');
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
