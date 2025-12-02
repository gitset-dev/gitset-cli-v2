const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption, colors } = require('../utils/ui');

const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/release';

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

async function callBackend(payload, token) {
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Backend request failed');
        return data;
    } catch (error) {
        throw error;
    }
}

function loadConfigFallback() {
    try {
        const configFile = path.join(os.homedir(), '.gitset', 'config.json');
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }
    } catch (e) {
        return null;
    }
    return null;
}

module.exports = async function commandRelease(options, injectedConfig) {
    // Ensure config is loaded
    let config = injectedConfig;
    if (!config || !config.gitset_key) {
        config = loadConfigFallback();
    }

    console.log('\n=== Gitset Release Manager ===\n');

    if (!config || !config.gitset_key) {
        log('Error: Gitset key not found. Please run "gitset auth" first.', 'red');
        return;
    }

    // 1. Select References
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
                const tagSelection = await selectOption('Select tag:', tags.slice(0, 10).map(t => ({ label: t, value: t })));
                fromRef = tagSelection;
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

    // 2. Fetch Commits
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
        if (proceed === 'abort') return;
    } else {
        log(`Found ${commits.length} commits.`, 'green');
    }

    // 3. Tag Name
    let tagName = options.version;
    while (!tagName) {
        tagName = await askQuestion('Enter new tag name (e.g. v1.2.0): ');
        if (!tagName) log('Tag name is required.', 'red');
    }

    // 4. Generate Notes
    let currentNotes = '';
    let draftId = null;
    let instruction = '';

    const generate = async (instr = '') => {
        log('\nGenerating release notes...', 'cyan');
        try {
            const payload = {
                action: 'generate',
                gitset_key: config.gitset_key,
                commits: commits,
                tagName: tagName,
                instruction: instr,
                repo_info: { name: path.basename(process.cwd()) }
            };
            const data = await callBackend(payload);
            currentNotes = data.release_notes;
            draftId = data.draft_id;
            log('\n--- Generated Release Notes ---\n', 'green');
            console.log(currentNotes);
            log('\n-------------------------------\n', 'green');
        } catch (err) {
            log(`Generation failed: ${err.message}`, 'red');
        }
    };

    await generate();

    // 5. Interactive Loop
    while (true) {
        const action = await selectOption('What would you like to do?', [
            { label: 'Create Release (GitHub)', value: 'create' },
            { label: 'Refine with AI', value: 'refine' },
            { label: 'Edit Manually (Open Editor)', value: 'edit' },
            { label: 'Abort', value: 'abort' }
        ]);

        if (action === 'abort') break;

        if (action === 'refine') {
            instruction = await askQuestion('Enter refinement instruction: ');
            await generate(instruction);
        } else if (action === 'edit') {
            const tempFile = path.join(os.tmpdir(), 'RELEASE_NOTES.md');
            fs.writeFileSync(tempFile, currentNotes);
            log(`Opening ${tempFile} in default editor...`, 'dim');

            try {
                execSync(`${process.env.EDITOR || 'vi'} "${tempFile}"`, { stdio: 'inherit' });
                currentNotes = fs.readFileSync(tempFile, 'utf8');
                log('Notes updated from editor.', 'green');
            } catch (e) {
                log('Failed to open editor. You can edit the file manually.', 'red');
            }
        } else if (action === 'create') {
            const notesFile = 'RELEASE_NOTES.md';
            fs.writeFileSync(notesFile, currentNotes);
            log(`Saved notes to ${notesFile}`, 'dim');

            log('Attempting to create release via gh CLI...', 'cyan');
            const ghCmd = `gh release create ${tagName} --title "${tagName}" --notes-file "${notesFile}"`;

            try {
                execSync(ghCmd, { stdio: 'inherit' });
                log('\nRelease created successfully!', 'green');
                fs.unlinkSync(notesFile);
                break;
            } catch (e) {
                log('\nFailed to create release with gh CLI.', 'red');
                log('Ensure "gh" is installed and authenticated.', 'dim');
                log(`You can manually create the release using the content in ${notesFile}`, 'yellow');
                break;
            }
        }
    }
};
