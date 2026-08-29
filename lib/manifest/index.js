// VENDORED from gitset-core-v2/lib/manifest — do not edit here. Run `pnpm sync:ai`.
'use strict';

const MANIFESTS = [
  { type: 'npm', files: ['package.json'], label: 'package.json (npm)' },
  { type: 'composer', files: ['composer.json'], label: 'composer.json (Composer/PHP)' },
  { type: 'cargo', files: ['Cargo.toml'], label: 'Cargo.toml (Cargo)' },
  { type: 'python', files: ['pyproject.toml'], label: 'pyproject.toml (Python)' },
  { type: 'nuxt', files: ['nuxt.config.ts', 'nuxt.config.mjs', 'nuxt.config.js'], label: 'nuxt.config (Nuxt)' },
  { type: 'astro', files: ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'], label: 'astro.config (Astro)' },
  { type: 'gemspec', suffix: '.gemspec', label: '*.gemspec (RubyGems)' },
];

function listSupported() {
  return MANIFESTS.map(({ type, label, files, suffix }) => ({
    type, label, files: files || null, suffix: suffix || null,
  }));
}

function detectManifestFiles(fileNames) {
  const names = Array.isArray(fileNames) ? fileNames : [];
  const found = [];
  for (const m of MANIFESTS) {
    if (m.files) {
      const hit = m.files.find((f) => names.includes(f));
      if (hit) found.push({ type: m.type, file: hit });
    } else if (m.suffix) {
      const hit = names.find((f) => f.endsWith(m.suffix));
      if (hit) found.push({ type: m.type, file: hit });
    }
  }
  return found;
}

function normalizeVersion(tagName) {
  if (typeof tagName !== 'string') return null;
  const trimmed = tagName.trim();
  return trimmed.replace(/^v/i, '') || null;
}

function detectIndent(text) {
  const m = text.match(/^[ \t]+(?=")/m);
  return m ? m[0] : '  ';
}

function readJsonVersion(content) {
  const parsed = JSON.parse(content);
  return typeof parsed.version === 'string' ? parsed.version : null;
}

function bumpJsonVersion(content, newVersion) {
  const parsed = JSON.parse(content);
  if (typeof parsed.version !== 'string') return null;
  parsed.version = newVersion;
  const indent = detectIndent(content);
  let out = JSON.stringify(parsed, null, indent);
  if (content.endsWith('\n')) out += '\n';
  return out;
}

function findTomlSection(content, sectionName) {
  const escaped = sectionName.replace(/\./g, '\\.');
  const headerRe = new RegExp(`^\\[${escaped}\\][ \\t]*$`, 'm');
  const m = headerRe.exec(content);
  if (!m) return null;
  const bodyStart = m.index + m[0].length;
  const rest = content.slice(bodyStart);
  const next = rest.match(/^\[[^\]]+\][ \t]*$/m);
  const bodyEnd = next ? bodyStart + next.index : content.length;
  return { bodyStart, bodyEnd };
}

const TOML_VERSION_LINE_RE = /^([ \t]*version[ \t]*=[ \t]*)(["'])([^"']+)\2([ \t]*)$/m;

function readTomlSectionVersion(content, sectionName) {
  const sec = findTomlSection(content, sectionName);
  if (!sec) return null;
  const body = content.slice(sec.bodyStart, sec.bodyEnd);
  const m = TOML_VERSION_LINE_RE.exec(body);
  return m ? m[3] : null;
}

function bumpTomlSectionVersion(content, sectionName, newVersion) {
  const sec = findTomlSection(content, sectionName);
  if (!sec) return null;
  const body = content.slice(sec.bodyStart, sec.bodyEnd);
  if (!TOML_VERSION_LINE_RE.test(body)) return null;
  const newBody = body.replace(TOML_VERSION_LINE_RE, (_full, pre, quote, _old, trail) => `${pre}${quote}${newVersion}${quote}${trail}`);
  return content.slice(0, sec.bodyStart) + newBody + content.slice(sec.bodyEnd);
}

const GEMSPEC_VERSION_LINE_RE = /^([ \t]*[\w.]+\.version[ \t]*=[ \t]*)(["'])([^"']+)\2([ \t]*)$/m;

function readGemspecVersion(content) {
  const m = GEMSPEC_VERSION_LINE_RE.exec(content);
  return m ? m[3] : null;
}

function bumpGemspecVersion(content, newVersion) {
  if (!GEMSPEC_VERSION_LINE_RE.test(content)) return null;
  return content.replace(GEMSPEC_VERSION_LINE_RE, (_full, pre, quote, _old, trail) => `${pre}${quote}${newVersion}${quote}${trail}`);
}

const JS_CONFIG_VERSION_LINE_RE = /(\bversion[ \t]*:[ \t]*)(["'])([^"']+)\2/;

function readJsConfigVersion(content) {
  const m = JS_CONFIG_VERSION_LINE_RE.exec(content);
  return m ? m[3] : null;
}

function bumpJsConfigVersion(content, newVersion) {
  if (!JS_CONFIG_VERSION_LINE_RE.test(content)) return null;
  return content.replace(JS_CONFIG_VERSION_LINE_RE, (_full, pre, quote) => `${pre}${quote}${newVersion}${quote}`);
}

function readVersion(type, content) {
  switch (type) {
    case 'npm':
    case 'composer':
      return readJsonVersion(content);
    case 'cargo':
      return readTomlSectionVersion(content, 'package');
    case 'python':
      return readTomlSectionVersion(content, 'project') || readTomlSectionVersion(content, 'tool.poetry');
    case 'nuxt':
    case 'astro':
      return readJsConfigVersion(content);
    case 'gemspec':
      return readGemspecVersion(content);
    default:
      throw new Error(`Unsupported manifest type: ${type}`);
  }
}

function bumpVersion(type, content, newVersion) {
  switch (type) {
    case 'npm':
    case 'composer':
      return bumpJsonVersion(content, newVersion);
    case 'cargo':
      return bumpTomlSectionVersion(content, 'package', newVersion);
    case 'python':
      return bumpTomlSectionVersion(content, 'project', newVersion) || bumpTomlSectionVersion(content, 'tool.poetry', newVersion);
    case 'nuxt':
    case 'astro':
      return bumpJsConfigVersion(content, newVersion);
    case 'gemspec':
      return bumpGemspecVersion(content, newVersion);
    default:
      throw new Error(`Unsupported manifest type: ${type}`);
  }
}

module.exports = {
  listSupported,
  detectManifestFiles,
  normalizeVersion,
  readVersion,
  bumpVersion,
};
