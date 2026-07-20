'use strict';

const DEFAULTS = {
  maxFileChars: 6000,
  signatureChars: 3000,
  maxBatchChars: 24000,
  writeInputChars: 40000,
  summarizeMaxTokens: 2048,
  writeMaxTokens: 6144,
};

const DECLARATION_RE = /^[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|def|interface|type|enum|struct|impl|fn|func|module\.exports|exports\.)[^\n]*$/gm;

function estimateTokens(chars) {
  return Math.ceil(chars / 4);
}

function extractSignatures(content, limit) {
  const head = content.slice(0, Math.floor(limit / 3));
  const declarations = [];
  DECLARATION_RE.lastIndex = 0;
  let m;
  while ((m = DECLARATION_RE.exec(content)) !== null) {
    const line = m[0].trim();
    if (line.length > 3) declarations.push(line.slice(0, 200));
    if (declarations.length >= 80) break;
  }
  const sigBlock = declarations.join('\n');
  const combined = `${head}\n\n[declarations extracted from the rest of the file]\n${sigBlock}`;
  return combined.length > limit ? `${combined.slice(0, limit)}\n…(truncated)` : combined;
}

function budgetFileContent(content, opts = {}) {
  const { maxFileChars, signatureChars } = { ...DEFAULTS, ...opts };
  if (content.length <= maxFileChars) {
    return { content, mode: 'full' };
  }
  return { content: extractSignatures(content, signatureChars), mode: 'signatures' };
}

function batchModules(preparedModules, opts = {}) {
  const { maxBatchChars } = { ...DEFAULTS, ...opts };
  const batches = [];
  for (const mod of preparedModules) {
    let current = { module: mod.name, part: 1, files: [], chars: 0 };
    for (const file of mod.files) {
      const fileChars = file.content ? file.content.length : 0;
      if (current.files.length > 0 && current.chars + fileChars > maxBatchChars) {
        batches.push(current);
        current = { module: mod.name, part: current.part + 1, files: [], chars: 0 };
      }
      current.files.push(file);
      current.chars += fileChars;
    }
    if (current.files.length > 0) batches.push(current);
  }
  return batches;
}

function estimateRun({ batches, docCount, systemOverheadChars = 1500 }, opts = {}) {
  const { summarizeMaxTokens, writeMaxTokens, writeInputChars } = { ...DEFAULTS, ...opts };
  const summarizeCalls = batches.length;
  const summarizeInputTokens = batches.reduce(
    (sum, b) => sum + estimateTokens(b.chars + systemOverheadChars),
    0,
  );
  const writeCalls = docCount;
  const writeInputTokens = writeCalls * estimateTokens(writeInputChars + systemOverheadChars);
  return {
    totalCalls: summarizeCalls + writeCalls,
    summarizeCalls,
    writeCalls,
    estInputTokens: summarizeInputTokens + writeInputTokens,
    estMaxOutputTokens: summarizeCalls * summarizeMaxTokens + writeCalls * writeMaxTokens,
  };
}

module.exports = {
  DEFAULTS,
  budgetFileContent,
  extractSignatures,
  batchModules,
  estimateRun,
  estimateTokens,
};
