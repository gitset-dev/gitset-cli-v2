'use strict';

const crypto = require('crypto');

const STATE_VERSION = 1;
const STATE_FILENAME = '.state.json';

function hashContent(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

function buildState({ files, moduleSummaries, provider, model, tag, commit }) {
  const fileHashes = {};
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.hash) fileHashes[file.path] = file.hash;
  }
  const summaries = {};
  for (const key of Object.keys(moduleSummaries || {}).sort()) {
    summaries[key] = moduleSummaries[key];
  }
  return {
    version: STATE_VERSION,
    generatedAt: new Date().toISOString(),
    provider: provider || null,
    model: model || null,
    tag: tag || null,
    commit: commit || null,
    fileHashes,
    moduleSummaries: summaries,
  };
}

function parseState(raw) {
  try {
    const state = JSON.parse(raw);
    if (!state || state.version !== STATE_VERSION || typeof state.fileHashes !== 'object') return null;
    return state;
  } catch {
    return null;
  }
}

function diffAgainstState(state, currentFiles) {
  const previous = state && state.fileHashes ? state.fileHashes : {};
  const changed = [];
  const added = [];
  const seen = new Set();
  for (const file of currentFiles) {
    if (!file.hash) continue;
    seen.add(file.path);
    if (!(file.path in previous)) added.push(file.path);
    else if (previous[file.path] !== file.hash) changed.push(file.path);
  }
  const removed = Object.keys(previous).filter((p) => !seen.has(p));
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

function affectedModules(diff, moduleKeyFor, importedBy) {
  const direct = new Set();
  for (const p of [...diff.changed, ...diff.added, ...diff.removed]) {
    direct.add(moduleKeyFor(p));
  }
  const withImporters = new Set(direct);
  for (const p of [...diff.changed, ...diff.removed]) {
    const importers = importedBy && importedBy.get ? importedBy.get(p) : null;
    if (importers) {
      for (const importer of importers) withImporters.add(moduleKeyFor(importer));
    }
  }
  return [...withImporters].sort();
}

module.exports = {
  STATE_VERSION,
  STATE_FILENAME,
  hashContent,
  buildState,
  parseState,
  diffAgainstState,
  affectedModules,
};
