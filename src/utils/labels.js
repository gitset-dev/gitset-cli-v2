const { execSync } = require('child_process');
const { log, askQuestion, selectOption } = require('./ui');

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

function getExistingLabels() {
    try {
        const json = execCommand('gh label list --limit 100 --json name');
        return json ? JSON.parse(json).map(l => l.name) : [];
    } catch (e) {
        return [];
    }
}

async function manageLabelsInteractive(currentLabels) {
    while (true) {
        console.clear();
        log('=== Label Management ===', 'blue');
        log(`Selected Labels: ${currentLabels.map(l => l.name || l).join(', ') || 'None'}`, 'pink');

        const action = await selectOption('Choose action:', [
            { label: 'Add/Select Existing Label', value: 'add' },
            { label: 'Create New Label', value: 'create' },
            { label: 'Remove Label from Selection', value: 'remove' },
            { label: 'Edit Existing Label', value: 'edit' },
            { label: 'Delete Label from Repo', value: 'delete' },
            { label: 'Done', value: 'done' }
        ]);

        if (action === 'done') return currentLabels;

        if (action === 'add') {
            const existing = getExistingLabels();
            if (existing.length === 0) {
                log('No existing labels found.', 'yellow');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                log('\nAvailable Labels:', 'cyan');
                existing.forEach((l, i) => log(`${i + 1}. ${l}`, 'reset'));
                const sel = await askQuestion('Select labels (numbers, comma sep): ');
                const indices = sel.split(',').map(s => parseInt(s.trim()) - 1);
                const selected = indices.map(i => existing[i]).filter(l => l);

                selected.forEach(l => {
                    if (!currentLabels.some(cl => (cl.name || cl) === l)) {
                        currentLabels.push({ name: l });
                    }
                });
            }
        }

        if (action === 'create') {
            const name = await askQuestion('Label name: ');
            if (name) {
                const color = await askQuestion('Color (hex, e.g. FF0000): ');
                const desc = await askQuestion('Description: ');
                try {
                    execCommand(`gh label create "${name}" --color "${color}" --description "${desc}"`);
                    log(`✓ Created label ${name}`, 'green');
                    currentLabels.push({ name, color, description: desc });
                } catch (e) {
                    log(`✗ Failed to create label: ${e.message}`, 'red');
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (action === 'remove') {
            if (currentLabels.length === 0) {
                log('No labels selected.', 'yellow');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                log('\nSelected Labels:', 'cyan');
                currentLabels.forEach((l, i) => log(`${i + 1}. ${l.name || l}`, 'reset'));
                const sel = await askQuestion('Select label to remove (number): ');
                const idx = parseInt(sel) - 1;
                if (idx >= 0 && idx < currentLabels.length) {
                    currentLabels.splice(idx, 1);
                }
            }
        }

        if (action === 'edit') {
            const existing = getExistingLabels();
            if (existing.length === 0) {
                log('No labels to edit.', 'yellow');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                log('\nSelect Label to Edit:', 'cyan');
                existing.forEach((l, i) => log(`${i + 1}. ${l}`, 'reset'));
                const sel = await askQuestion('Number: ');
                const idx = parseInt(sel) - 1;
                if (idx >= 0 && idx < existing.length) {
                    const oldName = existing[idx];
                    const newName = await askQuestion(`New name [${oldName}]: `);
                    const newColor = await askQuestion('New color: ');
                    const newDesc = await askQuestion('New description: ');

                    const args = [];
                    if (newName) args.push(`--name "${newName}"`);
                    if (newColor) args.push(`--color "${newColor}"`);
                    if (newDesc) args.push(`--description "${newDesc}"`);

                    if (args.length > 0) {
                        try {
                            execCommand(`gh label edit "${oldName}" ${args.join(' ')}`);
                            log('✓ Label updated', 'green');
                        } catch (e) {
                            log(`✗ Failed to update label: ${e.message}`, 'red');
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        }

        if (action === 'delete') {
            const existing = getExistingLabels();
            if (existing.length === 0) {
                log('No labels to delete.', 'yellow');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                log('\nSelect Label to DELETE (Irreversible):', 'red');
                existing.forEach((l, i) => log(`${i + 1}. ${l}`, 'reset'));
                const sel = await askQuestion('Number: ');
                const idx = parseInt(sel) - 1;
                if (idx >= 0 && idx < existing.length) {
                    const name = existing[idx];
                    const confirm = await askQuestion(`Are you sure you want to delete "${name}"? (y/n): `);
                    if (confirm.toLowerCase() === 'y') {
                        try {
                            execCommand(`gh label delete "${name}" --yes`);
                            log('✓ Label deleted', 'green');
                            // Remove from current if present
                            const currentIdx = currentLabels.findIndex(l => (l.name || l) === name);
                            if (currentIdx !== -1) currentLabels.splice(currentIdx, 1);
                        } catch (e) {
                            log(`✗ Failed to delete label: ${e.message}`, 'red');
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }
        }
    }
}

module.exports = { manageLabelsInteractive };
