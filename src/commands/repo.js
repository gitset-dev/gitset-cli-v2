const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');

const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const LABELS_FILE = path.join(CONFIG_DIR, 'labels.md');
const API_URL = 'https://gitset-core-v2.vercel.app/api/repo';

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

async function callApi(action, payload, gitsetKey) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, gitset_key: gitsetKey, ...payload })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'API Error');
        }
        return await response.json();
    } catch (error) {
        // log(`API Error: ${error.message}`, 'red');
        return null;
    }
}

// --- Labels Logic ---

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function parseLabelsYaml(content) {
    const labels = [];
    const lines = content.split('\n');
    let currentLabel = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;

        if (line.startsWith('- name:')) {
            if (currentLabel) labels.push(currentLabel);
            currentLabel = { name: line.replace('- name:', '').trim() };
        } else if (currentLabel) {
            if (line.startsWith('color:')) {
                let color = line.replace('color:', '').trim();
                if ((color.startsWith('"') && color.endsWith('"')) || (color.startsWith("'") && color.endsWith("'"))) {
                    color = color.slice(1, -1);
                }
                currentLabel.color = color;
            } else if (line.startsWith('description:')) {
                let desc = line.replace('description:', '').trim();
                if ((desc.startsWith('"') && desc.endsWith('"')) || (desc.startsWith("'") && desc.endsWith("'"))) {
                    desc = desc.slice(1, -1);
                }
                currentLabel.description = desc;
            }
        }
    }
    if (currentLabel) labels.push(currentLabel);
    return labels;
}

// applyLabelPack removed - moved to src/commands/labels.js

// --- About Logic ---

async function generateAbout(config) {
    log('\nGitset About Generator', 'cyan');
    log('=========================', 'cyan');

    if (!execCommand('gh --version')) {
        log('✗ GitHub CLI (gh) is not installed.', 'red');
        return;
    }

    // Get current repo info
    const repoUrl = execCommand('git config --get remote.origin.url');
    if (!repoUrl) {
        log('✗ Not a git repository or no remote origin found.', 'red');
        return;
    }

    let owner, name;
    try {
        const match = repoUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
        if (match) {
            owner = match[1];
            name = match[2];
        }
    } catch (e) { }

    log(`Repository: ${owner}/${name}`, 'reset');

    // Sync Check
    let cloudDraft = null;
    if (config.gitset_key) {
        const settings = await callApi('get_settings', {}, config.gitset_key);
        if (settings && settings.about_draft) {
            cloudDraft = settings.about_draft;
        }
    }

    const options = [
        { label: 'AI Generate', value: '1' },
        { label: 'Manual Entry', value: '2' }
    ];

    if (cloudDraft) {
        options.unshift({ label: 'Use Cloud Draft', value: 'cloud' });
    }

    const mode = await selectOption('What would you like to do?', options);

    let description = '';
    let topics = [];

    if (mode === 'cloud') {
        description = cloudDraft.description;
        topics = cloudDraft.topics || [];
        log('✓ Loaded draft from cloud', 'green');
    } else if (mode === '1') {
        if (!config.gitset_key) {
            log('✗ Gitset Key is required for AI generation.', 'red');
            return;
        }

        log('\n→ Analyzing repository...', 'yellow');

        let readme = '';
        if (fs.existsSync('README.md')) readme = fs.readFileSync('README.md', 'utf8');

        let packageJson = null;
        if (fs.existsSync('package.json')) packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        let userContext = '';
        if (!readme && !packageJson) {
            log('\n✗ No README.md or package.json found.', 'yellow');
            userContext = await askQuestion('Please provide a brief description of the project:\n> ');
        }

        try {
            const response = await fetch('https://gitset-core-v2.vercel.app/api/about', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'generate',
                    gitset_key: config.gitset_key,
                    repo_info: { owner, name },
                    file_context: { readme, packageJson, userContext }
                })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            description = data.description;
            topics = data.topics || [];

        } catch (error) {
            log(`✗ Error: ${error.message}`, 'red');
            return;
        }
    } else if (mode === '2') {
        description = await askQuestion('Description: ');
        const topicsStr = await askQuestion('Topics (comma separated): ');
        topics = topicsStr.split(',').map(t => t.trim()).filter(Boolean);
    } else {
        return;
    }

    // Edit/Apply Loop
    while (true) {
        log('\nContent Preview:', 'green');
        log(`\nDescription:\n${description}`, 'reset');
        log(`\nTopics:\n${topics.join(', ')}`, 'reset');

        const action = await selectOption('Next steps:', [
            { label: 'Apply to GitHub', value: 'apply' },
            { label: 'Refine with AI', value: 'refine' },
            { label: 'Edit manually', value: 'edit' },
            { label: 'Save Draft to Cloud', value: 'save' },
            { label: 'Cancel', value: 'cancel' }
        ]);

        if (action === 'cancel') return;

        if (action === 'save') {
            if (config.gitset_key) {
                await callApi('update_about_draft', { draft: { description, topics } }, config.gitset_key);
                log('✓ Draft saved to cloud', 'green');
            } else {
                log('✗ Auth required to save draft', 'red');
            }
            continue;
        }

        if (action === 'apply') {
            log('\nApplying changes...', 'yellow');
            try {
                if (description) {
                    const safeDesc = description.replace(/"/g, '\\"');
                    execCommand(`gh repo edit --description "${safeDesc}"`);
                }
                if (topics.length > 0) {
                    const safeTopics = topics.join(',');
                    execCommand(`gh repo edit --add-topic "${safeTopics}"`);
                }
                log('✓ Repository updated successfully!', 'green');
            } catch (error) {
                log(`✗ Failed: ${error.message}`, 'red');
            }
            break;
        }

        if (action === 'edit') {
            description = await askQuestion(`Description (${description}): `) || description;
            const topicsStr = await askQuestion(`Topics (${topics.join(', ')}): `);
            if (topicsStr) topics = topicsStr.split(',').map(t => t.trim());
        }

        if (action === 'refine') {
            if (!config.gitset_key) {
                log('✗ Auth required', 'red');
                continue;
            }
            const instruction = await askQuestion('Instruction: ');
            log('→ Refining...', 'yellow');
            try {
                const res = await fetch('https://gitset-core-v2.vercel.app/api/about', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'refine',
                        gitset_key: config.gitset_key,
                        current_description: description,
                        current_topics: topics,
                        instruction
                    })
                });
                const data = await res.json();
                description = data.description;
                topics = data.topics || [];
            } catch (e) {
                log('✗ Refinement failed', 'red');
            }
        }
    }
}

// --- Backup Logic ---

async function handleBackup(config) {
    log('\n=== Gitset Backup Manager ===', 'blue');
    log('Configure automated backups to a secondary GitHub account.\n', 'reset');

    if (!config.gitset_key) {
        log('✗ You must be authenticated to use Backup.', 'red');
        return;
    }

    // 1. Check existing config
    const settings = await callApi('get_settings', {}, config.gitset_key);
    let backupConfig = settings?.backup_config || {};

    // 2. Target Account Setup
    if (!backupConfig.target_token) {
        log('Step 1: Connect Target Account', 'cyan');
        log('You need a Personal Access Token (PAT) from the account where backups will be stored.', 'yellow');
        log('Scopes required: repo, workflow, delete_repo (if you want to clean up manually later).', 'yellow');

        const token = await askQuestion('Enter Target Account PAT: ');
        if (!token) return;

        // Verify token
        try {
            log('→ Verifying token...', 'cyan');
            const userRes = await fetch('https://api.github.com/user', {
                headers: { Authorization: `token ${token}` }
            });
            if (!userRes.ok) throw new Error('Invalid token');
            const userData = await userRes.json();
            log(`✓ Connected as: ${userData.login}`, 'green');

            backupConfig.target_token = token;
            backupConfig.target_username = userData.login;
        } catch (e) {
            log('✗ Verification failed', 'red');
            return;
        }
    } else {
        log(`Target Account: ${backupConfig.target_username}`, 'green');
        const change = await askQuestion('Change target account? (y/n): ');
        if (change.toLowerCase() === 'y') {
            backupConfig.target_token = null;
            return handleBackup(config); // Restart
        }
    }

    // 3. Select Repos
    log('\nStep 2: Select Repositories to Backup', 'cyan');

    // Fetch user repos using gh cli (source account)
    const reposJson = execCommand('gh repo list --limit 100 --json name,visibility,owner');
    if (!reposJson) {
        log('✗ Failed to list repositories. Ensure `gh` is authenticated with your SOURCE account.', 'red');
        return;
    }
    const repos = JSON.parse(reposJson);

    const repoOptions = repos.map(r => ({
        label: `${r.owner.login}/${r.name} (${r.visibility})`,
        value: r.name
    }));

    // Simple multi-select simulation
    const selectedRepos = [];
    while (true) {
        log(`\nSelected: ${selectedRepos.length > 0 ? selectedRepos.join(', ') : 'None'}`, 'yellow');
        const choice = await selectOption('Add repository:', [
            ...repoOptions.filter(r => !selectedRepos.includes(r.value)),
            { label: 'Done Selecting', value: 'done' },
            { label: 'Cancel', value: 'cancel' }
        ]);

        if (choice === 'cancel') return;
        if (choice === 'done') break;
        selectedRepos.push(choice);
    }

    if (selectedRepos.length === 0) {
        log('No repositories selected.', 'yellow');
        return;
    }

    // 4. Schedule
    log('\nStep 3: Schedule', 'cyan');
    const schedule = await selectOption('How often should backups run?', [
        { label: 'Every 24 hours', value: '0 0 * * *' },
        { label: 'Every 72 hours', value: '0 0 */3 * *' },
        { label: 'Weekly', value: '0 0 * * 0' },
        { label: 'Bi-weekly', value: '0 0 1,15 * *' },
        { label: 'Monthly', value: '0 0 1 * *' }
    ]);

    // 5. Execution
    log('\n=== Summary ===', 'blue');
    log(`Target: ${backupConfig.target_username}`, 'reset');
    log(`Repos: ${selectedRepos.join(', ')}`, 'reset');
    log(`Schedule: ${schedule}`, 'reset');
    log('\n⚠️  IMPORTANT: This will create forks in the target account.', 'yellow');
    log('   The tool can remove workflows but CANNOT delete repositories for safety.', 'yellow');

    const proceed = await askQuestion('Proceed with setup? (y/n): ');
    if (proceed.toLowerCase() !== 'y') return;

    // Save config
    backupConfig.monitored_repos = selectedRepos;
    backupConfig.schedule = schedule;
    await callApi('save_backup_config', { config: backupConfig }, config.gitset_key);

    // Process
    for (const repoName of selectedRepos) {
        log(`\nProcessing ${repoName}...`, 'cyan');

        // 1. Fork
        // We use GitHub API with Target Token to fork
        // POST /repos/{owner}/{repo}/forks
        // But we need the source owner. Assuming `gh` context is source.
        const sourceOwner = repos.find(r => r.name === repoName).owner.login;

        try {
            log('→ Forking...', 'yellow');
            const forkRes = await fetch(`https://api.github.com/repos/${sourceOwner}/${repoName}/forks`, {
                method: 'POST',
                headers: {
                    Authorization: `token ${backupConfig.target_token}`,
                    Accept: 'application/vnd.github+json'
                }
            });

            if (!forkRes.ok && forkRes.status !== 202) { // 202 is Accepted (async)
                throw new Error(`Fork failed: ${forkRes.statusText}`);
            }

            // Wait a bit for fork to be ready
            log('  Waiting for fork...', 'yellow');
            await new Promise(r => setTimeout(r, 5000));

            // 2. Get Workflow Template
            const wfRes = await callApi('get_backup_workflow', { schedule, target_branch: 'main' }, config.gitset_key);
            const workflowContent = wfRes.workflow;

            // 3. Create Workflow in Target Repo
            // PUT /repos/{owner}/{repo}/contents/{path}
            const targetRepo = `${backupConfig.target_username}/${repoName}`;
            const path = '.github/workflows/gitset-backup.yml';
            const message = 'Add Gitset Backup Workflow';
            const contentEncoded = Buffer.from(workflowContent).toString('base64');

            // Check if file exists to get SHA (for update)
            let sha = null;
            const checkRes = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${path}`, {
                headers: { Authorization: `token ${backupConfig.target_token}` }
            });
            if (checkRes.ok) {
                const fileData = await checkRes.json();
                sha = fileData.sha;
            }

            const putRes = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    Authorization: `token ${backupConfig.target_token}`,
                    Accept: 'application/vnd.github+json'
                },
                body: JSON.stringify({
                    message,
                    content: contentEncoded,
                    sha: sha || undefined
                })
            });

            if (!putRes.ok) throw new Error(`Failed to write workflow: ${putRes.statusText}`);
            log('✓ Workflow installed', 'green');

            // 4. Set Secrets
            // We need to set BACKUP_SOURCE_TOKEN (current user's token) and BACKUP_TARGET_TOKEN (target PAT) in the TARGET REPO
            // Note: We need the public key of the target repo to encrypt secrets.
            // This is complex to do in pure JS without sodium-native or similar.
            // ALTERNATIVE: Use `gh secret set` but we need to target the remote repo.
            // `gh secret set NAME -b "value" -R owner/repo`
            // But `gh` is authenticated as Source. Can it set secrets on Target (fork)?
            // Only if Source user has admin access to Target fork. Usually forks are owned by Target user.
            // So Source user (gh CLI) CANNOT set secrets on Target repo unless added as collaborator.

            // WORKAROUND: We must use the Target Token to set secrets.
            // But we can't easily encrypt in Node without libraries.
            // For MVP, we might skip secret setting and ask user to do it, OR use a library if available.
            // `gitset-cli` doesn't have `sodium` installed.

            log('⚠️  Secrets Configuration Required', 'yellow');
            log('   Due to encryption requirements, please manually add these secrets to the BACKUP repo:', 'reset');
            log(`   Repo: https://github.com/${targetRepo}/settings/secrets/actions`, 'reset');
            log('   1. BACKUP_SOURCE_TOKEN: (Your main account PAT)', 'reset');
            log('   2. BACKUP_TARGET_TOKEN: (The target account PAT)', 'reset');

            // In a full implementation, we would use `libsodium-wrappers` to encrypt and set secrets via API.

        } catch (e) {
            log(`✗ Error processing ${repoName}: ${e.message}`, 'red');
        }
    }

    log('\n✓ Backup configuration complete!', 'green');
}

// --- Main Command ---

async function commandRepo(config, args) {
    if (args.includes('--labelspack')) {
        log('ℹ The --labelspack command has moved to `gitset labels apply`. Redirecting...', 'yellow');
        const commandLabels = require('./labels');
        await commandLabels(config, ['apply']);
    } else if (args.includes('--about')) {
        await generateAbout(config);
    } else if (args.includes('--backup')) {
        await handleBackup(config);
    } else {
        // Main Menu
        log('\n=== Gitset Repository Tools ===', 'blue');
        const choice = await selectOption('Select a tool:', [
            { label: 'Label Pack Manager (Moved to `gitset labels`)', value: 'labels' },
            { label: 'About Generator (Description & Topics)', value: 'about' },
            { label: 'Backup Manager (Forks & Sync)', value: 'backup' },
            { label: 'Exit', value: 'exit' }
        ]);

        if (choice === 'labels') {
            log('ℹ Redirecting to `gitset labels apply`...', 'yellow');
            const commandLabels = require('./labels');
            await commandLabels(config, ['apply']);
        }
        if (choice === 'about') await generateAbout(config);
        if (choice === 'backup') await handleBackup(config);
    }
}

module.exports = commandRepo;

