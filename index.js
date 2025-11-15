#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Configuración
const BACKEND_URL = 'https://gitset-core-v2.vercel.app/api/engine';
const CONFIG_DIR = path.join(os.homedir(), '.gitset');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

// Utilidades
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

// Gestión de configuración
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

// Autenticación
async function authenticate() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Ingresa tu GitSet Key: ', (key) => {
      rl.close();
      if (key.trim()) {
        saveConfig({ gitset_key: key.trim() });
        log('✓ Autenticación guardada correctamente', 'green');
        resolve(key.trim());
      } else {
        log('✗ Key inválida', 'red');
        resolve(null);
      }
    });
  });
}

function getGitsetKey() {
  const config = loadConfig();
  return config?.gitset_key || null;
}

// Git utilities
function getGitDiff(staged = true) {
  const cmd = staged ? 'git diff --cached' : 'git diff';
  return execCommand(cmd) || '';
}

function getStagedFiles() {
  const output = execCommand('git diff --cached --name-status');
  if (!output) return [];
  
  return output.split('\n').map(line => {
    const [status, ...filePathParts] = line.split('\t');
    return { status, file: filePathParts.join('\t') };
  });
}

function getUnstagedFiles() {
  const output = execCommand('git diff --name-status');
  if (!output) return [];
  
  return output.split('\n').map(line => {
    const [status, ...filePathParts] = line.split('\t');
    return { status, file: filePathParts.join('\t') };
  });
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

// Analizar cambios y preparar diff
function prepareChangesData(staged = true) {
  const files = staged ? getStagedFiles() : getUnstagedFiles();
  
  if (files.length === 0) {
    return null;
  }

  const changes = files.map(({ status, file }) => {
    let before = '';
    let after = '';

    if (status === 'A') {
      // Archivo nuevo
      after = getCurrentFileContent(file);
    } else if (status === 'D') {
      // Archivo eliminado
      before = getFileContent(file, 'HEAD');
    } else if (status === 'M') {
      // Archivo modificado
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

  const diff = getGitDiff(staged);
  
  return {
    changes,
    diff,
    files_count: files.length
  };
}

// Comunicación con backend
async function generateCommitMessage(changesData, customMode = false) {
  const gitsetKey = getGitsetKey();
  
  if (!gitsetKey) {
    log('✗ No estás autenticado. Usa: gitset auth', 'red');
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
    log('→ Generando commit message...', 'cyan');
    
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      log(`✗ Error: ${data.error || 'Error desconocido'}`, 'red');
      return null;
    }

    return data;
  } catch (error) {
    log(`✗ Error de conexión: ${error.message}`, 'red');
    return null;
  }
}

// Comandos CLI
async function commandAuth() {
  log('=== Autenticación GitSet ===', 'blue');
  await authenticate();
}

function commandLogout() {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
    log('✓ Sesión cerrada correctamente', 'green');
  } else {
    log('No hay sesión activa', 'yellow');
  }
}

async function commandGenerate(options = {}) {
  if (!isGitRepo()) {
    log('✗ No estás en un repositorio Git', 'red');
    return;
  }

  const staged = options.staged !== false;
  const customMode = options.custom || false;

  log(`\n📊 Analizando cambios ${staged ? 'staged' : 'no staged'}...\n`, 'cyan');

  const changesData = prepareChangesData(staged);

  if (!changesData) {
    log('✗ No hay cambios para analizar', 'yellow');
    return;
  }

  log(`→ Archivos detectados: ${changesData.files_count}`, 'blue');

  const result = await generateCommitMessage(changesData, customMode);

  if (result) {
    log('\n✓ Commit message generado:\n', 'green');
    log(`📝 ${result.commit_message}\n`, 'cyan');
    
    if (result.quota_info) {
      log('📈 Cuota de uso:', 'yellow');
      log(`   Plan: ${result.quota_info.plan}`, 'yellow');
      log(`   Consumidos: ${result.quota_info.used}`, 'yellow');
      log(`   Restantes: ${result.quota_info.remaining}`, 'yellow');
      if (result.quota_info.renewable) {
        log(`   Renovable: Sí (mensual)`, 'yellow');
      }
    }
  }
}

function commandStatus() {
  if (!isGitRepo()) {
    log('✗ No estás en un repositorio Git', 'red');
    return;
  }

  const config = loadConfig();
  const authenticated = !!config?.gitset_key;

  log('\n=== GitSet Status ===', 'blue');
  log(`Autenticado: ${authenticated ? '✓ Sí' : '✗ No'}`, authenticated ? 'green' : 'red');
  
  const stagedFiles = getStagedFiles();
  const unstagedFiles = getUnstagedFiles();
  
  log(`\nArchivos staged: ${stagedFiles.length}`, 'cyan');
  stagedFiles.forEach(f => log(`  ${f.status} ${f.file}`, 'green'));
  
  log(`\nArchivos no staged: ${unstagedFiles.length}`, 'cyan');
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

function showHelp() {
  log('\n🚀 GitSet CLI v2.0', 'blue');
  log('\nComandos disponibles:\n', 'cyan');
  log('  gitset auth              Autenticarse con GitSet Key', 'green');
  log('  gitset logout            Cerrar sesión', 'green');
  log('  gitset generate          Generar commit message (staged)', 'green');
  log('  gitset generate --all    Generar commit message (todos los cambios)', 'green');
  log('  gitset generate --custom Generar con análisis de historial', 'green');
  log('  gitset status            Ver estado del repositorio', 'green');
  log('  gitset tree              Mostrar estructura del proyecto', 'green');
  log('  gitset help              Mostrar esta ayuda', 'green');
  log('');
}

// CLI Principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'auth':
      await commandAuth();
      break;
    
    case 'logout':
      commandLogout();
      break;
    
    case 'generate':
    case 'gen':
      const options = {
        staged: !args.includes('--all'),
        custom: args.includes('--custom')
      };
      await commandGenerate(options);
      break;
    
    case 'status':
      commandStatus();
      break;
    
    case 'tree':
      log('\n📂 Estructura del proyecto:\n', 'blue');
      commandTree();
      log('');
      break;
    
    case 'help':
    case undefined:
      showHelp();
      break;
    
    default:
      log(`✗ Comando desconocido: ${command}`, 'red');
      showHelp();
  }
}

main().catch(err => {
  log(`✗ Error fatal: ${err.message}`, 'red');
  process.exit(1);
});