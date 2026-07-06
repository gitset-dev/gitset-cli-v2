const readline = require('readline');
const theme = require('./theme');

const tty = () => process.stdout.isTTY;

// Legacy color names kept so existing call sites don't need to change, now
// routed through the shared teal theme (see theme.js) instead of a fixed
// palette that only worked on dark backgrounds. 'green' and 'cyan' both
// resolve to the same brand hue (matching the web decision: no separate
// "success" color) at two lightness tiers, which also keeps the severity
// ladder in dependabot-resolver.js (red > yellow > cyan > green) visually
// distinct without a fifth hue. Each value is a paint FUNCTION (not a raw
// ANSI prefix string) since the color depends on the live theme setting.
const colors = {
    reset: (s) => s,
    green: theme.accent,
    yellow: theme.warn,
    red: theme.error,
    cyan: theme.accentDim,
    blue: theme.dim,
    pink: theme.warn,
    dim: theme.dim,
};

function log(msg, color = 'reset') {
    const paint = colors[color] || ((s) => s);
    console.log(paint(msg));
}

function askQuestion(query) {
    if (!process.stdin.isTTY) {
        return Promise.reject(new Error(
            'This step needs an interactive terminal. Re-run in a terminal, or pass explicit flags to skip prompts.',
        ));
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve, reject) => {
        let answered = false;
        rl.question(query, (ans) => {
            answered = true;
            rl.close();
            resolve(ans.trim());
        });
        rl.on('close', () => {
            if (!answered) reject(new Error('Input closed before answering.'));
        });
    });
}

// Masks input as it's typed (for API keys) instead of echoing it in plain
// text. Falls back to visible input if the terminal doesn't support raw
// mode (e.g. some CI wrappers) rather than failing outright.
function askSecret(query) {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
        return askQuestion(query);
    }
    return new Promise((resolve, reject) => {
        process.stdout.write(query);
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let value = '';
        function cleanup() {
            stdin.removeListener('data', onData);
            stdin.setRawMode(wasRaw || false);
            stdin.pause();
        }
        function onData(chunk) {
            const ch = String(chunk);
            if (ch === '\r' || ch === '\n') {
                cleanup();
                process.stdout.write('\n');
                resolve(value.trim());
                return;
            }
            if (ch === '\u0003') { // Ctrl+C
                cleanup();
                process.stdout.write('\n');
                reject(new Error('Cancelled.'));
                return;
            }
            if (ch === '\u007f' || ch === '\b') { // backspace (DEL on most terminals, BS on some)
                if (value.length) {
                    value = value.slice(0, -1);
                    process.stdout.write('\b \b');
                }
                return;
            }
            if (ch.charCodeAt(0) < 32) return; // ignore other control/escape bytes
            value += ch;
            process.stdout.write('*');
        }
        stdin.on('data', onData);
    });
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
    askSecret,
    selectOption,
    selectMultipleOptions,
    colors
};
