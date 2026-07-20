// VENDORED from gitset-core-v2/lib/knowledge — do not edit here. Run `pnpm sync:ai`.
'use strict';

const discoverLib = require('./discover');
const secretsLib = require('./secrets');
const mapLib = require('./map');
const budgetLib = require('./budget');
const stateLib = require('./state');
const writeLib = require('./write');
const validateLib = require('./validate');
const ciLib = require('./ci');

const LLM_ELIGIBLE_KINDS = new Set(['source', 'manifest', 'config']);

function prepareRun(rootDir, options = {}) {
  const { include = [], exclude = [], budgets = {} } = options;

  const { files, viaGit } = discoverLib.discover(rootDir, { include, exclude });

  const contentCache = new Map();
  const readCached = (file) => {
    if (contentCache.has(file.path)) return contentCache.get(file.path);
    const content = discoverLib.readContent(rootDir, file);
    contentCache.set(file.path, content);
    return content;
  };

  const map = mapLib.buildMap(files, readCached);

  const redactionReport = { totalFindings: 0, droppedFiles: [], findingsByRule: {} };
  const preparedByModule = new Map();

  for (const file of files) {
    if (!LLM_ELIGIBLE_KINDS.has(file.kind)) continue;
    const raw = readCached(file);
    if (raw === null) continue;

    file.hash = stateLib.hashContent(raw);

    const sanitized = secretsLib.sanitizeForPrompt(raw);
    for (const rule of sanitized.findings) {
      redactionReport.totalFindings += 1;
      redactionReport.findingsByRule[rule] = (redactionReport.findingsByRule[rule] || 0) + 1;
    }
    if (sanitized.dropped) {
      redactionReport.droppedFiles.push(file.path);
      continue;
    }

    const budgeted = budgetLib.budgetFileContent(sanitized.content, budgets);
    const moduleKey = mapLib.moduleKeyFor(file.path);
    if (!preparedByModule.has(moduleKey)) preparedByModule.set(moduleKey, []);
    preparedByModule.get(moduleKey).push({
      path: file.path,
      kind: file.kind,
      mode: budgeted.mode,
      centrality: map.centrality.get(file.path) || 0,
      content: budgeted.content,
    });
  }

  const preparedModules = [...preparedByModule.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, prepared]) => ({
      name,
      files: prepared.sort((a, b) => b.centrality - a.centrality || a.path.localeCompare(b.path)),
    }));

  const batches = budgetLib.batchModules(preparedModules, budgets);
  const estimate = budgetLib.estimateRun(
    { batches, docCount: writeLib.DOC_SPECS.length },
    budgets,
  );

  return { files, map, preparedModules, batches, estimate, redactionReport, viaGit };
}

module.exports = {
  prepareRun,
  LLM_ELIGIBLE_KINDS,
  ...discoverLib,
  ...secretsLib,
  ...mapLib,
  ...budgetLib,
  ...stateLib,
  ...writeLib,
  ...validateLib,
  ...ciLib,
};
