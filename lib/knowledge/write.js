'use strict';

const DOC_SPECS = [
  {
    id: 'architecture',
    filename: 'architecture.md',
    title: 'Architecture',
    llm: true,
    sections: [
      'System Overview',
      'Entry Points',
      'Core Components',
      'Data Flow',
      'External Dependencies',
    ],
    guidance: 'Core Components: one bullet per module with a one-line role — no per-file listings and no tables (module-map.md already covers per-file detail). Data Flow: a numbered list of at most 8 steps.',
  },
  {
    id: 'developer-guide',
    filename: 'developer-guide.md',
    title: 'Developer Guide',
    llm: true,
    sections: [
      'Prerequisites',
      'Setup',
      'Project Layout',
      'Testing',
      'Release & Deployment',
    ],
    guidance: 'Project Layout: at most 6 bullet lines describing the top-level directories — never a module table, module-map.md already covers that. Every section must be short and practical; this is an onboarding page, not a reference.',
  },
  {
    id: 'commands-and-workflows',
    filename: 'commands-and-workflows.md',
    title: 'Commands & Workflows',
    llm: true,
    sections: [
      'Package Scripts',
      'CLI Commands',
      'CI Workflows',
      'Common Tasks',
    ],
    guidance: 'CLI Commands: bullets in the form `command` — one-line description, using only registered command names from the digest. Do not cite source file paths in this document.',
  },
];

const AGENTS_START = '<!-- gitset-knowledge:start -->';
const AGENTS_END = '<!-- gitset-knowledge:end -->';

function buildStructuralDigest(map, files) {
  const lines = [];
  if (map.manifest) {
    const m = map.manifest;
    lines.push(`Project: ${m.name || 'unknown'}${m.version ? ` v${m.version}` : ''}`);
    if (m.description) lines.push(`Description: ${m.description}`);
    if (m.bin) lines.push(`Binaries: ${typeof m.bin === 'string' ? m.bin : Object.entries(m.bin).map(([k, v]) => `${k} -> ${v}`).join(', ')}`);
    if (m.engines) lines.push(`Engines: ${JSON.stringify(m.engines)}`);
    if (m.packageManager) lines.push(`Package manager: ${m.packageManager}`);
    const scripts = Object.entries(m.scripts || {});
    if (scripts.length) {
      lines.push('Package scripts:');
      for (const [name, cmd] of scripts) lines.push(`  ${name}: ${cmd}`);
    }
  }
  if (map.entryPoints.length) lines.push(`Entry points: ${map.entryPoints.join(', ')}`);
  if (map.registeredCommands && map.registeredCommands.length) {
    lines.push(`CLI commands registered in the entry point (authoritative names): ${map.registeredCommands.join(', ')}`);
  }

  lines.push('Modules:');
  for (const mod of map.modules) {
    lines.push(`  ${mod.name} — ${mod.sourceCount} source, ${mod.testCount} test, ${mod.docCount} doc files`);
  }

  if (map.moduleEdges.length) {
    lines.push('Module dependencies (imports between modules):');
    for (const { edge, count } of map.moduleEdges) lines.push(`  ${edge} (${count})`);
  }

  if (map.externalDeps.length) {
    const top = map.externalDeps.slice(0, 15).map((d) => `${d.name} (${d.count})`).join(', ');
    lines.push(`External packages imported in code: ${top}`);
  }

  const workflows = files.filter((f) => /^\.github\/workflows\//.test(f.path)).map((f) => f.path);
  if (workflows.length) lines.push(`CI workflow files: ${workflows.join(', ')}`);

  const central = [...map.centrality.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([p, n]) => `${p} (imported by ${n})`);
  if (central.length) lines.push(`Most imported files: ${central.join(', ')}`);

  return lines.join('\n');
}

function buildSummarizeFilesBlock(batchFiles) {
  return batchFiles
    .map((f) => `FILE: ${f.path} [${f.mode}${f.centrality ? `, imported by ${f.centrality}` : ''}]\n${f.content}`)
    .join('\n\n---\n\n');
}

function parseSummarizeResponse(text) {
  let cleaned = String(text || '').trim()
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const entries = parsed
      .filter((e) => e && typeof e.path === 'string')
      .map((e) => ({
        path: e.path,
        purpose: typeof e.purpose === 'string' ? e.purpose : '',
        exports: Array.isArray(e.exports) ? e.exports.map(String).slice(0, 20) : [],
        dependencies: Array.isArray(e.dependencies) ? e.dependencies.map(String).slice(0, 20) : [],
        notes: typeof e.notes === 'string' ? e.notes : '',
      }));
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}

function summariesToText(moduleSummaries) {
  const blocks = [];
  for (const modName of Object.keys(moduleSummaries).sort()) {
    const entries = moduleSummaries[modName];
    blocks.push(`MODULE: ${modName}`);
    if (typeof entries === 'string') {
      blocks.push(entries);
      continue;
    }
    for (const e of entries) {
      const parts = [`- ${e.path}: ${e.purpose}`];
      if (e.exports && e.exports.length) parts.push(`  exports: ${e.exports.join(', ')}`);
      if (e.notes) parts.push(`  notes: ${e.notes}`);
      blocks.push(parts.join('\n'));
    }
  }
  return blocks.join('\n');
}

function renderIndexDoc({ map, files, tag, validationSummary }) {
  const stats = {
    total: files.length,
    source: files.filter((f) => f.kind === 'source').length,
    test: files.filter((f) => f.kind === 'test').length,
    config: files.filter((f) => f.kind === 'config').length,
    doc: files.filter((f) => f.kind === 'doc').length,
  };
  const name = (map.manifest && map.manifest.name) || '(unnamed project)';
  const description = (map.manifest && map.manifest.description) || '';
  const lines = [
    `# ${name} — Knowledge Base`,
    '',
    description,
    '',
    `> Generated by [Gitset](https://gitset.dev) Knowledge Mapper${tag ? ` at ${tag}` : ''}. Derived from source code, manifests and CI configuration — not from existing prose docs.`,
    '',
    '## Contents',
    '',
    '- [Architecture](architecture.md) — system design, entry points, data flow',
    '- [Developer Guide](developer-guide.md) — setup, testing, release',
    '- [Commands & Workflows](commands-and-workflows.md) — scripts, CLI commands, CI',
    '- [Module Map](module-map.md) — per-module summaries and dependency edges',
    '',
    '## Repository Stats',
    '',
    `| Files | Source | Tests | Config | Docs |`,
    `| ---: | ---: | ---: | ---: | ---: |`,
    `| ${stats.total} | ${stats.source} | ${stats.test} | ${stats.config} | ${stats.doc} |`,
    '',
    map.entryPoints.length ? `Entry points: ${map.entryPoints.map((e) => `\`${e}\``).join(', ')}` : '',
    '',
  ];
  if (validationSummary) {
    lines.push(`Validation: ${validationSummary}`, '');
  }
  return `${lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function renderModuleMapDoc({ map, moduleSummaries }) {
  const lines = ['# Module Map', ''];
  lines.push('## Modules', '');
  for (const mod of map.modules) {
    lines.push(`### \`${mod.name}\``, '');
    const summary = moduleSummaries[mod.name];
    if (typeof summary === 'string') {
      lines.push(summary.trim(), '');
    } else if (Array.isArray(summary)) {
      for (const e of summary) {
        lines.push(`- \`${e.path}\` — ${e.purpose || 'no summary'}`);
        if (e.exports && e.exports.length) lines.push(`  - exports: ${e.exports.map((x) => `\`${x}\``).join(', ')}`);
        if (e.notes) lines.push(`  - ${e.notes}`);
      }
      lines.push('');
    } else {
      const shown = mod.files.filter((f) => f.kind !== 'doc').slice(0, 30);
      for (const f of shown) lines.push(`- \`${f.path}\` (${f.kind})`);
      lines.push('');
    }
  }
  if (map.moduleEdges.length) {
    lines.push('## Dependency Edges', '');
    lines.push('| From | To | Imports |', '| :--- | :--- | ---: |');
    for (const { edge, count } of map.moduleEdges) {
      const [from, to] = edge.split(' -> ');
      lines.push(`| \`${from}\` | \`${to}\` | ${count} |`);
    }
    lines.push('');
  }
  if (map.externalDeps.length) {
    lines.push('## External Packages (imported in code)', '');
    for (const dep of map.externalDeps.slice(0, 25)) {
      lines.push(`- \`${dep.name}\` (${dep.count} import${dep.count === 1 ? '' : 's'})`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function buildAgentsBlock() {
  return [
    AGENTS_START,
    '## Repository knowledge base',
    '',
    'Structural context for this repository is maintained by [Gitset](https://gitset.dev) Knowledge Mapper.',
    'Before making changes, read:',
    '',
    '- [docs/gitset-knowledge/index.md](docs/gitset-knowledge/index.md)',
    '- [docs/gitset-knowledge/architecture.md](docs/gitset-knowledge/architecture.md)',
    '- [docs/gitset-knowledge/module-map.md](docs/gitset-knowledge/module-map.md)',
    AGENTS_END,
  ].join('\n');
}

function applyAgentsPointer(existingContent) {
  const block = buildAgentsBlock();
  if (!existingContent || !existingContent.trim()) {
    return { content: `# AGENTS.md\n\n${block}\n`, action: 'created' };
  }
  const markerRe = new RegExp(`${AGENTS_START}[\\s\\S]*?${AGENTS_END}`);
  if (markerRe.test(existingContent)) {
    return { content: existingContent.replace(markerRe, block), action: 'updated' };
  }
  return { content: `${existingContent.replace(/\n*$/, '\n\n')}${block}\n`, action: 'appended' };
}

module.exports = {
  DOC_SPECS,
  AGENTS_START,
  AGENTS_END,
  buildStructuralDigest,
  buildSummarizeFilesBlock,
  parseSummarizeResponse,
  summariesToText,
  renderIndexDoc,
  renderModuleMapDoc,
  buildAgentsBlock,
  applyAgentsPointer,
};
