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

// parseLabelsYaml removed - logic moved to src/utils/labels.js

async function applyLabels(config) {
    log('\n=== Apply Labels ===', 'blue');

    // 1. Get Labels (Prioritizes labels.md > config > cloud)
    const { source, labels: labelsToApply } = await getLabels();

    if (source === 'cloud') {
        log('ℹ No local labels.md defined, using cloud labels pack.', 'pink');
    }

    if (!labelsToApply || labelsToApply.length === 0) {
        log('✗ No labels found to apply.', 'red');
        log('  Create a ~/.gitset/labels.md file or add labels to your cloud pack.', 'yellow');
        return;
    }

    log(`\n✓ Found ${labelsToApply.length} labels from ${source}.`, 'green');

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

        if (source === 'cloud') {
            log('ℹ No local labels.md defined, using cloud labels pack.', 'pink');
        }

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
