#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { log, askQuestion, selectOption, colors } = require('./src/utils/ui');

const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/commit';
const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const TEMPLATE_FILE = path.join(CONFIG_DIR, 'COMMIT-MSG-TEMPLATE.md');

function execCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return null;
  }
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function isGitRepo() {
  return execCommand('git rev-parse --is-inside-work-tree') === 'true';
}

async function authenticate() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter your Gitset Key: ', async (key) => {
      rl.close();

      if (!key.trim()) {
        log('✗ Invalid key', 'red');
        resolve(null);
        return;
      }

      log('\n→ Validating with server...', 'cyan');

      try {
        const response = await fetch(`${BACKEND_URL}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gitset_key: key.trim() })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
          saveConfig({
            gitset_key: key.trim(),
            user_email: data.user.user_email,
            user_plan: data.user.user_plan,
            github_token: data.user.github_oauth_token || null,
            authenticated_at: new Date().toISOString()
          });

          log('\n✓ Authentication successful\n', 'green');
          log(`📧 Email: ${data.user.user_email}`, 'cyan');
          log(`📦 Plan: ${data.user.user_plan}`, 'cyan');
          if (data.user.github_oauth_token) {
            log(`🔑 GitHub token: ${data.user.github_oauth_token.substring(0, 8)}...`, 'cyan');
          }
          log('');

          resolve(key.trim());
        } else {
          log('\n✗ Invalid or not found Gitset Key', 'red');
          log('  Verify the key exists in database', 'yellow');
          resolve(null);
        }
      } catch (error) {
        log('\n✗ Server connection error', 'red');
        log(`  ${error.message}`, 'yellow');
        log('\n⚠️  Saving key locally (without validation)', 'yellow');

        saveConfig({ gitset_key: key.trim() });
        resolve(key.trim());
      }
    });
  });
}

function getGitsetKey() {
  const config = loadConfig();
  return config?.gitset_key || null;
}

function getGitDiff(mode = 'unstaged') {
  let diffOutput = '';

  if (mode === 'staged') {
    diffOutput = execCommand('git diff --cached') || '';
  } else if (mode === 'all') {
    const staged = execCommand('git diff --cached') || '';
    const unstaged = execCommand('git diff') || '';
    diffOutput = [staged, unstaged].filter(Boolean).join('\n');
  } else {
    diffOutput = execCommand('git diff') || '';
  }

  // If mode is NOT staged, we should also look for untracked files
  if (mode !== 'staged') {
    const untrackedFiles = execCommand('git ls-files --others --exclude-standard');
    if (untrackedFiles) {
      const files = untrackedFiles.split('\n').filter(Boolean);
      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          // Simulate a git diff for a new file
          diffOutput += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${content.split('\n').length} @@\n${content.split('\n').map(line => '+' + line).join('\n')}\n`;
        } catch (err) {
          // Ignore read errors (e.g. directories or binary files)
        }
      }
    }
  }

  return diffOutput;
}

function getChangedFiles(mode = 'unstaged') {
  let output = '';

  if (mode === 'staged') {
    output = execCommand('git diff --cached --name-status');
  } else if (mode === 'all') {
    const staged = execCommand('git diff --cached --name-status') || '';
    const unstaged = execCommand('git diff --name-status') || '';
    output = [staged, unstaged].filter(Boolean).join('\n');
  } else {
    output = execCommand('git diff --name-status');
  }

  // Include untracked files if not in staged mode
  if (mode !== 'staged') {
    const untracked = execCommand('git ls-files --others --exclude-standard');
    if (untracked) {
      // Format untracked files as "A\tfilename" (Added)
      const formattedUntracked = untracked.split('\n').filter(Boolean).map(f => `A\t${f}`).join('\n');
      output = output ? `${output}\n${formattedUntracked}` : formattedUntracked;
    }
  }

  if (!output) return [];

  const fileMap = new Map();

  output.split('\n').filter(Boolean).forEach(line => {
    const [status, ...pathParts] = line.split(/\t/);
    const filepath = pathParts.join('\t'); // Rejoin in case filename has tabs (rare but possible)
    if (filepath) {
      fileMap.set(filepath, status); // Use map to avoid duplicates if file is both staged and unstaged
    }
  });

  return Array.from(fileMap.entries()).map(([file, status]) => ({ file, status }));
}

function getFileContent(filepath, revision = 'HEAD') {
  try {
    return execCommand(`git show ${revision}:"${filepath}"`);
  } catch {
    return '';
  }
}

function getCurrentFileContent(filepath) {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch {
    return '';
  }
}

function getRecentCommits(count = 10) {
  const output = execCommand(`git log -${count} --pretty=format:"%s"`);
  return output ? output.split('\n') : [];
}

function loadTemplate() {
  if (!fs.existsSync(TEMPLATE_FILE)) {
    return null;
  }
  try {
    return fs.readFileSync(TEMPLATE_FILE, 'utf8');
  } catch {
    return null;
  }
}

function prepareChangesData(mode = 'unstaged') {
  const files = getChangedFiles(mode);

  if (files.length === 0) {
    return null;
  }

  const changes = files.map(({ status, file }) => {
    let before = '';
    let after = '';

    if (status === 'A') {
      after = getCurrentFileContent(file);
    } else if (status === 'D') {
      before = getFileContent(file, 'HEAD');
    } else if (status === 'M') {
      before = getFileContent(file, 'HEAD');
      after = getCurrentFileContent(file);
    }

    return {
      file,
      status,
      before,
      after
    };
  });

  const diff = getGitDiff(mode);

  return {
    changes,
    diff,
    files_count: files.length
  };
}

async function generateCommitMessage(changesData, options = {}) {
  const gitsetKey = getGitsetKey();

  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return null;
  }

  const payload = {
    gitset_key: gitsetKey,
    changes: changesData.changes,
    diff: changesData.diff,
    custom_mode: options.customMode || false,
    draft_id: options.draftId || null,
    instruction: options.instruction || null
  };

  if (options.customMode) {
    const template = loadTemplate();
    if (template) {
      payload.custom_template = template;
      log('✓ Custom template loaded', 'pink');
    } else {
      log('✗ No template found. Use: gitset template --sync', 'yellow');
    }
  }

  if (options.historicalCount > 0) {
    const commits = getRecentCommits(options.historicalCount);
    payload.commit_history = commits;
    payload.historical_count = options.historicalCount;

    log(`\n→ Historical Analysis Debug:`, 'pink');
    log(`   Requested: ${options.historicalCount} commits`, 'cyan');
    log(`   Retrieved: ${commits.length} commits`, 'cyan');
    log(`   Commits:`, 'cyan');
    commits.forEach((msg, i) => log(`      ${i + 1}. ${msg}`, 'yellow'));
    log('');
  }

  try {
    log('→ Generating commit message...', 'cyan');

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      log(`✗ Error: ${data.error || 'Unknown error'}`, 'red');
      return null;
    }

    return data;
  } catch (error) {
    log(`✗ Connection error: ${error.message}`, 'red');
    return null;
  }
}

async function commandAuth() {
  log('=== Gitset Authentication ===', 'blue');
  await authenticate();
}

function commandLogout() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
    log('✓ Session closed successfully', 'green');
  } else {
    log('No active session', 'yellow');
  }
}

async function commandCommit(options = {}) {
  if (!isGitRepo()) {
    log('✗ Not in a Git repository', 'red');
    return;
  }

  let mode = 'unstaged';
  let modeLabel = 'unstaged';

  if (options.staged) {
    mode = 'staged';
    modeLabel = 'staged only';
  } else if (options.all) {
    mode = 'all';
    modeLabel = 'all changes';
  }

  log(`\n→ Analyzing ${modeLabel} changes...\n`, 'cyan');

  const changesData = prepareChangesData(mode);
  if (!changesData) {
    log('✗ No changes to analyze', 'red');
    return;
  }

  const files = getChangedFiles(mode);
  if (files.length > 0) {
    log(`● Files detected: ${files.length}`, 'yellow');
    if (files.length < 10) {
      files.forEach(f => log(`  ${f.status === 'A' ? '+' : f.status === 'M' ? '•' : '-'} ${f.file}`, 'reset'));
    }
  }

  let customTemplate = null;
  if (options.custom) {
    customTemplate = loadTemplate();
    if (customTemplate) log('→ Custom template loaded', 'pink');
  }

  let currentMessage = null;
  let usage = null;

  // Initial Generation
  let currentDraftId = null;
  let currentVersion = 0;

  const result = await generateCommitMessage(changesData, {
    historical: options.historical,
    customTemplate
  });

  if (!result) return;
  if (!result) return;
  currentMessage = result.commit_message;
  usage = result.usage;
  currentDraftId = result.draft_id;
  currentVersion = result.version_number;

  // Interactive Loop
  while (true) {
    console.clear();
    log('=== Commit Message Draft ===', 'blue');
    if (currentVersion > 1) {
      log(`(Version ${currentVersion})`, 'pink');
    }
    log('\n' + '-'.repeat(50), 'reset');
    console.log(currentMessage);
    log('-'.repeat(50) + '\n', 'reset');

    if (usage) {
      log('📈 Usage quota:', 'pink');
      log(`   Plan: ${usage.plan}`, 'reset');
      log(`   Used: ${usage.used_requests}`, 'reset');
      log(`   Remaining: ${usage.remaining_requests}`, 'reset');
      log(`   Renewable: ${usage.renewable ? 'Yes' : 'No'}`, 'reset');
      log('');
    }

    const action = await selectOption('What would you like to do?', [
      { label: 'Confirm & Commit', value: 'commit' },
      { label: 'Refine with AI', value: 'refine' },
      { label: 'Edit Manually', value: 'edit' },
      { label: 'Copy to Clipboard', value: 'copy' },
      { label: 'Cancel', value: 'cancel' }
    ]);

    if (action === 'cancel') {
      log('Cancelled.', 'yellow');
      break;
    }

    if (action === 'commit') {
      try {
        // Stage files if they were analyzed (and thus part of the generated message)
        if (mode !== 'staged') {
          const filesToStage = files.map(f => f.file);
          if (filesToStage.length > 0) {
            const { spawnSync } = require('child_process');
            spawnSync('git', ['add', ...filesToStage], { stdio: 'inherit' });
          }
        }

        // Use spawnSync to avoid shell interpretation of backticks/quotes in the message
        const { spawnSync } = require('child_process');
        const commitResult = spawnSync('git', ['commit', '-m', currentMessage], { stdio: 'inherit' });

        if (commitResult.status === 0) {
          log('✓ Commit successful!', 'green');

          const push = await askQuestion('Do you want to push and sync changes? (y/n): ');
          if (push.toLowerCase() === 'y') {
            log('→ Pushing changes...', 'cyan');
            try {
              execCommand('git push');
              log('✓ Push successful', 'green');

              const sync = await askQuestion('Do you want to sync (pull) changes? (y/n): ');
              if (sync.toLowerCase() === 'y') {
                log('→ Syncing...', 'cyan');
                execCommand('git pull');
                log('✓ Sync complete', 'green');
              }
            } catch (e) {
              log(`✗ Push failed: ${e.message}`, 'red');
            }
          }
          break;
        } else {
          log('✗ Commit failed.', 'red');
          // Don't break, let user try again or edit
        }
      } catch (err) {
        log(`✗ Commit failed: ${err.message}`, 'red');
      }
    }

    if (action === 'edit') {
      currentMessage = openInEditor(currentMessage);
    }

    if (action === 'copy') {
      // Simple clipboard copy for Mac (pbcopy)
      try {
        const { spawnSync } = require('child_process');
        const pbcopy = spawnSync('pbcopy', { input: currentMessage });
        if (pbcopy.status === 0) {
          log('✓ Copied to clipboard!', 'green');
        } else {
          log('✗ Failed to copy to clipboard', 'red');
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        log('✗ Failed to copy to clipboard', 'red');
      }
    }

    if (action === 'refine') {
      const instruction = await askQuestion('Refinement instruction (e.g. "Make it shorter", "Add more context"): ');
      log('→ Refining...', 'yellow');

      // Re-call generate but with instruction (requires backend support or simple re-prompt)
      // For now, we'll re-generate with the instruction appended to the prompt context if backend supports it,
      // OR we can just re-run generation with the instruction as a "custom template" override or similar.
      // Since backend might not support "refine" action for commits yet, we'll simulate it by re-generating 
      // and pretending the instruction is part of the context.

      // Ideally, we should update the backend to handle refinement for commits too.
      // For this step, I will re-call generateCommitMessage passing the instruction as a "hint".
      // Note: The current generateCommitMessage doesn't explicitly take an instruction, 
      // so I might need to hack it into the customTemplate or update the backend.

      // Let's try passing it as part of the custom template for now to avoid backend changes if possible,
      // or better, just re-run with the instruction.

      const refineResult = await generateCommitMessage(changesData, {
        historical: options.historical,
        customTemplate,
        draftId: currentDraftId,
        instruction
      });

      if (refineResult) {
        currentMessage = refineResult.commit_message;
        usage = refineResult.usage;
        currentDraftId = refineResult.draft_id;
        currentVersion = refineResult.version_number;
      }
    }
  }
}

function commandStatus() {
  if (!isGitRepo()) {
    log('✗ Not in a Git repository', 'red');
    return;
  }

  const config = loadConfig();
  const authenticated = !!config?.gitset_key;

  log('\n=== Gitset Status ===', 'blue');
  log(`Authenticated: ${authenticated ? '✓ Yes' : '✗ No'}`, authenticated ? 'green' : 'red');

  if (authenticated && config) {
    log('\n👤 User:', 'cyan');
    log(`   Email: ${config.user_email || 'Not available'}`, 'yellow');
    log(`   Plan: ${config.user_plan || 'Not available'}`, 'yellow');
    if (config.github_token) {
      log(`   GitHub token: ${config.github_token.substring(0, 8)}...`, 'yellow');
    }
    if (config.authenticated_at) {
      log(`   Authenticated: ${new Date(config.authenticated_at).toLocaleString()}`, 'yellow');
    }
  }

  const stagedFiles = getChangedFiles('staged');
  const unstagedFiles = getChangedFiles('unstaged');

  log(`\nStaged files: ${stagedFiles.length}`, 'cyan');
  stagedFiles.forEach(f => log(`  ${f.status} ${f.file}`, 'green'));

  log(`\nUnstaged files: ${unstagedFiles.length}`, 'cyan');
  unstagedFiles.forEach(f => log(`  ${f.status} ${f.file}`, 'yellow'));
}

function parseGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        if (pattern.startsWith('/')) {
          return pattern.substring(1);
        }
        return pattern;
      });
  } catch {
    return [];
  }
}

function shouldExcludeItem(itemName, itemPath, excludePatterns, isDirectory) {
  for (const pattern of excludePatterns) {
    if (pattern.startsWith('/')) {
      const cleanPattern = pattern.substring(1);
      if (itemName === cleanPattern || itemPath.includes(`/${cleanPattern}`)) {
        return true;
      }
    } else if (pattern.endsWith('/')) {
      if (isDirectory && itemName === pattern.slice(0, -1)) {
        return true;
      }
    } else if (pattern.startsWith('*.')) {
      const ext = pattern.substring(1);
      if (itemName.endsWith(ext)) {
        return true;
      }
    } else if (pattern.startsWith('.')) {
      if (itemName.endsWith(pattern)) {
        return true;
      }
    } else {
      if (itemName === pattern || itemPath.includes(`/${pattern}/`) || itemPath.endsWith(`/${pattern}`)) {
        return true;
      }
    }
  }
  return false;
}

function commandTree(dir = '.', prefix = '', options = {}) {
  const {
    maxDepth = 999,
    currentDepth = 0,
    excludePatterns = [],
    stats = { dirs: 0, files: 0 }
  } = options;

  if (currentDepth >= maxDepth) return stats;

  let items;
  try {
    items = fs.readdirSync(dir);
  } catch {
    return stats;
  }

  items = items.filter(item => {
    if (item.startsWith('.') && item !== '.gitignore') {
      return false;
    }

    const itemPath = path.join(dir, item);
    const itemStats = fs.statSync(itemPath);
    const isDirectory = itemStats.isDirectory();

    const relativePath = path.relative(process.cwd(), itemPath);

    return !shouldExcludeItem(item, relativePath, excludePatterns, isDirectory);
  });

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const itemPath = path.join(dir, item);
    let itemStats;

    try {
      itemStats = fs.statSync(itemPath);
    } catch {
      return;
    }

    const isDirectory = itemStats.isDirectory();
    const connector = isLast ? '└── ' : '├── ';
    const icon = isDirectory ? '📁' : '📄';

    console.log(`${prefix}${connector}${icon} ${item}`);

    if (isDirectory) {
      stats.dirs++;
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      commandTree(itemPath, newPrefix, {
        maxDepth,
        currentDepth: currentDepth + 1,
        excludePatterns,
        stats
      });
    } else {
      stats.files++;
    }
  });

  return stats;
}

async function commandVerify() {
  const gitsetKey = getGitsetKey();

  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return;
  }

  log('\n🔍 Verifying connection with Gitset...\n', 'cyan');
  log(`● Key: ${gitsetKey.substring(0, 12)}...`, 'blue');

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitset_key: gitsetKey,
        changes: [{ file: 'test.js', status: 'M', before: 'a', after: 'b' }],
        diff: 'test'
      })
    });

    const data = await response.json();

    if (response.ok) {
      log('✓ Connection successful', 'green');
      log(`✓ User verified`, 'green');
      if (data.quota_info) {
        log(`\n● Account information:`, 'cyan');
        log(`   Plan: ${data.quota_info.plan}`, 'yellow');
        log(`   Messages used: ${data.quota_info.used}`, 'yellow');
        log(`   Messages remaining: ${data.quota_info.remaining}`, 'yellow');
      }
    } else if (response.status === 401) {
      log('✗ Invalid Gitset Key', 'red');
      log('  The key does not exist in the database', 'yellow');
    } else if (response.status === 500) {
      log('✗ Server error', 'red');
      log(`  Message: ${data.message || 'Unknown error'}`, 'yellow');
      if (data.details) {
        log(`  Details: ${data.details}`, 'yellow');
      }
    } else {
      log(`✗ Error ${response.status}`, 'red');
      log(`  ${data.error || data.message || 'Unknown error'}`, 'yellow');
    }
  } catch (error) {
    log('✗ Connection error', 'red');
    log(`  ${error.message}`, 'yellow');
  }

  log('');
}

function commandTemplate(action) {
  ensureConfigDir();

  if (!action || action === '--sync') {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    log('\n=== Gitset Template Manager ===', 'blue');
    log('Create a custom commit message template\n', 'cyan');
    log('Example template structure:', 'yellow');
    log('---', 'yellow');
    log('type(scope): brief description', 'yellow');
    log('', 'yellow');
    log('- Use present tense', 'yellow');
    log('- Keep first line under 72 characters', 'yellow');
    log('- Add detailed context if needed', 'yellow');
    log('---\n', 'yellow');

    const lines = [];

    log('Enter your template (press Ctrl+D or Ctrl+Z when done):\n', 'cyan');

    rl.on('line', (line) => {
      lines.push(line);
    });

    rl.on('close', () => {
      if (lines.length === 0) {
        log('\n✗ No template provided', 'red');
        return;
      }

      const template = lines.join('\n');
      fs.writeFileSync(TEMPLATE_FILE, template, 'utf8');

      log('\n✓ Template saved successfully', 'green');
      log(`📁 Location: ${TEMPLATE_FILE}`, 'cyan');
      log(`\nUse with: gitset commit --custom\n`, 'yellow');
    });
  } else if (action === '--show') {
    if (!fs.existsSync(TEMPLATE_FILE)) {
      log('✗ No template found', 'red');
      log('  Create one with: gitset template --sync', 'yellow');
      return;
    }

    const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
    log('\n=== Current Template ===', 'blue');
    log(template, 'cyan');
    log('');
  } else if (action === '--delete') {
    if (!fs.existsSync(TEMPLATE_FILE)) {
      log('✗ No template to delete', 'red');
      return;
    }

    fs.unlinkSync(TEMPLATE_FILE);
    log('✓ Template deleted successfully', 'green');
  } else {
    log('✗ Invalid template command', 'red');
    log('  Available: --sync, --show, --delete', 'yellow');
  }
}

function showHelp() {
  log('\n● Gitset CLI v2.1', 'blue');
  log('\nAvailable commands:\n', 'cyan');

  log('AUTHENTICATION:', 'pink');
  log('  gitset auth               Authenticate with Gitset Key', 'green');
  log('  gitset verify             Verify server connection', 'green');
  log('  gitset logout             Close session', 'green');

  log('\nCOMMIT GENERATION:', 'pink');
  log('  gitset commit             Generate commit message (unstaged changes)', 'green');
  log('  gitset commit --staged    Generate commit message (staged only)', 'green');
  log('  gitset commit --all       Generate commit message (all changes)', 'green');
  log('  gitset commit --custom    Use custom template for generation', 'green');
  log('  gitset commit --historical --N   Use last N commits for style (5-20)', 'green');
  log('  gitset commit --historical       Use last 10 commits (default)', 'green');

  log('\nPROJECT MANAGEMENT:', 'pink');
  log('  gitset init               Initialize Gitset templates', 'green');
  log('  gitset issue              Create new issue with AI', 'green');
  log('  gitset issue --close      Interactive issue closing', 'green');
  log('  gitset pr                 Create Pull Request with AI', 'green');
  log('  gitset release            Manage Tags & Releases', 'green');
  log('  gitset readme             Generate/Update README', 'green');
  log('  gitset dependabot         Analyze and resolve Dependabot alerts', 'green');
  log('  gitset repo --labelspack  Apply custom label pack to repository', 'green');

  log('\nTEMPLATE MANAGEMENT:', 'pink');
  log('  gitset template --sync    Create/update commit message template', 'green');
  log('  gitset template --show    Display current template', 'green');
  log('  gitset template --delete  Remove template', 'green');

  log('\nTREE VISUALIZATION:', 'pink');
  log('  gitset tree               Show complete project structure', 'green');
  log('  gitset tree --flag /node_modules --flag .astro', 'green');
  log('                            Exclude specific folders', 'green');
  log('  gitset tree --flag .png   Exclude files by extension', 'green');
  log('  gitset tree --flag .md    Exclude all .md files', 'green');
  log('  gitset tree --flag --gitignore', 'green');
  log('                            Exclude all patterns from .gitignore', 'green');

  log('\nUTILITIES:', 'pink');
  log('  gitset status             View repository status', 'green');
  log('  gitset help               Show this help', 'green');

  log('\nEXAMPLES:', 'pink');
  log('  gitset commit --custom --historical --15', 'cyan');
  log('  gitset commit --all --historical', 'cyan');
  log('  gitset commit --staged --custom', 'cyan');
  log('  gitset tree --flag /node_modules --flag /dist', 'cyan');
  log('  gitset tree --flag .png --flag .jpg', 'cyan');
  log('  gitset tree --flag --gitignore', 'cyan');
  log('  gitset gitignore          Generate .gitignore (auto-detect)', 'cyan');
  log('  gitset gitignore --select Select templates interactively', 'cyan');

  log('\nNOTE:', 'yellow');
  log('  Historical range: 5-20 commits (default: 10)', 'yellow');
  log('  Template stored in: ~/.gitset/COMMIT-MSG-TEMPLATE.md', 'yellow');
  log('  Tree works on all platforms without external dependencies', 'yellow');
  log('');
}

// --- Issue Crafter ---

const ISSUE_API_URL = 'https://gitset-core-v2.vercel.app/api/issue';

async function callIssueApi(payload) {
  const gitsetKey = getGitsetKey();
  if (!gitsetKey) throw new Error('Not authenticated');

  const response = await fetch(ISSUE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, gitset_key: gitsetKey })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'API Error');
  return data;
}

function getRepoUrl() {
  return execCommand('git config --get remote.origin.url');
}

function getExistingLabels() {
  try {
    const output = execCommand('gh label list --limit 100 --json name');
    if (!output) return [];
    return JSON.parse(output).map(l => l.name);
  } catch {
    return [];
  }
}

// --- Init Command ---

function commandInit() {
  ensureConfigDir();

  const commitTemplatePath = path.join(CONFIG_DIR, 'COMMIT-MSG-TEMPLATE.md');
  const issueTemplatePath = path.join(CONFIG_DIR, 'ISSUE-TEMPLATE.md');

  const commitBoilerplate = `type(scope): brief description

- Use present tense
- Keep first line under 72 characters
- Add detailed context if needed
`;

  const issueBoilerplate = `### Summary
Briefly describe the issue.

### Background
Why is this change needed?

### Detailed Description
Explain the technical details.

### Acceptance Criteria
- [ ] Criteria 1
- [ ] Criteria 2
`;

  if (!fs.existsSync(commitTemplatePath)) {
    fs.writeFileSync(commitTemplatePath, commitBoilerplate);
    log('✓ Created commit template: ~/.gitset/COMMIT-MSG-TEMPLATE.md', 'green');
  } else {
    log('ℹ Commit template already exists', 'yellow');
  }

  if (!fs.existsSync(issueTemplatePath)) {
    fs.writeFileSync(issueTemplatePath, issueBoilerplate);
    log('✓ Created issue template: ~/.gitset/ISSUE-TEMPLATE.md', 'green');
  } else {
    log('ℹ Issue template already exists', 'yellow');
  }

  // PR Template
  const prTemplatePath = path.join(CONFIG_DIR, 'PR-TEMPLATE.md');
  const prBoilerplate = `## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Description
Briefly describe the changes.

## Related Issues
Fixes #

## Testing
- [ ] Unit tests passed
- [ ] Manual testing verified
`;

  if (!fs.existsSync(prTemplatePath)) {
    fs.writeFileSync(prTemplatePath, prBoilerplate);
    log('✓ Created PR template: ~/.gitset/PR-TEMPLATE.md', 'green');
  } else {
    log('ℹ PR template already exists', 'yellow');
  }

  // README Template
  const readmeTemplatePath = path.join(CONFIG_DIR, 'README-TEMPLATE.md');
  const readmeBoilerplate = `# {{PROJECT_NAME}}

{{DESCRIPTION}}

## Features
- Feature 1
- Feature 2

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`bash
npm start
\`\`\`
`;

  if (!fs.existsSync(readmeTemplatePath)) {
    fs.writeFileSync(readmeTemplatePath, readmeBoilerplate);
    log('✓ Created README template: ~/.gitset/README-TEMPLATE.md', 'green');
  } else {
    log('ℹ README template already exists', 'yellow');
  }

  // Release Template
  const releaseTemplatePath = path.join(CONFIG_DIR, 'RELEASE-TEMPLATE.md');
  const releaseBoilerplate = `## 🎉 What's New

### ✨ Features
- Feature 1
- Feature 2

### 🐛 Bug Fixes
- Fix 1
- Fix 2

### 💥 Breaking Changes
- Change 1

### 📝 Documentation
- Doc update 1

### 🙏 Contributors
- @username
`;

  if (!fs.existsSync(releaseTemplatePath)) {
    fs.writeFileSync(releaseTemplatePath, releaseBoilerplate);
    log('✓ Created Release template: ~/.gitset/RELEASE-TEMPLATE.md', 'green');
  } else {
    log('ℹ Release template already exists', 'yellow');
  }

  // Labels Template
  const labelsTemplatePath = path.join(CONFIG_DIR, 'labels.md');
  const labelsBoilerplate = `<!-- gitset-labels-customized: false -->
# My Custom GitHub Labels

This file defines the custom labels to be applied to your GitHub repositories using \`gitset repo --labelspack\`.
Edit the YAML block below to define your labels. Once customized, (PLEASE READ THE FIRST LINE OF THIS DOCUMENT) change \`gitset-labels-customized: false\` to \`true\`.

---

\`\`\`yaml
# Define your labels here.
# Each label should be an item in the list.
# 'name' is required.
# 'color' is optional (hex code like #RRGGBB). If omitted, a random color will be assigned.
# 'description' is optional. If omitted, it will be empty.

- name: agent
  color: "#00e676"
  description: Related to autonomous agents and agent-based functionality.
- name: AI
  color: "#e040fb"
  description: Related to artificial intelligence and machine learning features.
- name: api
  color: "#009688"
  description: Related to API design, endpoints, or integration.
- name: architecture
  color: "#5c6bc0"
  description: Related to system architecture and design decisions.
- name: backend
  color: "#26a69a"
  description: Related to server-side logic and APIs.
- name: breaking-change
  color: "#d32f2f"
  description: Changes that break backwards compatibility.
- name: bug
  color: "#d73a4a"
  description: Something isn't working as expected.
- name: cloud
  color: "#42a5f5"
  description: Related to cloud services and deployment.
- name: core
  color: "#3f51b5"
  description: Core functionality or critical system components.
- name: database
  color: "#5e35b1"
  description: Related to database schema, queries, or storage.
- name: deprecated
  color: "#795548"
  description: Features or code that are no longer supported.
- name: deprecation
  color: "#ff6f00"
  description: Features or code marked for deprecation.
- name: development
  color: "#4caf50"
  description: Related to development environment or tooling.
- name: documentation
  color: "#0075ca"
  description: Improvements or additions to documentation.
- name: feature
  color: "#a2eeef"
  description: A new feature or request.
- name: fix
  color: "#ff5722"
  description: Bug fix or correction.
- name: frontend
  color: "#29b6f6"
  description: Related to user interface and client-side code.
- name: help wanted
  color: "#008672"
  description: Extra attention is needed.
- name: implementation
  color: "#03a9f4"
  description: Implementation of approved features or changes.
- name: infrastructure
  color: "#8d6e63"
  description: Related to infrastructure setup and configuration.
- name: migration
  color: "#9c27b0"
  description: Data or code migration tasks.
- name: priority:high
  color: "#e91e63"
  description: This issue needs immediate attention.
- name: priority:low
  color: "#8bc34a"
  description: This issue can be addressed when time permits.
- name: priority:medium
  color: "#ff9800"
  description: This issue should be addressed soon.
- name: production
  color: "#f44336"
  description: Issues or changes affecting production environment.
- name: project-setup
  color: "#66bb6a"
  description: Initial project configuration and setup tasks.
- name: refactor
  color: "#ffa726"
  description: Code structure changes without changing external behavior.
- name: refine
  color: "#ffc107"
  description: Improvements and refinements to existing features.
- name: spec
  color: "#00bcd4"
  description: Specification or design documentation needed.
- name: style
  color: "#f06292"
  description: Related to styling, theming, and visual appearance.
- name: UI
  color: "#ab47bc"
  description: Related to visual design and interface elements.
- name: UX
  color: "#ec407a"
  description: Related to user experience and interactions.
- name: UX/UI
  color: "#7e57c2"
  description: Related to both user experience and interface design.
- name: wip
  color: "#ffeb3b"
  description: Work in progress, not ready for review.
\`\`\`
`;

  if (!fs.existsSync(labelsTemplatePath)) {
    fs.writeFileSync(labelsTemplatePath, labelsBoilerplate);
    log('✓ Created Labels template: ~/.gitset/labels.md', 'green');
  } else {
    log('ℹ Labels template already exists', 'yellow');
  }
}

// --- Issue Crafter Helpers ---

function loadIssueTemplate() {
  const templatePath = path.join(CONFIG_DIR, 'ISSUE-TEMPLATE.md');
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }
  return null;
}

function loadReadmeTemplate() {
  const templatePath = path.join(CONFIG_DIR, 'README-TEMPLATE.md');
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }
  return null;
}

function getAssignees() {
  try {
    // Fetch collaborators who can be assigned
    const output = execCommand('gh api repos/:owner/:repo/collaborators --jq ".[].login"');
    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function getMilestones() {
  try {
    const output = execCommand('gh api repos/:owner/:repo/milestones --jq ".[].title"');
    if (!output) return [];
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function openInEditor(initialContent) {
  const tmpFile = path.join(os.tmpdir(), `gitset-edit-${Date.now()}.md`);
  fs.writeFileSync(tmpFile, initialContent);

  const editor = process.env.EDITOR || 'vi';

  try {
    execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
    return fs.readFileSync(tmpFile, 'utf8');
  } catch (e) {
    log(`✗ Failed to open editor: ${e.message}`, 'red');
    return initialContent;
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

async function closeIssueInteractive() {
  log('\n=== Close Issue ===', 'blue');

  // List open issues
  const issuesOutput = execCommand('gh issue list --limit 10 --json number,title');
  if (!issuesOutput) {
    log('No open issues found.', 'yellow');
    return;
  }

  const issues = JSON.parse(issuesOutput);
  if (issues.length === 0) {
    log('No open issues found.', 'yellow');
    return;
  }

  issues.forEach((issue, i) => {
    log(`${i + 1}. #${issue.number} ${issue.title}`, 'cyan');
  });

  const selection = await askQuestion('\nSelect issue to close (number): ');
  const index = parseInt(selection) - 1;

  if (index >= 0 && index < issues.length) {
    const issue = issues[index];
    const reason = await selectOption('Reason for closing:', [
      { label: 'Completed', value: 'completed' },
      { label: 'Not Planned', value: 'not planned' },
      { label: 'Duplicate', value: 'duplicate' }
    ]);

    const ghReason = reason === 'completed' ? 'completed' : 'not planned';

    try {
      execCommand(`gh issue close ${issue.number} --reason "${ghReason}"`);
      if (reason === 'duplicate') {
        execCommand(`gh issue comment ${issue.number} --body "Closed as duplicate."`);
      }
      log(`✓ Issue #${issue.number} closed as ${reason}.`, 'green');
    } catch (e) {
      log(`✗ Failed to close issue: ${e.message}`, 'red');
    }
  }
}

function loadPRTemplate() {
  const templatePath = path.join(CONFIG_DIR, 'PR-TEMPLATE.md');
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }
  return null;
}

async function callPRApi(payload) {
  const gitsetKey = getGitsetKey();
  const response = await fetch(`${BACKEND_URL.replace('/commit', '/pr')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, gitset_key: gitsetKey })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API request failed');
  }

  return await response.json();
}

function getReviewers() {
  try {
    // Exclude current user to avoid self-review error (though gh handles it, it's cleaner)
    const currentUser = execCommand('gh api user --jq ".login"');
    const output = execCommand('gh api repos/:owner/:repo/collaborators --jq ".[].login"');
    if (!output) return [];
    return output.split('\n').filter(u => u && u !== currentUser);
  } catch {
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

async function commandPR(options = {}) {
  if (!isGitRepo()) {
    log('✗ Not in a Git repository', 'red');
    return;
  }

  const gitsetKey = getGitsetKey();
  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return;
  }

  log('\n=== Gitset PR Maker ===', 'blue');

  // 1. Branch Detection
  const currentBranch = execCommand('git branch --show-current');
  const defaultTarget = 'main'; // Could try to detect master/main

  log(`Current Branch: ${currentBranch}`, 'cyan');
  const targetBranch = await askQuestion(`Target Branch [${defaultTarget}]: `) || defaultTarget;

  // 2. Diff Capture
  log('→ Capturing diff...', 'yellow');
  let diff;
  try {
    // Get diff between target and current branch
    diff = execCommand(`git diff ${targetBranch}...${currentBranch}`);
    if (!diff) {
      log('⚠️  No diff found or branches are identical.', 'yellow');
      const proceed = await askQuestion('Proceed anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') return;
    }
  } catch (e) {
    log(`✗ Error capturing diff: ${e.message}`, 'red');
    return;
  }

  // 3. Initial Description
  const description = await askQuestion('Describe the PR (briefly): ');
  if (!description) return;

  let customTemplate = null;
  if (options.custom) {
    customTemplate = loadPRTemplate();
    if (customTemplate) log('→ Using custom PR template', 'pink');
  }

  log('\n→ Generating PR draft with AI...', 'yellow');

  let draft;
  try {
    draft = await callPRApi({
      action: 'generate',
      description,
      diff,
      repoContext: getRepoUrl(),
      custom_template: customTemplate
    });
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    return;
  }

  let currentTitle = draft.title;
  let currentBody = draft.body;
  let currentLabels = [];
  let selectedMilestone = null;
  let selectedAssignees = [];
  let selectedReviewers = [];
  let isDraft = false;

  // Wizard Loop
  while (true) {
    console.clear();
    log('=== PR Draft ===', 'blue');
    log(`\nTITLE: ${currentTitle}`, 'green');
    log(`TARGET: ${targetBranch} ← ${currentBranch}`, 'cyan');
    log(`LABELS: ${currentLabels.map(l => l.name || l).join(', ') || 'None'}`, 'pink');
    log(`MILESTONE: ${selectedMilestone || 'None'}`, 'pink');
    log(`ASSIGNEES: ${selectedAssignees.join(', ') || 'None'}`, 'pink');
    log(`REVIEWERS: ${selectedReviewers.join(', ') || 'None'}`, 'pink');
    log(`STATUS: ${isDraft ? 'Draft' : 'Ready'}`, 'yellow');
    log(`\nBODY PREVIEW:\n${currentBody.substring(0, 300)}...\n(Full body hidden for brevity)`, 'reset');

    const action = await selectOption('What would you like to do?', [
      { label: 'Confirm & Create PR', value: 'create' },
      { label: 'View Full PR Content', value: 'preview' },
      { label: 'Edit/Refine Title', value: 'title' },
      { label: 'Edit/Refine Description', value: 'body' },
      { label: 'Manage Labels', value: 'labels' },
      { label: 'Set Milestone', value: 'milestone' },
      { label: 'Set Assignees', value: 'assignees' },
      { label: 'Set Reviewers', value: 'reviewers' },
      { label: 'Toggle Draft Status', value: 'draft' },
      { label: 'Save to File', value: 'save' },
      { label: 'Cancel', value: 'cancel' }
    ]);

    if (action === 'cancel') {
      log('Cancelled.', 'yellow');
      break;
    }

    if (action === 'preview') {
      console.log('\n' + '-'.repeat(50));
      console.log(`TITLE: ${currentTitle}\n`);
      console.log(currentBody);
      console.log('-'.repeat(50) + '\n');
      await askQuestion('Press Enter to continue...');
    }

    if (action === 'save') {
      const filename = await askQuestion('Filename (e.g. pr_draft.md): ');
      if (filename) {
        fs.writeFileSync(filename, `# ${currentTitle}\n\n${currentBody}`);
        log(`✓ Saved to ${filename}`, 'green');
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (action === 'draft') {
      isDraft = !isDraft;
    }

    // ... (Reuse logic for title, body, labels, milestone, assignees from commandIssue if possible or duplicate for speed)
    if (action === 'title') {
      const choice = await selectOption('Title Action:', [
        { label: 'Edit Manually', value: 'manual' },
        { label: 'AI Refine', value: 'refine' }
      ]);
      if (choice === 'manual') {
        currentTitle = await askQuestion('New Title: ');
      } else {
        const instruction = await askQuestion('Refinement instruction: ');
        log('→ Refining...', 'yellow');
        const res = await callPRApi({
          action: 'refine',
          draftId: draft.draftId,
          field: 'title',
          currentContent: currentTitle,
          instruction,
          fullContext: { title: currentTitle, body: currentBody }
        });
        currentTitle = res.content;
      }
    }

    if (action === 'body') {
      const choice = await selectOption('Body Action:', [
        { label: 'Edit Manually (Editor)', value: 'manual' },
        { label: 'AI Refine', value: 'refine' }
      ]);
      if (choice === 'manual') {
        currentBody = openInEditor(currentBody);
      } else {
        const instruction = await askQuestion('Refinement instruction: ');
        log('→ Refining...', 'yellow');
        const res = await callPRApi({
          action: 'refine',
          draftId: draft.draftId,
          field: 'description',
          currentContent: currentBody,
          instruction,
          fullContext: { title: currentTitle, body: currentBody }
        });
        currentBody = res.content;
      }
    }

    if (action === 'labels') {
      currentLabels = await manageLabelsInteractive(currentLabels);
    }

    if (action === 'milestone') {
      const milestones = getMilestones();
      if (milestones.length === 0) {
        log('No milestones found.', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        log('\nAvailable Milestones:', 'cyan');
        milestones.forEach((m, i) => log(`${i + 1}. ${m}`, 'reset'));
        const selection = await askQuestion('Select milestone (number): ');
        const idx = parseInt(selection) - 1;
        if (idx >= 0 && idx < milestones.length) selectedMilestone = milestones[idx];
      }
    }

    if (action === 'assignees') {
      const assignees = getAssignees();
      if (assignees.length === 0) {
        log('No assignees found.', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        log('\nAvailable Assignees:', 'cyan');
        assignees.forEach((a, i) => log(`${i + 1}. ${a}`, 'reset'));
        const selection = await askQuestion('Select assignees (numbers, comma sep): ');
        const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
        selectedAssignees = indices.map(i => assignees[i]).filter(a => a);
      }
    }

    if (action === 'reviewers') {
      const reviewers = getReviewers();
      if (reviewers.length === 0) {
        log('No reviewers found.', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        log('\nAvailable Reviewers:', 'cyan');
        reviewers.forEach((r, i) => log(`${i + 1}. ${r}`, 'reset'));
        const selection = await askQuestion('Select reviewers (numbers, comma sep): ');
        const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
        selectedReviewers = indices.map(i => reviewers[i]).filter(r => r);
      }
    }

    if (action === 'create') {
      log('\n→ Creating PR on GitHub...', 'cyan');

      // Create temporary file for body
      const tmpFile = path.join(os.tmpdir(), `gitset-pr-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, currentBody);

      const labelArgs = currentLabels.map(l => `-l "${l.name || l}"`).join(' ');
      const milestoneArg = selectedMilestone ? `-m "${selectedMilestone}"` : '';
      const assigneeArg = selectedAssignees.length > 0 ? `-a "${selectedAssignees.join(',')}"` : '';
      const reviewerArg = selectedReviewers.length > 0 ? `-r "${selectedReviewers.join(',')}"` : '';
      const draftArg = isDraft ? '--draft' : '';
      const baseArg = `-B "${targetBranch}"`;

      const cmd = `gh pr create -t "${currentTitle}" -F "${tmpFile}" ${baseArg} ${labelArgs} ${milestoneArg} ${assigneeArg} ${reviewerArg} ${draftArg}`;

      try {
        const url = execCommand(cmd);
        if (url) {
          log(`\n✓ PR created successfully!`, 'green');
          log(`🔗 URL: ${url}`, 'blue');

          // Post-creation menu
          while (true) {
            const postAction = await selectOption('\nPR Created. What next?', [
              { label: 'View in Browser', value: 'view' },
              { label: 'Merge PR', value: 'merge' },
              { label: 'Close PR', value: 'close' },
              { label: 'Add Comment', value: 'comment' },
              { label: 'Return to Main Menu', value: 'exit' }
            ]);

            if (postAction === 'exit') break;

            if (postAction === 'view') {
              execCommand(`gh pr view "${url}" --web`);
            }

            if (postAction === 'merge') {
              const method = await selectOption('Merge Method:', [
                { label: 'Merge Commit', value: '--merge' },
                { label: 'Squash and Merge', value: '--squash' },
                { label: 'Rebase and Merge', value: '--rebase' }
              ]);
              try {
                execCommand(`gh pr merge "${url}" ${method} --delete-branch`);
                log('✓ PR Merged!', 'green');
                break;
              } catch (e) {
                log(`✗ Merge failed: ${e.message}`, 'red');
              }
            }

            if (postAction === 'close') {
              try {
                execCommand(`gh pr close "${url}"`);
                log('✓ PR Closed.', 'green');
                break;
              } catch (e) {
                log(`✗ Close failed: ${e.message}`, 'red');
              }
            }

            if (postAction === 'comment') {
              const body = await askQuestion('Comment body: ');
              if (body) {
                execCommand(`gh pr comment "${url}" --body "${body}"`);
                log('✓ Comment added.', 'green');
              }
            }
          }
        } else {
          log('\n✗ Failed to create PR via gh CLI', 'red');
        }
      } catch (error) {
        log(`\n✗ Error creating PR: ${error.message}`, 'red');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
      break;
    }
  }
}

async function commandIssue(options = {}) {
  if (!isGitRepo()) {
    log('✗ Not in a Git repository', 'red');
    return;
  }

  const gitsetKey = getGitsetKey();
  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return;
  }

  if (options.close) {
    await closeIssueInteractive();
    return;
  }

  log('\n=== Gitset Issue Crafter ===', 'blue');

  // 1. Initial Description
  const description = await askQuestion('Describe the issue (what, why, how): ');
  if (!description) return;

  let customTemplate = null;
  if (options.custom) {
    customTemplate = loadIssueTemplate();
    if (customTemplate) {
      log('→ Using custom issue template', 'pink');
    } else {
      log('⚠️  No custom issue template found. Run gitset init', 'yellow');
    }
  }

  log('\n→ Generating draft with AI...', 'yellow');

  let draft;
  try {
    draft = await callIssueApi({
      action: 'generate',
      description,
      repoContext: getRepoUrl(),
      custom_template: customTemplate
    });
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    return;
  }

  let currentTitle = draft.title;
  let currentBody = draft.body;
  let currentLabels = [];
  let draftId = draft.draftId;
  let selectedMilestone = null;
  let selectedAssignees = [];

  // Wizard Loop
  while (true) {
    console.clear();
    log('=== Issue Draft ===', 'blue');
    log(`\nTITLE: ${currentTitle}`, 'green');
    log(`\nLABELS: ${currentLabels.map(l => l.name || l).join(', ') || 'None'}`, 'pink');
    log(`MILESTONE: ${selectedMilestone || 'None'}`, 'pink');
    log(`ASSIGNEES: ${selectedAssignees.join(', ') || 'None'}`, 'pink');
    log(`\nBODY PREVIEW:\n${currentBody.substring(0, 300)}...\n(Full body hidden for brevity)`, 'reset');

    const action = await selectOption('What would you like to do?', [
      { label: 'Confirm & Create Issue', value: 'create' },
      { label: 'Edit/Refine Title', value: 'title' },
      { label: 'Edit/Refine Description', value: 'body' },
      { label: 'Manage Labels', value: 'labels' },
      { label: 'Set Milestone', value: 'milestone' },
      { label: 'Set Assignees', value: 'assignees' },
      { label: 'Save to File', value: 'save' },
      { label: 'Cancel', value: 'cancel' }
    ]);

    if (action === 'cancel') {
      log('Cancelled.', 'yellow');
      break;
    }

    if (action === 'save') {
      const filename = await askQuestion('Filename (e.g. draft.md): ');
      if (filename) {
        fs.writeFileSync(filename, `# ${currentTitle}\n\n${currentBody}`);
        log(`✓ Saved to ${filename}`, 'green');
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (action === 'milestone') {
      const milestones = getMilestones();
      if (milestones.length === 0) {
        log('No milestones found.', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        log('\nAvailable Milestones:', 'cyan');
        milestones.forEach((m, i) => log(`${i + 1}. ${m}`, 'reset'));
        const selection = await askQuestion('Select milestone (number): ');
        const idx = parseInt(selection) - 1;
        if (idx >= 0 && idx < milestones.length) {
          selectedMilestone = milestones[idx];
        }
      }
    }

    if (action === 'assignees') {
      const assignees = getAssignees();
      if (assignees.length === 0) {
        log('No assignees found.', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
      } else {
        log('\nAvailable Assignees:', 'cyan');
        assignees.forEach((a, i) => log(`${i + 1}. ${a}`, 'reset'));
        const selection = await askQuestion('Select assignees (numbers separated by comma, e.g. 1,2): ');
        const indices = selection.split(',').map(s => parseInt(s.trim()) - 1);
        selectedAssignees = indices.map(i => assignees[i]).filter(a => a);
      }
    }

    if (action === 'create') {
      log('\n→ Creating issue on GitHub...', 'cyan');

      // Ensure labels exist
      const existingLabels = getExistingLabels();
      for (const label of currentLabels) {
        const labelName = label.name || label;
        if (!existingLabels.includes(labelName)) {
          log(`→ Creating label: ${labelName}`, 'yellow');
          const color = label.color ? `--color "${label.color}"` : '';
          const desc = label.description ? `--description "${label.description}"` : '';
          try {
            execCommand(`gh label create "${labelName}" ${color} ${desc}`);
          } catch (e) {
            log(`⚠️ Failed to create label ${labelName}: ${e.message}`, 'yellow');
          }
        }
      }

      // Create temporary file for body
      const tmpFile = path.join(os.tmpdir(), `gitset-issue-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, currentBody);

      const labelArgs = currentLabels.map(l => `-l "${l.name || l}"`).join(' ');
      const milestoneArg = selectedMilestone ? `-m "${selectedMilestone}"` : '';
      const assigneeArg = selectedAssignees.length > 0 ? `-a "${selectedAssignees.join(',')}"` : '';

      const cmd = `gh issue create -t "${currentTitle}" -F "${tmpFile}" ${labelArgs} ${milestoneArg} ${assigneeArg}`;

      try {
        const url = execCommand(cmd);
        if (url) {
          log(`\n✓ Issue created successfully!`, 'green');
          log(`🔗 URL: ${url}`, 'blue');

          // Branch creation prompt
          const issueNumber = url.split('/').pop();
          const createBranch = await askQuestion('\nCreate a branch for this issue? (y/n): ');
          if (createBranch.toLowerCase() === 'y') {
            // Sanitize title for branch name
            const sanitizedTitle = currentTitle
              .toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
              .trim()
              .replace(/\s+/g, '-') // Replace spaces with dashes
              .substring(0, 50); // Limit length

            let branchName = `feat/${issueNumber}-${sanitizedTitle}`;

            const customBranchName = await askQuestion(`Branch name [${branchName}]: `);
            if (customBranchName.trim()) {
              branchName = customBranchName.trim();
            }

            try {
              execCommand(`git checkout -b ${branchName}`);
              log(`✓ Switched to new branch: ${branchName}`, 'green');

              const publish = await askQuestion('Do you want to publish this branch to remote? (y/n): ');
              if (publish.toLowerCase() === 'y') {
                log('→ Publishing branch...', 'cyan');
                try {
                  execCommand(`git push -u origin ${branchName}`);
                  log('✓ Branch published to origin', 'green');
                } catch (e) {
                  log(`✗ Failed to publish branch: ${e.message}`, 'red');
                }
              }
            } catch (e) {
              log(`✗ Failed to create branch: ${e.message}`, 'red');
            }
          }

        } else {
          log('\n✗ Failed to create issue via gh CLI', 'red');
          log('  Command output was empty. Ensure gh is authenticated.', 'yellow');
        }
      } catch (error) {
        log(`\n✗ Error creating issue: ${e.message}`, 'red');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
      break;
    }

    if (action === 'title') {
      const subAction = await selectOption('Title Options:', [
        { label: 'Manual Edit', value: 'manual' },
        { label: 'AI Refine', value: 'ai' },
        { label: 'View History', value: 'history' },
        { label: 'Back', value: 'back' }
      ]);

      if (subAction === 'manual') {
        const newTitle = await askQuestion(`Current: ${currentTitle}\nNew Title: `);
        if (newTitle) currentTitle = newTitle;
      } else if (subAction === 'ai') {
        const instruction = await askQuestion('How should the AI refine the title? ');
        log('→ Refining...', 'yellow');
        const result = await callIssueApi({
          action: 'refine',
          draftId,
          field: 'title',
          currentContent: currentTitle,
          instruction,
          fullIssueContext: { title: currentTitle, body: currentBody }
        });
        currentTitle = result.content;
      } else if (subAction === 'history') {
        const history = await callIssueApi({ action: 'history', draftId, field: 'title' });
        log('\nHistory:', 'cyan');
        history.history.forEach((h, i) => log(`${i + 1}. ${h.content}`, 'reset'));
        await askQuestion('Press Enter to continue...');
      }
    }

    if (action === 'body') {
      const subAction = await selectOption('Description Options:', [
        { label: 'Open in Editor', value: 'editor' },
        { label: 'AI Refine', value: 'ai' },
        { label: 'View History', value: 'history' },
        { label: 'Back', value: 'back' }
      ]);

      if (subAction === 'editor') {
        currentBody = openInEditor(currentBody);
      } else if (subAction === 'ai') {
        const instruction = await askQuestion('How should the AI refine the description? ');
        log('→ Refining...', 'yellow');
        const result = await callIssueApi({
          action: 'refine',
          draftId,
          field: 'description',
          currentContent: currentBody,
          instruction,
          fullIssueContext: { title: currentTitle, body: currentBody }
        });
        currentBody = result.content;
      } else if (subAction === 'history') {
        const history = await callIssueApi({ action: 'history', draftId, field: 'description' });
        log('\nHistory (Versions):', 'cyan');
        history.history.forEach((h, i) => log(`${i + 1}. Version ${h.version_number} (${new Date(h.created_at).toLocaleTimeString()})`, 'reset'));

        const restore = await askQuestion('Restore a version? (Enter number or 0 to cancel): ');
        const idx = parseInt(restore) - 1;
        if (idx >= 0 && idx < history.history.length) {
          currentBody = history.history[idx].content;
          log('✓ Restored', 'green');
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (action === 'labels') {
      currentLabels = await manageLabelsInteractive(currentLabels);
    }
  }
}

function loadReadmeTemplate() {
  const templatePath = path.join(CONFIG_DIR, 'README-TEMPLATE.md');
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, 'utf8');
  }
  return null;
}

// --- README Generator ---
const { analyzeRepo } = require('./src/utils/repo-analyzer');
const { generateBadges } = require('./src/utils/badge-generator');
const { getLicenseList, generateLicenseFile } = require('./src/utils/license-generator');

async function callReadmeApi(payload) {
  const gitsetKey = getGitsetKey();
  const response = await fetch(`${BACKEND_URL.replace('/commit', '/readme')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, gitset_key: gitsetKey })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API request failed');
  }

  return await response.json();
}

async function commandReadme(options = {}) {
  if (!isGitRepo()) {
    log('✗ Not in a Git repository', 'red');
    return;
  }

  const gitsetKey = getGitsetKey();
  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return;
  }

  log('\n=== Gitset README Generator ===', 'blue');

  // 1. Analyze Repo
  log('→ Analyzing repository...', 'yellow');
  const analysis = analyzeRepo(process.cwd());
  log(`✓ Detected: ${analysis.language} (${analysis.packageManager})`, 'green');
  if (analysis.frameworks.length) log(`  Frameworks: ${analysis.frameworks.join(', ')}`, 'green');

  // 2. License Check
  if (!analysis.hasLicense) {
    const addLicense = await askQuestion('\n⚠️  No LICENSE found. Add one? (y/n): ');
    if (addLicense.toLowerCase() === 'y') {
      const licenses = getLicenseList();
      log('Available Licenses:', 'cyan');
      licenses.forEach((l, i) => log(`${i + 1}. ${l}`, 'reset'));
      const sel = await askQuestion('Select license (number): ');
      const idx = parseInt(sel) - 1;
      if (idx >= 0 && idx < licenses.length) {
        const author = await askQuestion('Author Name: ');
        const year = new Date().getFullYear();
        generateLicenseFile(licenses[idx], author, year, process.cwd());
        log('✓ LICENSE file created.', 'green');
        analysis.hasLicense = true;
      }
    }
  }

  // 3. Generate Content
  let customTemplate = null;
  if (options.custom) {
    customTemplate = loadReadmeTemplate();
    if (customTemplate) log('✓ Using custom README template', 'pink');
  }

  // Get Repo Info for Deep Wiki
  let repoInfo = null;
  try {
    const remoteUrl = require('child_process').execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    // Parse owner/repo from URL (supports https and ssh)
    // https://github.com/owner/repo.git or git@github.com:owner/repo.git
    const match = remoteUrl.match(/[:/]([\w-]+)\/([\w-]+)(\.git)?$/);
    if (match) {
      repoInfo = { owner: match[1], name: match[2] };
      log(`→ Detected Remote: ${repoInfo.owner}/${repoInfo.name}`, 'cyan');
    }
  } catch (e) {
    // Ignore if no remote
  }

  log('\n→ Generating README with AI...', 'yellow');

  let draft;
  try {
    draft = await callReadmeApi({
      action: 'generate',
      analysis,
      custom_template: customTemplate,
      repo_info: repoInfo
    });
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    return;
  }

  let currentContent = draft.content;
  const badges = generateBadges(analysis);

  // Prepend badges if not present
  if (!currentContent.includes('img.shields.io')) {
    currentContent = `# ${analysis.name}\n\n${badges}\n\n${currentContent.replace(/^# .*\n/, '')}`;
  }

  // Wizard Loop
  while (true) {
    console.clear();
    log('=== README Draft ===', 'blue');
    log(`\nPREVIEW (First 500 chars):\n${currentContent.substring(0, 500)}...\n`, 'reset');

    const action = await selectOption('What would you like to do?', [
      { label: 'Save & Exit', value: 'save' },
      { label: 'Refine Section', value: 'refine' },
      { label: 'View Full Preview', value: 'preview' },
      { label: 'Cancel', value: 'cancel' }
    ]);

    if (action === 'cancel') {
      log('Cancelled.', 'yellow');
      break;
    }

    if (action === 'save') {
      const filename = 'README.md';
      if (fs.existsSync(filename)) {
        const overwrite = await askQuestion('README.md exists. Overwrite? (y/n): ');
        if (overwrite.toLowerCase() !== 'y') break;
      }
      fs.writeFileSync(filename, currentContent);
      log(`✓ Saved to ${filename}`, 'green');
      break;
    }

    if (action === 'preview') {
      console.log('\n' + '-'.repeat(50));
      console.log(currentContent);
      console.log('-'.repeat(50) + '\n');
      await askQuestion('Press Enter to continue...');
    }

    if (action === 'refine') {
      const instruction = await askQuestion('Refinement instruction (e.g., "Expand Installation section"): ');
      log('→ Refining...', 'yellow');
      const res = await callReadmeApi({
        action: 'refine',
        draftId: draft.draftId,
        currentContent,
        instruction
      });
      currentContent = res.content;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'init':
      commandInit();
      break;

    case 'auth':
      await commandAuth();
      break;

    case 'verify':
      await commandVerify();
      break;

    case 'logout':
      commandLogout();
      break;

    case 'commit': {
      let historicalCount = 0;
      const historicalIndex = args.indexOf('--historical');

      if (historicalIndex !== -1) {
        const nextArg = args[historicalIndex + 1];
        if (nextArg && nextArg.startsWith('--')) {
          const countMatch = nextArg.match(/^--(\d+)$/);
          if (countMatch) {
            historicalCount = parseInt(countMatch[1]);
            if (historicalCount < 5) historicalCount = 5;
            if (historicalCount > 20) historicalCount = 20;
          }
        } else {
          historicalCount = 10;
        }
      }

      const options = {
        staged: args.includes('--staged'),
        all: args.includes('--all'),
        custom: args.includes('--custom'),
        historical: historicalCount
      };

      await commandCommit(options);
      break;
    }

    case 'issue':
      const issueOptions = {
        custom: args.includes('--custom'),
        close: args.includes('--close')
      };
      await commandIssue(issueOptions);
      break;

    case 'pr':
      const prOptions = {
        custom: args.includes('--custom')
      };
      await commandPR(prOptions);
      break;

    case 'readme':
      const readmeOptions = {
        custom: args.includes('--custom')
      };
      await commandReadme(readmeOptions);
      break;

    case 'status':
      commandStatus();
      break;

    case 'tree': {
      const excludePatterns = [];
      let useGitignore = false;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--flag') {
          if (args[i + 1] === '--gitignore') {
            useGitignore = true;
            i++;
          } else if (args[i + 1]) {
            const pattern = args[i + 1];
            excludePatterns.push(pattern);
            i++;
          }
        }
      }

      if (useGitignore) {
        const gitignorePatterns = parseGitignore();
        excludePatterns.push(...gitignorePatterns);
        log('\n📂 Project structure (excluding .gitignore patterns):\n', 'blue');
        log(`Loaded ${gitignorePatterns.length} patterns from .gitignore\n`, 'yellow');
      } else if (excludePatterns.length > 0) {
        log('\n📂 Project structure (with exclusions):\n', 'blue');
        log(`Excluding: ${excludePatterns.join(', ')}\n`, 'yellow');
      } else {
        log('\n📂 Project structure:\n', 'blue');
      }

      const stats = commandTree('.', '', {
        excludePatterns,
        stats: { dirs: 0, files: 0 }
      });

      log(`\n${stats.dirs} directories, ${stats.files} files\n`, 'cyan');
      break;
    }



    case 'release': {
      const commandRelease = require('./src/commands/release');
      const config = loadConfig();
      await commandRelease(config);
      break;
    }

    case 'dependabot': {
      const commandDependabotResolver = require('./src/commands/dependabot-resolver');
      const config = loadConfig();
      await commandDependabotResolver(config, args.slice(1));
      break;
    }

    case 'repo': {
      const commandRepo = require('./src/commands/repo');
      const config = loadConfig();
      await commandRepo(config, args.slice(1));
      break;
    }

    case 'gitignore': {
      const commandGitignore = require('./src/commands/gitignore');
      const config = loadConfig();
      await commandGitignore(config, args.slice(1));
      break;
    }



    case 'template':
      commandTemplate(args[1]);
      break;

    case 'help':
    case undefined:
      showHelp();
      break;

    default:
      log(`✗ Unknown command: ${command}`, 'red');
      showHelp();
  }
}

main().catch(err => {
  log(`✗ Fatal error: ${err.message}`, 'red');
  process.exit(1);
});