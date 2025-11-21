const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log, askQuestion, selectOption } = require('../utils/ui');

const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const LABELS_FILE = path.join(CONFIG_DIR, 'labels.md');

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
        log('✗ Label pack has not been customized.', 'yellow');
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
        log('✗ No labels found in the definition.', 'yellow');
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
            log(`→ Updating label: ${name}`, 'blue');
            try {
                execCommand(`gh label edit "${safeName}" --color "${safeColor}" --description "${safeDesc}"`);
            } catch (e) {
                log(`  ✗ Failed to update ${name}`, 'red');
            }
        } else {
            log(`✓ Creating label: ${name}`, 'green');
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

    const mode = await selectOption('What would you like to do?', [
        { label: 'AI Generate', value: '1' },
        { label: 'Manual Entry', value: '2' }
    ]);

    let description = '';
    let topics = [];

    if (mode === '1') {
        if (!config.gitset_key) {
            log('✗ Gitset Key is required for AI generation. Run `gitset init` to configure.', 'red');
            return;
        }

        log('\n→ Analyzing repository...', 'yellow');

        // Gather context
        let readme = '';
        if (fs.existsSync('README.md')) readme = fs.readFileSync('README.md', 'utf8');

        let packageJson = null;
        if (fs.existsSync('package.json')) packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

        let userContext = '';
        if (!readme && !packageJson) {
            log('\n✗ No README.md or package.json found.', 'yellow');
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

            while (true) {
                log('\nAI Generated Content:', 'green');
                log(`\nDescription:\n${description}`, 'reset');
                log(`\nTopics:\n${topics.join(', ')}`, 'reset');

                const action = await selectOption('What would you like to do?', [
                    { label: 'Apply changes', value: 'apply' },
                    { label: 'Refine with AI', value: 'refine' },
                    { label: 'Edit manually', value: 'edit' },
                    { label: 'Cancel', value: 'cancel' }
                ]);

                if (action === 'cancel') return;

                if (action === 'apply') {
                    break; // Proceed to apply
                }

                if (action === 'edit') {
                    description = await askQuestion(`Description (${description}): `) || description;
                    const topicsStr = await askQuestion(`Topics (${topics.join(', ')}): `);
                    if (topicsStr) topics = topicsStr.split(',').map(t => t.trim());
                    break; // Proceed to apply
                }

                if (action === 'refine') {
                    const instruction = await askQuestion('\nRefinement instruction (e.g. "Make it shorter", "Add react tag"): ');
                    log('\n→ Refining...', 'yellow');

                    try {
                        const refineRes = await fetch('https://gitset-core-v2.vercel.app/api/about', {
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

                        if (!refineRes.ok) {
                            const err = await refineRes.json();
                            log(`✗ Refinement failed: ${err.error}`, 'red');
                            continue;
                        }

                        const refinedData = await refineRes.json();
                        description = refinedData.description;
                        topics = refinedData.topics || [];

                    } catch (e) {
                        log(`✗ Error refining: ${e.message}`, 'red');
                    }
                }
            }

        } catch (error) {
            log(`✗ Error generating content: ${error.message}`, 'red');
            return;
        }

    } else if (mode === '2') {
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

        log('\n✓ Repository updated successfully!', 'green');

    } catch (error) {
        log(`✗ Failed to update repository: ${error.message}`, 'red');
    }
}

module.exports = commandRepo;
