const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/release';

function log(msg, color = 'reset') {
    const colors = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        red: '\x1b[31m',
        cyan: '\x1b[36m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m'
    };
    console.log(`${colors[color] || colors.reset}${msg}${colors.reset}`);
}

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

function getGitConfig() {
    const remoteUrl = execCommand('git config --get remote.origin.url');
    if (!remoteUrl) return null;

    const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!match) return null;

    return {
        owner: match[1],
        repo: match[2]
    };
}

function getCommitsSince(tag) {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const output = execCommand(`git log ${range} --pretty=format:"%h|%an|%s"`);
    if (!output) return [];

    return output.split('\n').map(line => {
        const [hash, author, message] = line.split('|');
        return { hash, author, message };
    });
}

function getLastTag() {
    return execCommand('git describe --tags --abbrev=0') || null;
}

async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

async function selectOption(title, options) {
    log(`\n${title}`, 'blue');
    options.forEach((opt, i) => {
        log(`${i + 1}. ${opt.label}`, 'cyan');
    });

    while (true) {
        const answer = await askQuestion('\nSelect an option (number): ');
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < options.length) {
            return options[index].value;
        }
        log('Invalid selection', 'red');
    }
}

async function generateReleaseNotes(commits, options, config) {
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                gitset_key: config.gitset_key,
                action: options.action || 'generate',
                commits,
                draft_id: options.draftId,
                instruction: options.instruction,
                repo_info: options.repoInfo,
                tag_name: options.tagName,
                template: options.template
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Server error');
        return data;
    } catch (error) {
        log(`✗ Error generating notes: ${error.message}`, 'red');
        return null;
    }
}

async function commandRelease(config) {
    if (!config || !config.gitset_key) {
        log('✗ Not authenticated. Run gitset auth first.', 'red');
        return;
    }

    const repoInfo = getGitConfig();
    if (!repoInfo) {
        log('✗ Could not detect GitHub repository info.', 'red');
        return;
    }

    // Check if gh is installed
    const ghVersion = execCommand('gh --version');
    if (!ghVersion) {
        log('✗ GitHub CLI (gh) is not installed or not in PATH.', 'red');
        log('  Please install it to use the release manager: https://cli.github.com/', 'yellow');
        return;
    }

    // Check if gh is authenticated
    const user = execCommand('gh api user');
    if (!user) {
        log('✗ GitHub CLI not authenticated.', 'red');
        log('  Run: gh auth login', 'yellow');
        return;
    }

    log(`\n🚀 Release Manager for ${repoInfo.owner}/${repoInfo.repo}\n`, 'blue');

    const lastTag = getLastTag();
    log(`Latest tag: ${lastTag || 'None'}`, 'cyan');

    // 1. Tag Configuration
    const tagName = await askQuestion(`Tag name (e.g. v1.0.0) ${lastTag ? `[current: ${lastTag}]` : ''}: `);
    if (!tagName) {
        log('✗ Tag name required', 'red');
        return;
    }

    const tagMsg = await askQuestion('Tag description (optional): ');

    // 2. Commit Analysis
    log('\n📊 Analyzing commits...', 'cyan');
    let commits = getCommitsSince(lastTag);
    log(`Found ${commits.length} commits since ${lastTag || 'start'}.`, 'green');

    // Smart Analysis: Fetch diffs if few commits
    if (commits.length <= 2) {
        process.stdout.write('  ↳ Fetching detailed diffs for smart analysis... ');
        commits = commits.map(c => {
            const fileCountStr = execCommand(`git show --pretty="" --name-only ${c.hash} | wc -l`);
            const fileCount = parseInt(fileCountStr || '0');

            if (fileCount <= 5) {
                const diff = execCommand(`git show ${c.hash}`);
                return { ...c, diff };
            }
            return c;
        });
        console.log('Done.');
    }

    // 3. Generate Notes
    log('\n🤖 Generating release notes...', 'magenta');
    let notesData = await generateReleaseNotes(commits, {
        tagName,
        repoInfo,
        template: 'detailed'
    }, config);

    if (!notesData) return;

    let currentNotes = notesData.release_notes;
    let draftId = notesData.draft_id;
    let version = notesData.version_number;

    // 4. Interactive Refinement
    while (true) {
        console.clear();
        log(`=== Release Notes (v${version}) ===`, 'blue');
        console.log(currentNotes);
        log('='.repeat(50));

        const action = await selectOption('What would you like to do?', [
            { label: 'Publish Release', value: 'publish' },
            { label: 'Refine with AI', value: 'refine' },
            { label: 'Edit Manually', value: 'edit' },
            { label: 'Cancel', value: 'cancel' }
        ]);

        if (action === 'cancel') {
            log('Cancelled.', 'yellow');
            return;
        }

        if (action === 'refine') {
            const instruction = await askQuestion('Refinement instruction: ');
            log('Refining...', 'magenta');
            const refined = await generateReleaseNotes(commits, {
                action: 'refine',
                draftId,
                instruction,
                tagName,
                repoInfo
            }, config);

            if (refined) {
                currentNotes = refined.release_notes;
                version = refined.version_number;
            }
        } else if (action === 'edit') {
            const tmpFile = path.join(os.tmpdir(), `gitset-release-${Date.now()}.md`);
            fs.writeFileSync(tmpFile, currentNotes);
            const editor = process.env.EDITOR || 'vi';
            try {
                const { spawnSync } = require('child_process');
                spawnSync(editor, [tmpFile], { stdio: 'inherit' });
                currentNotes = fs.readFileSync(tmpFile, 'utf8');
                log('✓ Notes updated', 'green');
            } catch (e) {
                log('✗ Failed to open editor', 'red');
            }
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } else if (action === 'publish') {
            break;
        }
    }

    // 5. Publish (Tag + Release)
    log('\n📦 Publishing...', 'cyan');

    // Create Tag
    try {
        const tagExists = execCommand(`git tag -l ${tagName}`);
        if (!tagExists) {
            execCommand(`git tag -a ${tagName} -m "${tagMsg || tagName}"`);
            log(`✓ Created local tag ${tagName}`, 'green');
        } else {
            log(`ℹ Tag ${tagName} already exists locally`, 'yellow');
        }

        try {
            execCommand(`git push origin ${tagName}`);
            log(`✓ Pushed tag to origin`, 'green');
        } catch (e) {
            log(`⚠️  Failed to push tag (might already exist on remote): ${e.message}`, 'yellow');
        }
    } catch (e) {
        log(`✗ Error creating tag: ${e.message}`, 'red');
        return;
    }

    // Create Release on GitHub using gh CLI
    try {
        const tmpFile = path.join(os.tmpdir(), `gitset-release-notes-${Date.now()}.md`);
        fs.writeFileSync(tmpFile, currentNotes);

        log('→ Creating GitHub Release...', 'cyan');

        const cmd = `gh release create "${tagName}" -F "${tmpFile}" -t "${tagName}"`;
        const url = execCommand(cmd);

        if (url) {
            log(`\n✨ Release published successfully!`, 'green');
            log(`🔗 ${url}`, 'blue');
        } else {
            log(`✗ Failed to create release via gh CLI`, 'red');
        }

        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);

    } catch (e) {
        log(`✗ Error publishing release: ${e.message}`, 'red');
    }
}

module.exports = commandRelease;
