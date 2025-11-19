const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

    // Parse owner/repo from URL (supports https and ssh)
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!match) return null;

    return {
        owner: match[1],
        repo: match[2]
    };
}

function getCommitsSince(tag) {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    // Format: hash|author|message
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
        resolve(ans);
    }));
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
    const commits = getCommitsSince(lastTag);
    log(`Found ${commits.length} commits since ${lastTag || 'start'}.`, 'green');

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

        const action = await askQuestion('\n[P]ublish  [R]efine  [E]dit Manually  [C]ancel: ');

        if (action.toLowerCase() === 'c') {
            log('Cancelled.', 'yellow');
            return;
        }

        if (action.toLowerCase() === 'r') {
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
        } else if (action.toLowerCase() === 'e') {
            // Simple manual edit simulation (in real CLI would open editor)
            log('Manual editing not fully implemented in this demo environment.', 'yellow');
            await new Promise(r => setTimeout(r, 1000));
        } else if (action.toLowerCase() === 'p') {
            break;
        }
    }

    // 5. Publish (Tag + Release)
    log('\n📦 Publishing...', 'cyan');

    // Create Tag
    try {
        execCommand(`git tag -a ${tagName} -m "${tagMsg || tagName}"`);
        log(`✓ Created local tag ${tagName}`, 'green');

        execCommand(`git push origin ${tagName}`);
        log(`✓ Pushed tag to origin`, 'green');
    } catch (e) {
        log(`✗ Error creating/pushing tag: ${e.message}`, 'red');
        return;
    }

    // Create Release on GitHub
    // Note: This requires GitHub Token. We'll use the one from config if available.
    if (!config.github_token) {
        log('⚠️  GitHub token not found in config. Cannot create GitHub Release automatically.', 'yellow');
        log('   You can manually create the release on GitHub with the generated notes.', 'yellow');
        return;
    }

    try {
        const response = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${config.github_token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                tag_name: tagName,
                name: tagName,
                body: currentNotes,
                draft: false,
                prerelease: false
            })
        });

        if (response.ok) {
            const data = await response.json();
            log(`\n✨ Release published successfully!`, 'green');
            log(`🔗 ${data.html_url}`, 'blue');
        } else {
            const err = await response.json();
            log(`✗ GitHub API Error: ${err.message}`, 'red');
        }
    } catch (e) {
        log(`✗ Error publishing release: ${e.message}`, 'red');
    }
}

module.exports = commandRelease;
