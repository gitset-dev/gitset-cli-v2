'use strict';

const LINK_RE = /\[[^\]]*\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g;
const FENCE_RE = /```(?:bash|sh|shell|console|zsh)?\n([\s\S]*?)```/g;
const CMD_RE = /^\s*\$?\s*(npm|pnpm|yarn|node|git|gitset|npx)\s+(\S+)(?:\s+(\S+))?/;

function extractInternalLinks(markdown) {
  const links = [];
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(markdown)) !== null) {
    const target = m[1];
    if (/^[a-z]+:\/\//i.test(target)) continue;
    if (target.startsWith('mailto:')) continue;
    links.push(target);
  }
  return links;
}

function extractCitedCommands(markdown) {
  const commands = [];
  FENCE_RE.lastIndex = 0;
  let block;
  while ((block = FENCE_RE.exec(markdown)) !== null) {
    for (const line of block[1].split('\n')) {
      const m = CMD_RE.exec(line);
      if (m) commands.push({ tool: m[1], arg1: m[2] || '', arg2: m[3] || '', line: line.trim() });
    }
  }
  return commands;
}

function normalizeDocLink(docDir, target) {
  const clean = target.replace(/^\.\//, '');
  if (clean.startsWith('../') || clean.startsWith('/')) {
    return clean.replace(/^(\.\.\/)+/, '').replace(/^\//, '');
  }
  return `${docDir}/${clean}`;
}

function linkResolves(target, { docDir, fileSet, docSet, dirSet }) {
  const asDocRelative = normalizeDocLink(docDir, target);
  const asRepoRelative = target.replace(/^\.\//, '');
  return fileSet.has(asDocRelative)
    || docSet.has(asDocRelative)
    || fileSet.has(asRepoRelative)
    || docSet.has(asRepoRelative)
    || (dirSet ? dirSet.has(asDocRelative.replace(/\/$/, '')) || dirSet.has(asRepoRelative.replace(/\/$/, '')) : false);
}

function buildDirSet(repoFiles) {
  const dirs = new Set();
  for (const p of repoFiles) {
    const segments = p.split('/');
    for (let i = 1; i < segments.length; i += 1) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  }
  return dirs;
}

function repairInternalLinks(docs, { docDir, repoFiles }) {
  const fileSet = new Set(repoFiles);
  const docSet = new Set(docs.map((d) => `${docDir}/${d.filename}`));
  const dirSet = buildDirSet(repoFiles);
  const byBasename = new Map();
  for (const p of repoFiles) {
    const base = p.split('/').pop();
    if (!byBasename.has(base)) byBasename.set(base, []);
    byBasename.get(base).push(p);
  }

  const upPrefix = '../'.repeat(docDir.split('/').length);
  const repairs = [];

  for (const doc of docs) {
    doc.content = (doc.content || '').replace(
      /(\]\()([^)#\s]+)((?:#[^)\s]*)?\))/g,
      (full, open, target, close) => {
        if (/^[a-z]+:\/\//i.test(target) || target.startsWith('mailto:')) return full;
        if (linkResolves(target, { docDir, fileSet, docSet, dirSet })) return full;

        const basename = target.split('/').pop();
        const candidates = new Set([basename]);
        const deduped = basename.replace(/^(.+?)\.(?=\1\.)/, '');
        candidates.add(deduped);

        let match = null;
        for (const candidate of candidates) {
          const hits = byBasename.get(candidate) || [];
          if (hits.length === 1) {
            match = hits[0];
            break;
          }
        }
        if (!match) {
          for (const candidate of candidates) {
            const suffixHits = [];
            for (const [base, paths] of byBasename) {
              if (base === candidate || !base.endsWith(candidate)) continue;
              const before = base[base.length - candidate.length - 1];
              if (before === '-' || before === '_' || before === '.') suffixHits.push(...paths);
            }
            if (suffixHits.length === 1) {
              match = suffixHits[0];
              break;
            }
          }
        }
        if (!match) return full;

        const fixed = `${upPrefix}${match}`;
        repairs.push({ doc: doc.filename, from: target, to: fixed });
        return `${open}${fixed}${close}`;
      },
    );
  }

  return repairs;
}

function missingSections(content, sections) {
  const markdown = content || '';
  const missing = [];
  for (const section of sections || []) {
    const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm');
    if (!re.test(markdown)) missing.push(section);
  }
  return missing;
}

function validateDocs({ docs, docDir, repoFiles, packageScripts = {}, cliVerbs = [] }) {
  const fileSet = new Set(repoFiles);
  const docSet = new Set(docs.map((d) => `${docDir}/${d.filename}`));
  const dirSet = buildDirSet(repoFiles);
  const issues = [];

  for (const doc of docs) {
    const markdown = doc.content || '';

    if (Array.isArray(doc.sections)) {
      for (const section of missingSections(markdown, doc.sections)) {
        issues.push({ doc: doc.filename, type: 'missing-section', detail: section });
      }
    }

    for (const target of extractInternalLinks(markdown)) {
      if (!linkResolves(target, { docDir, fileSet, docSet, dirSet })) {
        issues.push({ doc: doc.filename, type: 'dead-link', detail: target });
      }
    }

    for (const cmd of extractCitedCommands(markdown)) {
      if ((cmd.tool === 'npm' || cmd.tool === 'pnpm' || cmd.tool === 'yarn')) {
        const scriptName = cmd.arg1 === 'run' ? cmd.arg2 : cmd.arg1;
        const builtins = new Set(['install', 'ci', 'test', 'start', 'publish', 'pack', 'link', 'init', 'exec', 'dlx', 'add', 'remove', 'i', 'it', 'update', 'audit', 'sync:ai']);
        if (scriptName && !builtins.has(scriptName) && !(scriptName in packageScripts)) {
          if (cmd.arg1 === 'run' || (!builtins.has(cmd.arg1) && cmd.tool === 'pnpm')) {
            issues.push({ doc: doc.filename, type: 'unknown-script', detail: cmd.line });
          }
        }
      }
      if (cmd.tool === 'gitset' && cliVerbs.length && cmd.arg1 && !cmd.arg1.startsWith('-')) {
        if (!cliVerbs.includes(cmd.arg1)) {
          issues.push({ doc: doc.filename, type: 'unknown-cli-command', detail: cmd.line });
        }
      }
    }
  }

  return issues;
}

module.exports = {
  validateDocs,
  missingSections,
  repairInternalLinks,
  extractInternalLinks,
  extractCitedCommands,
};
