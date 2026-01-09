const readline = require('readline');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[38;2;79;201;176m', // #4FC9B0
    yellow: '\x1b[38;2;220;220;170m', // #DCDCAA
    red: '\x1b[31m',
    cyan: '\x1b[38;2;156;220;255m', // #9CDCFF
    blue: '\x1b[36m',
    pink: '\x1b[38;2;206;146;120m', // #CE9278
    dim: '\x1b[2m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color] || colors.reset}${msg}${colors.reset}`);
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

async function selectOption(title, options) {
    log(`\n${title}`, 'reset');
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

async function selectMultipleOptions(title, options) {
    log(`\n${title}`, 'reset');
    options.forEach((opt, i) => {
        log(`${i + 1}. ${opt.label}`, 'cyan');
    });
    log('0. Done / Confirm Selection', 'green');
    log('C. Cancel', 'red');

    const selectedValues = new Set();

    while (true) {
        const currentSelection = options
            .filter(opt => selectedValues.has(opt.value))
            .map(opt => opt.label)
            .join(', ');

        if (currentSelection) {
            log(`\nCurrent selection: ${currentSelection}`, 'yellow');
        }

        const answer = await askQuestion('\nSelect options (enter number to toggle, 0 to confirm, C to cancel): ');
        const index = parseInt(answer) - 1;

        if (answer === '0') {
            return Array.from(selectedValues);
        }

        if (answer.toLowerCase() === 'c') {
            return null;
        }

        if (index >= 0 && index < options.length) {
            const value = options[index].value;
            if (selectedValues.has(value)) {
                selectedValues.delete(value);
                log(`Removed: ${options[index].label}`, 'red');
            } else {
                selectedValues.add(value);
                log(`Added: ${options[index].label}`, 'green');
            }
        } else {
            log('Invalid selection', 'red');
        }
    }
}

module.exports = {
    log,
    askQuestion,
    selectOption,
    selectMultipleOptions,
    colors
};
