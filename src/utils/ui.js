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

module.exports = {
    log,
    askQuestion,
    selectOption,
    colors
};
