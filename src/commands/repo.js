const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const LABELS_FILE = path.join(CONFIG_DIR, 'labels.md');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color] || colors.reset}${msg}${colors.reset}`);
}

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

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
                // Remove quotes if present
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

async function applyLabelPack() {
    if (!fs.existsSync(LABELS_FILE)) {
        log('✗ No label pack found.', 'red');
        log('  Run `gitset init` to generate the template.', 'yellow');
        return;
    }

    const content = fs.readFileSync(LABELS_FILE, 'utf8');

    // Check for customization flag
    if (content.includes('<!-- gitset-labels-customized: false -->')) {
        log('⚠️  Label pack has not been customized.', 'yellow');
        log('  Please edit ~/.gitset/labels.md and set gitset-labels-customized to true.', 'yellow');
        return;
    }

    // Extract YAML block
    const yamlMatch = content.match(/```yaml([\s\S]*?)```/);
    if (!yamlMatch) {
        log('✗ Could not find YAML block in labels.md', 'red');
        return;
    }

    const yamlContent = yamlMatch[1];
    const labels = parseLabelsYaml(yamlContent);

    if (labels.length === 0) {
        log('⚠️  No labels found in the definition.', 'yellow');
        return;
    }

    log(`\nFound ${labels.length} labels to apply.`, 'cyan');

    // Verify gh CLI
    if (!execCommand('gh --version')) {
        log('✗ GitHub CLI (gh) is not installed.', 'red');
        return;
    }

    // Get existing labels to decide whether to create or edit
    const existingLabelsJson = execCommand('gh label list --limit 100 --json name');
    const existingLabels = existingLabelsJson ? JSON.parse(existingLabelsJson).map(l => l.name) : [];

    for (const label of labels) {
        const name = label.name;
        const color = label.color || getRandomColor();
        const description = label.description || '';

        // Sanitize for shell
        const safeName = name.replace(/"/g, '\\"');
        const safeDesc = description.replace(/"/g, '\\"');
        const safeColor = color.replace('#', ''); // gh expects hex without # usually, but let's check. Actually gh accepts with or without # but let's be safe.
        // gh label create "name" --color "color" --description "desc"

        if (existingLabels.includes(name)) {
            log(`• Updating label: ${name}`, 'blue');
            try {
                execCommand(`gh label edit "${safeName}" --color "${safeColor}" --description "${safeDesc}"`);
            } catch (e) {
                log(`  ✗ Failed to update ${name}`, 'red');
            }
        } else {
            log(`+ Creating label: ${name}`, 'green');
            try {
                execCommand(`gh label create "${safeName}" --color "${safeColor}" --description "${safeDesc}"`);
            } catch (e) {
                log(`  ✗ Failed to create ${name}`, 'red');
            }
        }
    }

    log('\n✓ Label pack applied successfully!', 'green');
}

async function commandRepo(config, args) {
    if (args.includes('--labelspack')) {
        await applyLabelPack();
    } else if (args.includes('--about')) {
        await generateAbout(config);
    } else {
        log('Usage: gitset repo [options]', 'yellow');
        log('Options:', 'reset');
        log('  --labelspack   Apply the label pack defined in ~/.gitset/labels.md', 'reset');
        log('  --about        Generate and apply repository description and topics (AI or Manual)', 'reset');
    }
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function generateAbout(config) {
    log('\n🤖 Gitset About Generator', 'cyan');
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

    // Extract owner/name from URL (naive)
    // git@github.com:owner/name.git or https://github.com/owner/name.git
    let owner, name;
    try {
        const match = repoUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
        if (match) {
            owner = match[1];
            name = match[2];
        }
    } catch (e) { }

    log(`Repository: ${owner}/${name}`, 'reset');

    log(`Repository: ${owner}/${name}`, 'reset');

    log('\nChoose mode:', 'cyan');
    log('1. AI Generate', 'reset');
    log('2. Manual Entry', 'reset');
    const mode = await askQuestion('> ');

    let description = '';
    let topics = [];

    if (mode.trim() === '1') {
        if (!config.gitset_key) {
            log('✗ Gitset Key is required for AI generation. Run `gitset init` to configure.', 'red');
            return;
        }

        log('\n🧠 Analyzing repository...', 'yellow');

        // Gather context
        let readme = '';
        if (fs.existsSync('README.md')) readme = fs.readFileSync('README.md', 'utf8');

        let packageJson = null;
        if (fs.existsSync('package.json')) packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        let userContext = '';
        if (!readme && !packageJson) {
            log('\n⚠️  No README.md or package.json found.', 'yellow');
            userContext = await askQuestion('Please provide a brief description of the project to help the AI:\n> ');
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

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'API Error');
            }

            const data = await response.json();
            description = data.description;
            topics = data.topics || [];

            log('\n✨ AI Generated Content:', 'green');
            log(`\nDescription:\n${description}`, 'reset');
            log(`\nTopics:\n${topics.join(', ')}`, 'reset');

            log('\nWhat would you like to do?', 'cyan');
            log('1. Apply changes', 'reset');
            log('2. Edit manually', 'reset');
            log('3. Cancel', 'reset');
            const action = await askQuestion('> ');

            if (action.trim() === '3') return;
            if (action.trim() === '2') {
                description = await askQuestion(`Description (${description}): `) || description;
                const topicsStr = await askQuestion(`Topics (${topics.join(', ')}): `);
                if (topicsStr) topics = topicsStr.split(',').map(t => t.trim());
            }

        } catch (error) {
            log(`✗ Error generating content: ${error.message}`, 'red');
            return;
        }

    } else if (mode.trim() === '2') {
        description = await askQuestion('Description: ');
        const topicsStr = await askQuestion('Topics (comma separated): ');
        topics = topicsStr.split(',').map(t => t.trim()).filter(Boolean);
    } else {
        log('Invalid option.', 'red');
        return;
    }

    if (!description && topics.length === 0) {
        log('No content to apply.', 'yellow');
        return;
    }

    log('\nApplying changes to GitHub...', 'yellow');

    try {
        if (description) {
            // Escape quotes for shell
            const safeDesc = description.replace(/"/g, '\\"');
            execCommand(`gh repo edit --description "${safeDesc}"`);
            log('✓ Description updated', 'green');
        }

        if (topics.length > 0) {
            const safeTopics = topics.join(',');
            execCommand(`gh repo edit --add-topic "${safeTopics}"`);
            log('✓ Topics updated', 'green');
        }

        log('\n🎉 Repository updated successfully!', 'green');

    } catch (error) {
        log(`✗ Failed to update repository: ${error.message}`, 'red');
    }
}

module.exports = commandRepo;
