'use strict';

const path = require('path');

const JS_IMPORT_RES = [
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm,
];

const PY_IMPORT_RES = [
  /^\s*from\s+([\w.]+)\s+import\b/gm,
  /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm,
];

const JS_EXTS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const CONTAINER_DIRS = new Set(['src', 'lib', 'app', 'packages', 'pkg', 'internal', 'cmd', 'api', 'server', 'client']);

function extractImportSpecs(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  const specs = [];
  if (JS_EXTS.includes(ext) || ['.astro', '.vue', '.svelte'].includes(ext)) {
    for (const re of JS_IMPORT_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) specs.push(m[1]);
    }
  } else if (ext === '.py') {
    for (const re of PY_IMPORT_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        for (const part of m[1].split(',')) specs.push(part.trim());
      }
    }
  }
  return specs;
}

function buildFileIndex(files) {
  const index = new Set(files.map((f) => f.path));
  return index;
}

function resolveJsImport(fromFile, spec, fileIndex) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const baseDir = path.posix.dirname(fromFile);
  const joined = path.posix.normalize(path.posix.join(baseDir, spec));
  const candidates = [joined];
  for (const ext of JS_EXTS) candidates.push(joined + ext);
  for (const ext of JS_EXTS) candidates.push(`${joined}/index${ext}`);
  for (const candidate of candidates) {
    if (fileIndex.has(candidate)) return candidate;
  }
  return null;
}

function resolvePyImport(spec, fileIndex) {
  const rel = spec.replace(/\./g, '/');
  const candidates = [`${rel}.py`, `${rel}/__init__.py`, `src/${rel}.py`, `src/${rel}/__init__.py`];
  for (const candidate of candidates) {
    if (fileIndex.has(candidate)) return candidate;
  }
  return null;
}

function moduleKeyFor(filePath) {
  const segments = filePath.split('/');
  if (segments.length === 1) return '(root)';
  if (CONTAINER_DIRS.has(segments[0]) && segments.length > 2) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

function parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    return {
      name: pkg.name || null,
      version: pkg.version || null,
      description: pkg.description || null,
      bin: pkg.bin || null,
      main: pkg.main || null,
      type: pkg.type || null,
      scripts: pkg.scripts || {},
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
      engines: pkg.engines || null,
      packageManager: pkg.packageManager || null,
    };
  } catch {
    return null;
  }
}

const COMMAND_REGISTRATION_RES = [
  /\bcase\s+'([\w:-]+)'/g,
  /\bcase\s+"([\w:-]+)"/g,
  /\.command\(\s*['"]([\w:-]+)/g,
  /add_parser\(\s*['"]([\w-]+)/g,
];

function extractRegisteredCommands(content) {
  const names = new Set();
  for (const re of COMMAND_REGISTRATION_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      if (!m[1].startsWith('-')) names.add(m[1]);
    }
  }
  return [...names].sort();
}

function detectEntryPoints(files, manifest) {
  const fileIndex = new Set(files.map((f) => f.path));
  const entries = new Set();
  if (manifest) {
    if (typeof manifest.main === 'string' && fileIndex.has(manifest.main.replace(/^\.\//, ''))) {
      entries.add(manifest.main.replace(/^\.\//, ''));
    }
    if (manifest.bin) {
      const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin);
      for (const bin of bins) {
        const norm = String(bin).replace(/^\.\//, '');
        if (fileIndex.has(norm)) entries.add(norm);
      }
    }
  }
  for (const candidate of ['index.js', 'index.ts', 'src/index.js', 'src/index.ts', 'server.js', 'main.py', 'app.py', 'main.go', 'src/main.rs']) {
    if (fileIndex.has(candidate)) entries.add(candidate);
  }
  return [...entries].sort();
}

function buildMap(files, readContentFn) {
  const fileIndex = buildFileIndex(files);
  const importsByFile = new Map();
  const importedBy = new Map();
  const externalDeps = new Map();

  const contentEligible = files.filter((f) => f.kind === 'source' || f.kind === 'config' || f.kind === 'manifest');

  for (const file of contentEligible) {
    if (file.kind !== 'source') continue;
    const content = readContentFn(file);
    if (!content) continue;
    const specs = extractImportSpecs(file.path, content);
    const resolved = [];
    for (const spec of specs) {
      const ext = path.extname(file.path).toLowerCase();
      const target = ext === '.py'
        ? resolvePyImport(spec, fileIndex)
        : resolveJsImport(file.path, spec, fileIndex);
      if (target && target !== file.path) {
        resolved.push(target);
        if (!importedBy.has(target)) importedBy.set(target, new Set());
        importedBy.get(target).add(file.path);
      } else if (!spec.startsWith('.') && !spec.startsWith('/')) {
        const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
        externalDeps.set(root, (externalDeps.get(root) || 0) + 1);
      }
    }
    importsByFile.set(file.path, [...new Set(resolved)].sort());
  }

  let manifest = null;
  const manifestFile = files.find((f) => f.path === 'package.json');
  if (manifestFile) {
    const content = readContentFn(manifestFile);
    if (content) manifest = parsePackageJson(content);
  }

  const modules = new Map();
  for (const file of files) {
    if (file.kind === 'asset' || file.kind === 'sensitive') continue;
    const key = moduleKeyFor(file.path);
    if (!modules.has(key)) {
      modules.set(key, { name: key, files: [], sourceCount: 0, testCount: 0, docCount: 0 });
    }
    const mod = modules.get(key);
    mod.files.push(file);
    if (file.kind === 'source') mod.sourceCount += 1;
    if (file.kind === 'test') mod.testCount += 1;
    if (file.kind === 'doc') mod.docCount += 1;
  }

  const centrality = new Map();
  for (const [target, importers] of importedBy) {
    centrality.set(target, importers.size);
  }

  const moduleEdges = new Map();
  for (const [from, targets] of importsByFile) {
    const fromMod = moduleKeyFor(from);
    for (const target of targets) {
      const toMod = moduleKeyFor(target);
      if (fromMod === toMod) continue;
      const edgeKey = `${fromMod} -> ${toMod}`;
      moduleEdges.set(edgeKey, (moduleEdges.get(edgeKey) || 0) + 1);
    }
  }

  const entryPoints = detectEntryPoints(files, manifest);

  const registeredCommands = new Set();
  for (const entry of entryPoints) {
    const file = files.find((f) => f.path === entry);
    if (!file) continue;
    const content = readContentFn(file);
    if (!content) continue;
    for (const name of extractRegisteredCommands(content)) registeredCommands.add(name);
  }

  return {
    manifest,
    entryPoints,
    registeredCommands: [...registeredCommands].sort(),
    modules: [...modules.values()].sort((a, b) => a.name.localeCompare(b.name)),
    importsByFile,
    importedBy,
    centrality,
    moduleEdges: [...moduleEdges.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([edge, count]) => ({ edge, count })),
    externalDeps: [...externalDeps.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
  };
}

module.exports = {
  buildMap,
  extractImportSpecs,
  extractRegisteredCommands,
  resolveJsImport,
  resolvePyImport,
  moduleKeyFor,
  parsePackageJson,
  detectEntryPoints,
};
