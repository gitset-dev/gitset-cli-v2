const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

async function commandRelease(config, args) {
    if (!config.gitset_key) {
        log('✗ Gitset Key is required. Run `gitset init` to configure.', 'red');
        return;
    }

    // 1. Check if git repo
    if (!execCommand('git rev-parse --is-inside-work-tree')) {
        log('✗ Not a git repository.', 'red');
        return;
    }

    // 2. Get current version (from package.json or tag)
    let currentVersion = '0.0.0';
    let packageJsonPath = path.join(process.cwd(), 'package.json');
    let hasPackageJson = fs.existsSync(packageJsonPath);

    if (hasPackageJson) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            currentVersion = pkg.version;
        } catch (e) { }
    } else {
        // Try git tags
        const lastTag = execCommand('git describe --tags --abbrev=0');
        if (lastTag) currentVersion = lastTag.replace(/^v/, '');
    }

    log(`Current Version: ${currentVersion}`, 'cyan');

    // 3. Determine new version
    const type = await selectOption('Select release type:', [
        { label: 'Patch (x.x.1)', value: 'patch' },
        { label: 'Minor (x.1.0)', value: 'minor' },
        { label: 'Major (1.x.x)', value: 'major' },
        { label: 'Custom', value: 'custom' }
    ]);

    let newVersion = '';
    const parts = currentVersion.split('.').map(Number);

    if (type === 'patch') newVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    if (type === 'minor') newVersion = `${parts[0]}.${parts[1] + 1}.0`;
    if (type === 'major') newVersion = `${parts[0] + 1}.0.0`;
    if (type === 'custom') {
        newVersion = await askQuestion('Enter version: ');
    }

    if (!newVersion) return;

    log(`\n→ Preparing release v${newVersion}...`, 'yellow');

    // 4. Generate Release Notes
    log('→ Generating release notes from commits...', 'cyan');

    // Get commits since last tag
    const lastTag = execCommand('git describe --tags --abbrev=0');
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
    const commits = execCommand(`git log ${range} --pretty=format:"%s"`);

    let releaseNotes = '';

    try {
        const response = await fetch('https://gitset-core-v2.vercel.app/api/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generate',
                gitset_key: config.gitset_key,
                version: newVersion,
                commits: commits
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'API Error');
        }

        const data = await response.json();
        releaseNotes = data.notes;

    } catch (error) {
        log(`✗ Failed to generate notes: ${error.message}`, 'red');
        releaseNotes = `## Release v${newVersion}\n\n${commits}`;
    }

    // 5. Review Loop
    while (true) {
        log('\nRelease Notes Preview:', 'green');
        console.log('----------------------------------------');
        console.log(releaseNotes);
        console.log('----------------------------------------');

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

        if (action === 'publish') {
            break;
        }

        if (action === 'edit') {
            log('Enter new notes (end with empty line):', 'cyan');
            releaseNotes = await askQuestion('Paste new notes here (single line for now): ');
        }

        if (action === 'refine') {
            const instruction = await askQuestion('Refinement instruction: ');
            log('→ Refining...', 'yellow');
            try {
                const res = await fetch('https://gitset-core-v2.vercel.app/api/release', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'refine',
                        gitset_key: config.gitset_key,
                        current_notes: releaseNotes,
                        instruction
                    })
                });
                const data = await res.json();
                releaseNotes = data.notes;
            } catch (e) {
                log(`✗ Error: ${e.message}`, 'red');
            }
        }
    }

    // 6. Execute Release
    log('\n→ Executing Release...', 'yellow');

    // Update package.json
    if (hasPackageJson) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        pkg.version = newVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
        log('✓ Updated package.json', 'green');
        execCommand('git add package.json');
        execCommand(`git commit -m "chore: release v${newVersion}"`);
    }

    // Create Tag
    execCommand(`git tag v${newVersion}`);
    log('✓ Created git tag', 'green');

    // Push
    log('→ Pushing changes...', 'cyan');
    execCommand('git push && git push --tags');

    // Create GitHub Release
    if (execCommand('gh --version')) {
        log('→ Creating GitHub Release...', 'cyan');
        // Write notes to temp file
        const notesFile = path.join(os.tmpdir(), 'release_notes.md');
        fs.writeFileSync(notesFile, releaseNotes);

        try {
            execCommand(`gh release create v${newVersion} --title "v${newVersion}" --notes-file "${notesFile}"`);
            log('✓ GitHub Release published!', 'green');
            log(`→ https://github.com/${config.repo_owner}/${config.repo_name}/releases/tag/v${newVersion}`, 'blue');
        } catch (e) {
            log(`✗ Failed to create GitHub release: ${e.message}`, 'red');
        }
    } else {
        log('✗ GitHub CLI not found. Skipping release creation.', 'yellow');
    }
}

module.exports = commandRelease;
