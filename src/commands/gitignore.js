const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/gitignore';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
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
        resolve(ans);
    }));
}

// Map common files to gitignore template names
const AUTO_DETECT_MAP = {
    'package.json': ['Node'],
    'requirements.txt': ['Python'],
    'setup.py': ['Python'],
    'Pipfile': ['Python'],
    'pyproject.toml': ['Python'],
    'pom.xml': ['Java', 'Maven'],
    'build.gradle': ['Java', 'Gradle'],
    'go.mod': ['Go'],
    'Cargo.toml': ['Rust'],
    'Gemfile': ['Ruby'],
    'composer.json': ['Composer', 'Laravel', 'Symfony'], // PHP generic? Composer is safe.
    'mix.exs': ['Elixir'],
    'Makefile': ['C', 'C++'], // Heuristic
    'CMakeLists.txt': ['CMake', 'C++'],
    '*.csproj': ['VisualStudio'],
    '*.sln': ['VisualStudio'],
    '*.xcodeproj': ['Xcode', 'macOS'],
    '*.xcworkspace': ['Xcode', 'macOS'],
    'pubspec.yaml': ['Dart', 'Flutter'],
    'android/build.gradle': ['Android'],
    'ios/Podfile': ['macOS', 'Swift', 'Objective-C']
};

function detectTemplates() {
    const detected = new Set();
    const files = fs.readdirSync(process.cwd());

    // OS Detection
    if (process.platform === 'darwin') detected.add('macOS');
    if (process.platform === 'win32') detected.add('Windows');
    if (process.platform === 'linux') detected.add('Linux');

    // File-based Detection
    for (const file of files) {
        if (AUTO_DETECT_MAP[file]) {
            AUTO_DETECT_MAP[file].forEach(t => detected.add(t));
        } else {
            // Check wildcards in map
            for (const key of Object.keys(AUTO_DETECT_MAP)) {
                if (key.startsWith('*.')) {
                    const ext = key.substring(1);
                    if (file.endsWith(ext)) {
                        AUTO_DETECT_MAP[key].forEach(t => detected.add(t));
                    }
                }
            }
        }
    }

    return Array.from(detected);
}

async function fetchTemplates(config) {
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'list',
                gitset_key: config.gitset_key
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch templates');
        }

        const data = await response.json();
        return data.templates;
    } catch (error) {
        log(`✗ Error fetching templates: ${error.message}`, 'red');
        return [];
    }
}

async function generateGitignore(config, identifiers) {
    try {
        log('→ Generating .gitignore...', 'cyan');
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generate',
                gitset_key: config.gitset_key,
                identifiers
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Generation failed');
        }

        return await response.json();
    } catch (error) {
        log(`✗ Error generating gitignore: ${error.message}`, 'red');
        return null;
    }
}

function displayTemplatesInColumns(templates) {
    const columns = 3;
    const maxNameLength = Math.max(...templates.map(t => t.name.length)) + 5;
    const rows = Math.ceil(templates.length / columns);

    log('\nAvailable Templates:', 'cyan');

    for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < columns; c++) {
            const index = r + c * rows;
            if (index < templates.length) {
                const t = templates[index];
                const num = (index + 1).toString().padEnd(3);
                const name = t.name.padEnd(maxNameLength);
                line += `${colors.yellow}${num}${colors.reset} ${name}`;
            }
        }
        console.log(line);
    }
    console.log('');
}

async function commandGitignore(config, args) {
    if (!config.gitset_key) {
        log('✗ Gitset Key is required. Run `gitset init` to configure.', 'red');
        return;
    }

    let selectedTemplates = [];

    // Check for flags (e.g., --python)
    const flags = args.filter(a => a.startsWith('--') && a !== '--select').map(a => a.substring(2));

    if (flags.length > 0) {
        // User provided specific flags
        // We need to match these flags to template names. 
        // Since we don't have the full list locally, we might need to fetch it or send names to backend.
        // Backend supports name matching.
        selectedTemplates = flags;
        log(`Selected via flags: ${selectedTemplates.join(', ')}`, 'cyan');
    } else if (args.includes('--select')) {
        // Interactive Selection
        const templates = await fetchTemplates(config);
        if (templates.length === 0) return;

        displayTemplatesInColumns(templates);

        const ans = await askQuestion('Enter numbers to select (comma separated, e.g. 1, 5, 10): ');
        const indices = ans.split(',').map(s => parseInt(s.trim()) - 1).filter(i => !isNaN(i) && i >= 0 && i < templates.length);

        if (indices.length === 0) {
            log('No valid selection provided.', 'yellow');
            return;
        }

        selectedTemplates = indices.map(i => templates[i].id); // Use IDs for precision
        const names = indices.map(i => templates[i].name);
        log(`Selected: ${names.join(', ')}`, 'cyan');

    } else {
        // Auto-detection
        log('🔍 Analyzing repository...', 'yellow');
        const detected = detectTemplates();

        if (detected.length === 0) {
            log('⚠️  No specific frameworks detected.', 'yellow');
            log('   Try `gitset gitignore --select` to choose manually.', 'dim');
            return;
        }

        log(`Detected: ${detected.join(', ')}`, 'green');
        const confirm = await askQuestion('Generate .gitignore with these templates? (Y/n): ');
        if (confirm.toLowerCase() === 'n') {
            log('Cancelled.', 'yellow');
            return;
        }
        selectedTemplates = detected;
    }

    // Generate
    const result = await generateGitignore(config, selectedTemplates);
    if (!result) return;

    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let finalContent = result.content;
    let mode = 'write';

    if (fs.existsSync(gitignorePath)) {
        log('\n⚠️  .gitignore already exists.', 'yellow');
        const choice = await askQuestion('Choose action: [O]verwrite, [A]ppend, [C]ancel: ');
        const c = choice.toLowerCase();

        if (c === 'c') {
            log('Cancelled.', 'yellow');
            return;
        } else if (c === 'a') {
            mode = 'append';
            const existing = fs.readFileSync(gitignorePath, 'utf8');
            finalContent = existing + '\n\n' + result.content;
        }
    }

    fs.writeFileSync(gitignorePath, finalContent, 'utf8');
    log(`\n✓ .gitignore ${mode === 'append' ? 'updated' : 'created'} successfully!`, 'green');
    log(`  Included: ${result.templates_used.join(', ')}`, 'dim');
}

module.exports = commandGitignore;
