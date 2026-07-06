#!/usr/bin/env node
'use strict';

/**
 * Vendoring sync: copies the canonical BYOAI core from gitset-core-v2 into the
 * CLI so both run the SAME provider abstraction + prompt boundary without a
 * pre-launch npm-publish pipeline (see architecture decision: 3 repos, shared
 * core authored in Core, mirrored here).
 *
 * Source of truth: ../gitset-core-v2/lib/{ai,prompts}
 * Run: pnpm sync:ai   (re-run whenever Core's lib/ai or lib/prompts changes)
 *
 * Tests are NOT vendored (the CLI has its own). The private prompt overlay is
 * never present in Core's tree, so OSS-safe defaults are what get copied.
 */
const fs = require('fs');
const path = require('path');

const CORE = path.resolve(__dirname, '..', '..', 'gitset-core-v2', 'lib');
const DEST = path.resolve(__dirname, '..', 'lib');
const MODULES = ['ai', 'prompts'];

const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'private']);

// The CLI repo is public; Core's implementation comments are not part of the
// vendored copy. Uses the TypeScript parser (string/regex safe) from the
// workspace's web repo; falls back to a verbatim copy when unavailable.
let ts = null;
try {
  ts = require(path.resolve(__dirname, '..', '..', 'gitset-web', 'node_modules', 'typescript'));
} catch { /* verbatim copy fallback */ }

const KEEP_RE = /@ts-(ignore|expect-error|nocheck)|eslint-|VENDORED|@license|@preserve/;

function stripComments(text) {
  if (!ts) return text;
  const sf = ts.createSourceFile('f.js', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const found = new Map();
  const add = (rs) => { if (rs) for (const r of rs) found.set(r.pos, r); };
  (function walk(node) {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const c of node.getChildren(sf)) walk(c);
  })(sf);
  const ranges = [...found.values()].sort((a, b) => a.pos - b.pos)
    .filter((r) => !KEEP_RE.test(text.slice(r.pos, r.end)));
  if (!ranges.length) return text;
  let out = '';
  let last = 0;
  for (const r of ranges) { out += text.slice(last, r.pos); last = r.end; }
  out += text.slice(last);
  out = out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) {
      if (entry.name.endsWith('.js')) fs.writeFileSync(d, stripComments(fs.readFileSync(s, 'utf8')));
      else fs.copyFileSync(s, d);
    }
  }
}

function main() {
  if (!fs.existsSync(CORE)) {
    console.error(`✗ Core lib not found at ${CORE}. Run from the gitset-v2 workspace.`);
    process.exit(1);
  }
  for (const mod of MODULES) {
    const src = path.join(CORE, mod);
    const dest = path.join(DEST, mod);
    if (!fs.existsSync(src)) {
      console.error(`✗ Missing source module: ${src}`);
      process.exit(1);
    }
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
    const stamp = `// VENDORED from gitset-core-v2/lib/${mod} — do not edit here. Run \`pnpm sync:ai\`.\n`;
    const idx = path.join(dest, 'index.js');
    if (fs.existsSync(idx)) {
      fs.writeFileSync(idx, stamp + fs.readFileSync(idx, 'utf8'));
    }
    console.log(`✓ vendored lib/${mod}`);
  }
  console.log('✓ sync:ai complete');
}

main();
