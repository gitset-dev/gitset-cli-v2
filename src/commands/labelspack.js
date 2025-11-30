const { log, askQuestion, selectOption } = require('../utils/ui');
const { getLabels, addLabel } = require('../utils/labels');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

async function applyLabels(config) {
    log('\n=== Apply Labels ===', 'blue');

    // 1. Try Centralized Labels (New System)
    const { source, labels: globalLabels } = await getLabels();

    let labelsToApply = [];
    let usingLegacy = false;

    if (globalLabels && globalLabels.length > 0) {
        log(`\n✓ Found ${globalLabels.length} labels from ${source} source.`, 'green');
        const useGlobal = await askQuestion('Use these global labels? (y/n): ');
        if (useGlobal.toLowerCase() === 'y') {
            labelsToApply = globalLabels;
        }
    }

    // 2. Fallback to Legacy labels.md if no global labels used
    if (labelsToApply.length === 0) {
        let content = '';
        if (fs.existsSync(LABELS_FILE)) {
            content = fs.readFileSync(LABELS_FILE, 'utf8');
        }

        if (content) {
            const yamlMatch = content.match(/```yaml([\s\S]*?)```/);
            if (yamlMatch) {
                labelsToApply = parseLabelsYaml(yamlMatch[1]);
                usingLegacy = true;
                log(`\nFound ${labelsToApply.length} labels in legacy ~/.gitset/labels.md`, 'yellow');
                const useLegacy = await askQuestion('Use these legacy labels? (y/n): ');
                if (useLegacy.toLowerCase() !== 'y') labelsToApply = [];
            }
        }
    }

    if (labelsToApply.length === 0) {
        log('✗ No labels found to apply.', 'red');
        log('  Use `gitset labels add` to create global labels.', 'yellow');
        return;
    }

    // Verify gh CLI
    if (!execCommand('gh --version')) {
        log('✗ GitHub CLI (gh) is not installed.', 'red');
        return;
    }

    const confirm = await askQuestion(`Apply ${labelsToApply.length} labels to the current repository? (y/n): `);
    if (confirm.toLowerCase() !== 'y') return;

    // Get existing labels
    const existingLabelsJson = execCommand('gh label list --limit 100 --json name');
    const existingLabels = existingLabelsJson ? JSON.parse(existingLabelsJson).map(l => l.name) : [];

    for (const label of labelsToApply) {
        const name = label.name;
        let color = label.color || getRandomColor();
        color = color.replace('#', '');

        const description = label.description || '';

        const safeName = name.replace(/"/g, '\\"');
        const safeDesc = description.replace(/"/g, '\\"');
        const safeColor = color;

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

    log('\n✓ Labels applied successfully!', 'green');

    if (usingLegacy) {
        log('\n💡 Tip: Migrate to the new system by running `gitset labels add` for your favorite labels.', 'pink');
    }
}

async function commandLabelspack(config, args) {
    // Parse flags
    const isList = args.includes('--list');
    const isAdd = args.includes('--add');
    const isApply = args.includes('--apply') || args.includes('--sync');

    if (isList || (!isAdd && !isApply && args.length === 0)) {
        const { source, labels } = await getLabels();
        log(`\n=== Label Pack (${source}) ===`, 'blue');
        if (labels.length === 0) {
            log('No labels found in your pack.', 'yellow');
        } else {
            labels.forEach(l => {
                log(`● ${l.name}`, 'cyan');
                if (l.description) log(`  ${l.description}`, 'reset');
            });
        }
        return;
    }

    if (isAdd) {
        const name = await askQuestion('Label name: ');
        const color = await askQuestion('Color (hex): ');
        const description = await askQuestion('Description: ');

        const success = await addLabel({ name, color, description });
        if (success) log('✓ Label added to pack', 'green');
        else log('✗ Failed to add label', 'red');
        return;
    }

    if (isApply) {
        await applyLabels(config);
        return;
    }

    log('Usage: gitset labelspack [--list | --add | --apply]', 'yellow');
}

module.exports = commandLabelspack;
