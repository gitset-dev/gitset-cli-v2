'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h',
  '.cpp', '.hpp', '.cc', '.cs', '.php', '.scala', '.ex', '.exs',
  '.sh', '.bash', '.zsh', '.astro', '.vue', '.svelte',
]);

const MANIFEST_NAMES = new Set([
  'package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'gemfile',
  'requirements.txt', 'setup.py', 'setup.cfg', 'composer.json',
  'pom.xml', 'build.gradle', 'pnpm-workspace.yaml', 'deno.json',
]);

const CONFIG_PATTERNS = [
  /^\.?[\w-]+rc(\.\w+)?$/i,
  /\.config\.(js|cjs|mjs|ts|json)$/i,
  /^tsconfig(\..+)?\.json$/i,
  /^dockerfile$/i,
  /^docker-compose(\..+)?\.ya?ml$/i,
  /^makefile$/i,
  /^cloudbuild\.ya?ml$/i,
  /^\.gitattributes$/i,
  /^\.editorconfig$/i,
  /^\.npmrc$/i,
];

const DOC_EXTS = new Set(['.md', '.mdx', '.rst', '.txt', '.adoc']);
const DOC_NAMES = new Set(['license', 'notice', 'authors', 'codeowners', 'changelog']);

const LOCKFILE_NAMES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'cargo.lock',
  'poetry.lock', 'gemfile.lock', 'composer.lock', 'bun.lockb',
  'deno.lock', 'uv.lock', 'pipfile.lock', 'go.sum',
]);

const ASSET_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp4', '.webm', '.mp3',
  '.wav', '.pdf', '.zip', '.gz', '.tar', '.br', '.wasm', '.map',
  '.lock', '.lockb', '.min.js', '.min.css',
]);

const TEST_PATTERNS = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /\.(test|spec)\.[jt]sx?$/,
  /_test\.(go|py|rb)$/,
  /(^|\/)conftest\.py$/,
];

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.keystore$/i,
  /(^|\/)credentials?(\.|$)/i,
  /(^|\/)secrets?\.(json|ya?ml|toml|txt)$/i,
  /\.tfstate(\.|$)/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.npmrc$/i,
];

const ALWAYS_IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next',
  '.astro', '.vercel', '.turbo', '.cache', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.idea', '.vscode', '.DS_Store',
]);

const OUTPUT_DIR = 'docs/gitset-knowledge';
const MAX_CONTENT_BYTES = 200 * 1024;

function gitListFiles(rootDir) {
  try {
    const out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walkFiles(rootDir) {
  const results = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(rootDir, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!ALWAYS_IGNORED_DIRS.has(entry.name)) stack.push(childRel);
      } else if (entry.isFile()) {
        results.push(childRel);
      }
    }
  }
  return results;
}

function isSensitivePath(relPath) {
  const p = relPath.toLowerCase();
  return SENSITIVE_FILE_PATTERNS.some((re) => re.test(p));
}

function classify(relPath) {
  const base = path.basename(relPath).toLowerCase();
  const ext = path.extname(base);
  const stem = base.replace(/\.[^.]*$/, '');

  if (isSensitivePath(relPath)) return 'sensitive';
  if (LOCKFILE_NAMES.has(base)) return 'asset';
  if (MANIFEST_NAMES.has(base)) return 'manifest';
  if (base.endsWith('.gemspec')) return 'manifest';
  if (TEST_PATTERNS.some((re) => re.test(relPath))) return 'test';
  if (/^\.github\/workflows\/.+\.ya?ml$/.test(relPath)) return 'config';
  if (CONFIG_PATTERNS.some((re) => re.test(base))) return 'config';
  if (DOC_EXTS.has(ext) || ((DOC_NAMES.has(stem) || DOC_NAMES.has(base)) && !SOURCE_EXTS.has(ext))) return 'doc';
  if (relPath.startsWith('docs/')) return 'doc';
  if (ASSET_EXTS.has(ext) || base.endsWith('.min.js') || base.endsWith('.min.css')) return 'asset';
  if (SOURCE_EXTS.has(ext)) return 'source';
  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') return 'config';
  return 'other';
}

function looksBinary(buffer) {
  const slice = buffer.subarray(0, Math.min(buffer.length, 8192));
  return slice.includes(0);
}

function discover(rootDir, options = {}) {
  const { include = [], exclude = [] } = options;
  let paths = gitListFiles(rootDir);
  const viaGit = paths !== null;
  if (!paths) paths = walkFiles(rootDir);

  const excludeRes = exclude.map(globToRegExp);
  const includeRes = include.map(globToRegExp);

  const files = [];
  for (const relPath of paths.sort()) {
    const norm = relPath.split(path.sep).join('/');
    if (norm.startsWith(`${OUTPUT_DIR}/`)) continue;
    if (norm.split('/').some((seg) => ALWAYS_IGNORED_DIRS.has(seg))) continue;
    if (excludeRes.some((re) => re.test(norm))) continue;
    if (includeRes.length && !includeRes.some((re) => re.test(norm))) continue;

    let size = 0;
    try {
      size = fs.statSync(path.join(rootDir, norm)).size;
    } catch {
      continue;
    }

    files.push({ path: norm, kind: classify(norm), size });
  }

  return { files, viaGit };
}

function readContent(rootDir, file) {
  if (file.kind === 'sensitive' || file.kind === 'asset') return null;
  if (file.size > MAX_CONTENT_BYTES) return null;
  let buffer;
  try {
    buffer = fs.readFileSync(path.join(rootDir, file.path));
  } catch {
    return null;
  }
  if (looksBinary(buffer)) return null;
  return buffer.toString('utf8');
}

function globToRegExp(glob) {
  const pattern = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/|\*\*|\*|\?/g, (tok) => {
      if (tok === '**/') return '(?:.*/)?';
      if (tok === '**') return '.*';
      if (tok === '*') return '[^/]*';
      return '[^/]';
    });
  return new RegExp(`^${pattern}$`);
}

module.exports = {
  discover,
  classify,
  readContent,
  isSensitivePath,
  globToRegExp,
  OUTPUT_DIR,
  MAX_CONTENT_BYTES,
};
