#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/engine';
const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

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
  let cmd;
  if (mode === 'staged') {
    cmd = 'git diff --cached';
  } else if (mode === 'all') {
    const staged = execCommand('git diff --cached') || '';
    const unstaged = execCommand('git diff') || '';
    return staged + '\n' + unstaged;
  } else {
    cmd = 'git diff';
  }
  return execCommand(cmd) || '';
}

function getChangedFiles(mode = 'unstaged') {
  let output;
  
  if (mode === 'staged') {
    output = execCommand('git diff --cached --name-status');
  } else if (mode === 'all') {
    const staged = execCommand('git diff --cached --name-status') || '';
    const unstaged = execCommand('git diff --name-status') || '';
    output = [staged, unstaged].filter(Boolean).join('\n');
  } else {
    output = execCommand('git diff --name-status');
  }
  
  if (!output) return [];
  
  const fileMap = new Map();
  
  output.split('\n').forEach(line => {
    const [status, ...filePathParts] = line.split('\t');
    const file = filePathParts.join('\t');
    if (file) {
      fileMap.set(file, { status, file });
    }
  });
  
  return Array.from(fileMap.values());
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

async function generateCommitMessage(changesData, customMode = false) {
  const gitsetKey = getGitsetKey();
  
  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return null;
  }

  const payload = {
    gitset_key: gitsetKey,
    changes: changesData.changes,
    diff: changesData.diff,
    custom_mode: customMode
  };

  if (customMode) {
    payload.commit_history = getRecentCommits(15);
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

  const customMode = options.custom || false;

  log(`\n📊 Analyzing ${modeLabel} changes...\n`, 'cyan');

  const changesData = prepareChangesData(mode);

  if (!changesData) {
    log('✗ No changes to analyze', 'yellow');
    return;
  }

  log(`→ Files detected: ${changesData.files_count}`, 'blue');

  const result = await generateCommitMessage(changesData, customMode);

  if (result) {
    log('\n✓ Commit message generated:\n', 'green');
    log(`📝 ${result.commit_message}\n`, 'cyan');
    
    if (result.quota_info) {
      log('📈 Usage quota:', 'yellow');
      log(`   Plan: ${result.quota_info.plan}`, 'yellow');
      log(`   Used: ${result.quota_info.used}`, 'yellow');
      log(`   Remaining: ${result.quota_info.remaining}`, 'yellow');
      if (result.quota_info.renewable) {
        log(`   Renewable: Yes (monthly)`, 'yellow');
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

function commandTree(dir = '.', prefix = '', maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return;
  
  const items = fs.readdirSync(dir).filter(item => 
    !item.startsWith('.') && 
    item !== 'node_modules' && 
    item !== 'dist' && 
    item !== 'build'
  );

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const itemPath = path.join(dir, item);
    const stats = fs.statSync(itemPath);
    
    const connector = isLast ? '└── ' : '├── ';
    const icon = stats.isDirectory() ? '📁' : '📄';
    
    console.log(`${prefix}${connector}${icon} ${item}`);
    
    if (stats.isDirectory()) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      commandTree(itemPath, newPrefix, maxDepth, currentDepth + 1);
    }
  });
}

async function commandVerify() {
  const gitsetKey = getGitsetKey();
  
  if (!gitsetKey) {
    log('✗ Not authenticated. Use: gitset auth', 'red');
    return;
  }

  log('\n🔍 Verifying connection with Gitset...\n', 'cyan');
  log(`→ Key: ${gitsetKey.substring(0, 12)}...`, 'blue');

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
        log(`\n📊 Account information:`, 'cyan');
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

function showHelp() {
  log('\n🚀 Gitset CLI v2.0', 'blue');
  log('\nAvailable commands:\n', 'cyan');
  log('  gitset auth               Authenticate with Gitset Key', 'green');
  log('  gitset verify             Verify server connection', 'green');
  log('  gitset logout             Close session', 'green');
  log('  gitset commit             Generate commit message (unstaged changes)', 'green');
  log('  gitset commit --staged    Generate commit message (staged only)', 'green');
  log('  gitset commit --all       Generate commit message (all changes)', 'green');
  log('  gitset commit --custom    Generate with history analysis', 'green');
  log('  gitset status             View repository status', 'green');
  log('  gitset tree               Show project structure', 'green');
  log('  gitset help               Show this help', 'green');
  log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'auth':
      await commandAuth();
      break;
    
    case 'verify':
      await commandVerify();
      break;
    
    case 'logout':
      commandLogout();
      break;
    
    case 'commit':
      const options = {
        staged: args.includes('--staged'),
        all: args.includes('--all'),
        custom: args.includes('--custom')
      };
      await commandCommit(options);
      break;
    
    case 'status':
      commandStatus();
      break;
    
    case 'tree':
      log('\n📂 Project structure:\n', 'blue');
      commandTree();
      log('');
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