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
    rl.question('Ingresa tu GitSet Key: ', async (key) => {
      rl.close();
      
      if (!key.trim()) {
        log('✗ Key inválida', 'red');
        resolve(null);
        return;
      }

      // Validar contra el backend
      log('\n→ Validando con el servidor...', 'cyan');
      
      try {
        const response = await fetch(`${BACKEND_URL}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gitset_key: key.trim() })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
          // Guardar key y datos del usuario
          saveConfig({
            gitset_key: key.trim(),
            user_email: data.user.user_email,
            user_plan: data.user.user_plan,
            github_token: data.user.github_oauth_token || null,
            authenticated_at: new Date().toISOString()
          });

          log('\n✓ Autenticación exitosa\n', 'green');
          log(`📧 Email: ${data.user.user_email}`, 'cyan');
          log(`📦 Plan: ${data.user.user_plan}`, 'cyan');
          if (data.user.github_oauth_token) {
            log(`🔑 GitHub token: ${data.user.github_oauth_token.substring(0, 8)}...`, 'cyan');
          }
          log('');
          
          resolve(key.trim());
        } else {
          log('\n✗ GitSet Key inválida o no encontrada', 'red');
          log('  Verifica que la key exista en la base de datos', 'yellow');
          resolve(null);
        }
      } catch (error) {
        log('\n✗ Error de conexión con el servidor', 'red');
        log(`  ${error.message}`, 'yellow');
        log('\n⚠️  Guardando key localmente (sin validar)', 'yellow');
        
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
  
  if (authenticated && config) {
    log('\n👤 Usuario:', 'cyan');
    log(`   Email: ${config.user_email || 'No disponible'}`, 'yellow');
    log(`   Plan: ${config.user_plan || 'No disponible'}`, 'yellow');
    if (config.github_token) {
      log(`   GitHub token: ${config.github_token.substring(0, 8)}...`, 'yellow');
    }
    if (config.authenticated_at) {
      log(`   Autenticado: ${new Date(config.authenticated_at).toLocaleString()}`, 'yellow');
    }
  }
  
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

async function commandVerify() {
  const gitsetKey = getGitsetKey();
  
  if (!gitsetKey) {
    log('✗ No estás autenticado. Usa: gitset auth', 'red');
    return;
  }

  log('\n🔍 Verificando conexión con GitSet...\n', 'cyan');
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
      log('✓ Conexión exitosa', 'green');
      log(`✓ Usuario verificado`, 'green');
      if (data.quota_info) {
        log(`\n📊 Información de tu cuenta:`, 'cyan');
        log(`   Plan: ${data.quota_info.plan}`, 'yellow');
        log(`   Mensajes usados: ${data.quota_info.used}`, 'yellow');
        log(`   Mensajes restantes: ${data.quota_info.remaining}`, 'yellow');
      }
    } else if (response.status === 401) {
      log('✗ GitSet Key inválida', 'red');
      log('  La key no existe en la base de datos', 'yellow');
    } else if (response.status === 500) {
      log('✗ Error del servidor', 'red');
      log(`  Mensaje: ${data.message || 'Error desconocido'}`, 'yellow');
      if (data.details) {
        log(`  Detalles: ${data.details}`, 'yellow');
      }
    } else {
      log(`✗ Error ${response.status}`, 'red');
      log(`  ${data.error || data.message || 'Error desconocido'}`, 'yellow');
    }
  } catch (error) {
    log('✗ Error de conexión', 'red');
    log(`  ${error.message}`, 'yellow');
  }

  log('');
}

function showHelp() {
  log('\n🚀 GitSet CLI v2.0', 'blue');
  log('\nComandos disponibles:\n', 'cyan');
  log('  gitset auth              Autenticarse con GitSet Key', 'green');
  log('  gitset verify            Verificar conexión con servidor', 'green');
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
    
    case 'verify':
      await commandVerify();
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