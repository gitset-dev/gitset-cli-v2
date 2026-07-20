'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { log, askQuestion, selectOption } = require('../utils/ui');
const genLocal = require('../../lib/generate-local');
const km = require('../../lib/knowledge');
const cliConfig = require('../../lib/config');

const CONFIG_FILENAME = '.gitset-knowledge.json';
const CLI_VERBS = [
  'commit', 'pr', 'issue', 'readme', 'gitignore', 'release', 'config', 'repo',
  'tree', 'status', 'init', 'template', 'license', 'labelspack', 'dependabot',
  'feedback', 'auth', 'knowledge', 'help', 'version',
];

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function loadConfig(rootDir) {
  const defaults = { include: [], exclude: [], budgets: {} };
  try {
    const raw = fs.readFileSync(path.join(rootDir, CONFIG_FILENAME), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      include: Array.isArray(parsed.include) ? parsed.include.map(String) : [],
      exclude: Array.isArray(parsed.exclude) ? parsed.exclude.map(String) : [],
      budgets: parsed.budgets && typeof parsed.budgets === 'object' ? parsed.budgets : {},
    };
  } catch {
    return defaults;
  }
}

function repoLabel(rootDir) {
  const remote = git(['config', '--get', 'remote.origin.url']);
  const m = remote && remote.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (m) return `${m[1]}/${m[2]}`;
  return path.basename(rootDir);
}

function repoTag() {
  const described = git(['describe', '--tags', '--always']);
  return described || null;
}

function printScanReport(run) {
  const { files, map, batches, estimate, redactionReport } = run;
  log(`\nDiscovered ${files.length} files (${run.viaGit ? 'git ls-files' : 'filesystem walk'})`, 'reset');

  const byKind = {};
  for (const f of files) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  log(`  ${Object.entries(byKind).sort().map(([k, n]) => `${k}: ${n}`).join('  ·  ')}`, 'dim');

  if (map.manifest) {
    log(`\nProject: ${map.manifest.name || '(unnamed)'}${map.manifest.version ? ` v${map.manifest.version}` : ''}`, 'cyan');
  }
  if (map.entryPoints.length) log(`Entry points: ${map.entryPoints.join(', ')}`, 'dim');

  log('\nModules to summarize:', 'reset');
  const batchesByModule = new Map();
  for (const b of run.batches) {
    if (!batchesByModule.has(b.module)) batchesByModule.set(b.module, { files: 0, chars: 0, parts: 0 });
    const acc = batchesByModule.get(b.module);
    acc.files += b.files.length;
    acc.chars += b.chars;
    acc.parts += 1;
  }
  for (const [name, acc] of [...batchesByModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    log(`  ${name} — ${acc.files} files, ~${Math.ceil(acc.chars / 4).toLocaleString()} tokens${acc.parts > 1 ? ` (${acc.parts} calls)` : ''}`, 'cyan');
  }

  const docFiles = files.filter((f) => f.kind === 'doc').length;
  const testFiles = files.filter((f) => f.kind === 'test').length;
  log(`\nExcluded from AI input by design: ${docFiles} prose docs, ${testFiles} test files (listed structurally only).`, 'dim');

  if (redactionReport.totalFindings > 0) {
    log(`\nSecret scan: ${redactionReport.totalFindings} value(s) redacted before any AI call`, 'yellow');
    for (const [rule, count] of Object.entries(redactionReport.findingsByRule)) {
      log(`  ${rule}: ${count}`, 'yellow');
    }
  } else {
    log('\nSecret scan: clean (nothing redacted).', 'green');
  }
  if (redactionReport.droppedFiles.length) {
    log(`  Dropped entirely (too many hits): ${redactionReport.droppedFiles.join(', ')}`, 'yellow');
  }

  log('\nEstimated cost of a generate run:', 'reset');
  log(`  AI calls: ${estimate.totalCalls} (${estimate.summarizeCalls} summarize + ${estimate.writeCalls} write)`, 'cyan');
  log(`  Input: ~${estimate.estInputTokens.toLocaleString()} tokens  ·  Output cap: ~${estimate.estMaxOutputTokens.toLocaleString()} tokens`, 'cyan');
  log('  index.md and module-map.md are rendered locally at zero cost.', 'dim');
}

function trackUsage(usage, result) {
  if (!usage || !result || !result.usage) return;
  usage.calls += 1;
  usage.inputTokens += result.usage.inputTokens || 0;
  usage.outputTokens += result.usage.outputTokens || 0;
}

function reportUsage(usage, providerUsed, modelUsed) {
  if (!usage || !usage.calls) return;
  log(`\nActual usage: ${usage.calls} AI calls · ${usage.inputTokens.toLocaleString()} input + ${usage.outputTokens.toLocaleString()} output tokens${providerUsed ? ` (${providerUsed}${modelUsed ? ` / ${modelUsed}` : ''})` : ''}`, 'cyan');
}

async function confirmOrAbort(question, argv) {
  if (argv.includes('--yes') || argv.includes('-y')) return true;
  if (!process.stdin.isTTY) {
    log('Non-interactive session: pass --yes to confirm the estimated cost.', 'red');
    return false;
  }
  const answer = (await askQuestion(`${question} [y/N] `)).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function appendModuleEntries(moduleSummaries, moduleName, entries) {
  const prev = moduleSummaries[moduleName];
  const prevArray = Array.isArray(prev) ? prev : [];
  moduleSummaries[moduleName] = [...prevArray, ...entries];
}

async function summarizeBatches({ batches, repo, argv, cachedSummaries = {}, usage }) {
  const moduleSummaries = { ...cachedSummaries };
  let providerUsed = null;
  let modelUsed = null;
  let done = 0;
  for (const batch of batches) {
    done += 1;
    log(`  [${done}/${batches.length}] Summarizing ${batch.module}${batch.part > 1 ? ` (part ${batch.part})` : ''}…`, 'dim');
    const summarizeBatch = (temperature) => genLocal.generate({
      tool: 'knowledgeSummarize',
      ctx: {
        repo,
        module: batch.module,
        files: km.buildSummarizeFilesBlock(batch.files),
      },
      provider: flag(argv, '--provider'),
      model: flag(argv, '--model'),
      maxTokens: km.DEFAULTS.summarizeMaxTokens,
      temperature,
      interactive: true,
    });

    let result = await summarizeBatch(0.2);
    trackUsage(usage, result);
    providerUsed = result.provider;
    modelUsed = result.model;
    let entries = km.parseSummarizeResponse(result.raw);

    if (!entries) {
      log(`    Structured parse failed for ${batch.module}${batch.part > 1 ? ` (part ${batch.part})` : ''}; retrying once…`, 'yellow');
      result = await summarizeBatch(0.5);
      trackUsage(usage, result);
      providerUsed = result.provider;
      modelUsed = result.model;
      entries = km.parseSummarizeResponse(result.raw);
    }

    if (entries) {
      appendModuleEntries(moduleSummaries, batch.module, entries);
    } else {
      log(`    Still unparseable after retry; recording ${batch.files.length} file(s) as summary-unavailable (no data lost for the rest of the module).`, 'yellow');
      const placeholders = batch.files.map((f) => ({
        path: f.path,
        purpose: '(AI summary unavailable — the model\'s response for this batch could not be parsed after a retry)',
        exports: [],
        dependencies: [],
        notes: '',
      }));
      appendModuleEntries(moduleSummaries, batch.module, placeholders);
    }
  }
  return { moduleSummaries, providerUsed, modelUsed };
}

async function writeDocs({ run, moduleSummaries, repo, argv, usage }) {
  const digest = km.buildStructuralDigest(run.map, run.files);
  const summariesText = km.summariesToText(moduleSummaries);
  const docs = [];
  let done = 0;
  for (const spec of km.DOC_SPECS) {
    done += 1;
    log(`  [${done}/${km.DOC_SPECS.length}] Writing ${spec.filename}…`, 'dim');
    const generateDoc = (temperature) => genLocal.generate({
      tool: 'knowledgeWrite',
      ctx: {
        repo,
        doc: `${spec.title} (${spec.filename})`,
        sections: spec.sections.join(', '),
        guidance: spec.guidance || '',
        digest,
        summaries: summariesText,
      },
      provider: flag(argv, '--provider'),
      model: flag(argv, '--model'),
      maxTokens: km.DEFAULTS.writeMaxTokens,
      temperature,
      interactive: true,
    });

    const first = await generateDoc(0.3);
    trackUsage(usage, first);
    let text = first.text.trim();
    let missing = km.missingSections(text, spec.sections);

    if (missing.length > 0) {
      log(`    Incomplete (missing: ${missing.join(', ')}; finish: ${first.finishReason || 'unknown'}); retrying once…`, 'yellow');
      const second = await generateDoc(0.5);
      trackUsage(usage, second);
      const secondText = second.text.trim();
      const secondMissing = km.missingSections(secondText, spec.sections);
      if (secondMissing.length < missing.length || (secondMissing.length === missing.length && secondText.length > text.length)) {
        text = secondText;
        missing = secondMissing;
      }
      if (missing.length > 0) {
        log(`    Still missing ${missing.join(', ')} after retry (finish: ${second.finishReason || 'unknown'}) — validation will flag it.`, 'yellow');
      }
    }

    docs.push({ filename: spec.filename, sections: spec.sections, content: `${text}\n` });
  }

  docs.push({
    filename: 'module-map.md',
    content: km.renderModuleMapDoc({ map: run.map, moduleSummaries }),
  });

  return docs;
}

function validateAndReport({ docs, run }) {
  const repoFiles = run.files.map((f) => f.path);

  const repairs = km.repairInternalLinks(docs, { docDir: km.OUTPUT_DIR, repoFiles });
  for (const repair of repairs) {
    log(`  Auto-repaired link in ${repair.doc}: ${repair.from} -> ${repair.to}`, 'dim');
  }

  const issues = km.validateDocs({
    docs,
    docDir: km.OUTPUT_DIR,
    repoFiles,
    packageScripts: (run.map.manifest && run.map.manifest.scripts) || {},
    cliVerbs: [...new Set([...CLI_VERBS, ...(run.map.registeredCommands || [])])],
  });
  if (issues.length) {
    log(`\nValidation flagged ${issues.length} issue(s):`, 'yellow');
    for (const issue of issues.slice(0, 20)) {
      log(`  ${issue.doc}: ${issue.type} — ${issue.detail}`, 'yellow');
    }
    if (issues.length > 20) log(`  …and ${issues.length - 20} more`, 'yellow');
  } else {
    log('\nValidation: all internal references verified.', 'green');
  }
  return issues;
}

async function persistOutput({ rootDir, docs, run, moduleSummaries, issues, providerUsed, modelUsed, argv }) {
  const outDir = path.join(rootDir, km.OUTPUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const indexContent = km.renderIndexDoc({
    map: run.map,
    files: run.files,
    tag: repoTag(),
    validationSummary: issues.length
      ? `${issues.length} unresolved reference(s) flagged by the local validator`
      : 'all internal references verified locally',
  });
  fs.writeFileSync(path.join(outDir, 'index.md'), indexContent);

  for (const doc of docs) {
    fs.writeFileSync(path.join(outDir, doc.filename), doc.content);
  }

  const filesWithHashes = run.files.filter((f) => f.hash);
  const state = km.buildState({
    files: filesWithHashes,
    moduleSummaries,
    provider: providerUsed,
    model: modelUsed,
    tag: repoTag(),
    commit: git(['rev-parse', 'HEAD']),
  });
  fs.writeFileSync(path.join(outDir, km.STATE_FILENAME), `${JSON.stringify(state, null, 2)}\n`);

  const agentsPath = path.join(rootDir, 'AGENTS.md');
  let existing = '';
  try {
    existing = fs.readFileSync(agentsPath, 'utf8');
  } catch {  }

  if (existing && !existing.includes(km.AGENTS_START)) {
    const ok = argv.includes('--yes') || argv.includes('-y') || (
      process.stdin.isTTY
      && (await askQuestion('AGENTS.md exists and was not written by Gitset. Append the knowledge-base pointer to it? [y/N] ')).toLowerCase().startsWith('y')
    );
    if (!ok) {
      log('Left AGENTS.md untouched. Add the pointer manually if you want agents to find the knowledge base.', 'yellow');
      return;
    }
  }
  const { content, action } = km.applyAgentsPointer(existing);
  fs.writeFileSync(agentsPath, content);
  log(`AGENTS.md ${action}.`, 'green');
}

async function runInit(rootDir) {
  const target = path.join(rootDir, CONFIG_FILENAME);
  if (fs.existsSync(target)) {
    log(`${CONFIG_FILENAME} already exists. Edit it directly to adjust scanning.`, 'yellow');
    return 0;
  }
  const scaffold = {
    include: [],
    exclude: [],
    budgets: {},
  };
  fs.writeFileSync(target, `${JSON.stringify(scaffold, null, 2)}\n`);
  log(`Created ${CONFIG_FILENAME}.`, 'green');
  log('  include: glob allowlist (empty = everything not excluded)', 'dim');
  log('  exclude: glob denylist (e.g. "generated/**")', 'dim');
  log('  budgets: advanced per-run limits (maxFileChars, maxBatchChars)', 'dim');
  log('\nNext: gitset knowledge scan', 'cyan');
  return 0;
}

async function runScan(rootDir) {
  const config = loadConfig(rootDir);
  log('Scanning repository (local only, zero AI calls)…', 'cyan');
  const run = km.prepareRun(rootDir, config);
  if (!run.batches.length) {
    log('No summarizable source files found.', 'yellow');
    return 1;
  }
  printScanReport(run);
  log('\nNext: gitset knowledge generate', 'cyan');
  return 0;
}

async function runGenerate(rootDir, argv) {
  const config = loadConfig(rootDir);
  const repo = repoLabel(rootDir);

  log('Stage 1/5 · Discover + Map (local, zero AI calls)…', 'cyan');
  const run = km.prepareRun(rootDir, config);
  if (!run.batches.length) {
    log('No summarizable source files found.', 'yellow');
    return 1;
  }
  printScanReport(run);

  const outDir = path.join(rootDir, km.OUTPUT_DIR);
  if (fs.existsSync(path.join(outDir, 'index.md'))) {
    log(`\nAn existing knowledge base was found in ${km.OUTPUT_DIR}/ and will be regenerated.`, 'yellow');
  }

  if (!(await confirmOrAbort('\nProceed with the AI calls listed above?', argv))) {
    log('Aborted. Nothing was sent to any AI provider.', 'yellow');
    return 0;
  }

  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    log('\nStage 2/5 · Summarize…', 'cyan');
    const { moduleSummaries, providerUsed, modelUsed } = await summarizeBatches({ batches: run.batches, repo, argv, usage });

    log('Stage 3/5 · Write…', 'cyan');
    const docs = await writeDocs({ run, moduleSummaries, repo, argv, usage });

    log('Stage 4/5 · Validate (local)…', 'cyan');
    const issues = validateAndReport({ docs, run });

    log('Stage 5/5 · Persist…', 'cyan');
    await persistOutput({ rootDir, docs, run, moduleSummaries, issues, providerUsed, modelUsed, argv });

    log(`\nKnowledge base written to ${km.OUTPUT_DIR}/`, 'green');
    reportUsage(usage, providerUsed, modelUsed);
    log('\nReview the output, then commit it like any other change.', 'dim');
    log('Keep it fresh with: gitset knowledge update  ·  or automate it in CI: gitset knowledge automate', 'cyan');
    return 0;
  } catch (err) {
    if (err instanceof genLocal.AIError) {
      log(`AI provider error (${err.code}): ${err.message}`, 'red');
      return 2;
    }
    log(err.message, 'red');
    return /gitset config/.test(err.message || '') ? 1 : 2;
  }
}

async function runUpdate(rootDir, argv) {
  const config = loadConfig(rootDir);
  const repo = repoLabel(rootDir);
  const statePath = path.join(rootDir, km.OUTPUT_DIR, km.STATE_FILENAME);

  let state = null;
  try {
    state = km.parseState(fs.readFileSync(statePath, 'utf8'));
  } catch {  }
  if (!state) {
    log(`No previous state found at ${km.OUTPUT_DIR}/${km.STATE_FILENAME}. Run: gitset knowledge generate`, 'red');
    return 1;
  }

  log('Diffing repository against the last run (local, zero AI calls)…', 'cyan');
  const run = km.prepareRun(rootDir, config);

  let diff;
  const sinceRef = flag(argv, '--since');
  if (sinceRef) {
    const out = git(['diff', '--name-only', `${sinceRef}...HEAD`]) || git(['diff', '--name-only', sinceRef]);
    if (out === null) {
      log(`Could not resolve git range for --since ${sinceRef}.`, 'red');
      return 1;
    }
    const changedSet = new Set(out.split('\n').filter(Boolean));
    diff = {
      changed: run.files.filter((f) => f.hash && changedSet.has(f.path)).map((f) => f.path).sort(),
      added: [],
      removed: [],
    };
  } else {
    diff = km.diffAgainstState(state, run.files.filter((f) => f.hash));
  }

  const affected = km.affectedModules(diff, km.moduleKeyFor, run.importedBy || run.map.importedBy);
  const knownModules = new Set(run.batches.map((b) => b.module));
  const affectedKnown = affected.filter((m) => knownModules.has(m));

  if (!affectedKnown.length) {
    log('Knowledge base is up to date — no summarizable changes detected.', 'green');
    return 0;
  }

  log(`\nChanged: ${diff.changed.length} file(s), added: ${diff.added.length}, removed: ${diff.removed.length}`, 'reset');
  log(`Modules to re-summarize (changed + direct importers): ${affectedKnown.join(', ')}`, 'cyan');

  const affectedBatches = run.batches.filter((b) => affectedKnown.includes(b.module));
  const partialEstimate = km.estimateRun({ batches: affectedBatches, docCount: km.DOC_SPECS.length }, config.budgets);
  log(`\nEstimated cost: ${partialEstimate.totalCalls} AI calls, ~${partialEstimate.estInputTokens.toLocaleString()} input tokens`, 'cyan');
  log(`Unchanged modules reuse cached summaries from the last run (${Object.keys(state.moduleSummaries || {}).length} cached).`, 'dim');

  if (!(await confirmOrAbort('\nProceed with the incremental update?', argv))) {
    log('Aborted. Nothing was sent to any AI provider.', 'yellow');
    return 0;
  }

  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const cached = {};
    for (const [mod, summary] of Object.entries(state.moduleSummaries || {})) {
      if (!affectedKnown.includes(mod) && knownModules.has(mod)) cached[mod] = summary;
    }

    log('\nRe-summarizing changed modules…', 'cyan');
    const { moduleSummaries, providerUsed, modelUsed } = await summarizeBatches({ batches: affectedBatches, repo, argv, cachedSummaries: cached, usage });

    log('Re-writing documents…', 'cyan');
    const docs = await writeDocs({ run, moduleSummaries, repo, argv, usage });

    const issues = validateAndReport({ docs, run });

    await persistOutput({
      rootDir, docs, run, moduleSummaries, issues,
      providerUsed: providerUsed || state.provider, modelUsed: modelUsed || state.model, argv,
    });

    log(`\nKnowledge base updated in ${km.OUTPUT_DIR}/`, 'green');
    reportUsage(usage, providerUsed || state.provider, modelUsed || state.model);
    return 0;
  } catch (err) {
    if (err instanceof genLocal.AIError) {
      log(`AI provider error (${err.code}): ${err.message}`, 'red');
      return 2;
    }
    log(err.message, 'red');
    return /gitset config/.test(err.message || '') ? 1 : 2;
  }
}

async function runAutomate(rootDir, argv) {
  let cfg;
  try {
    cfg = cliConfig.resolve(flag(argv, '--provider'));
  } catch (e) {
    log(e.message, 'red');
    return 1;
  }
  const envKey = cliConfig.ENV_KEYS[cfg.provider];
  if (!envKey) {
    log(`Provider "${cfg.provider}" can't run in CI (no standard secret env var). Configure anthropic, openai, gemini, openrouter or deepseek.`, 'red');
    return 1;
  }

  const originHead = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  const defaultBranch = originHead ? originHead.replace(/^origin\//, '') : 'main';

  let mode = flag(argv, '--mode');
  if (!mode) {
    if (!process.stdin.isTTY || argv.includes('--yes') || argv.includes('-y')) {
      log('Pass --mode <push|releases|weekly> in non-interactive sessions.', 'red');
      return 1;
    }
    const choice = await selectOption('When should CI refresh the knowledge base?', [
      { label: `On every push to ${defaultBranch} — ${km.MODES.push}`, value: 'push' },
      { label: `On every release — ${km.MODES.releases}`, value: 'releases' },
      { label: `Weekly — ${km.MODES.weekly}`, value: 'weekly' },
      { label: 'Cancel', value: 'cancel' },
    ]);
    if (choice === 'cancel') {
      log('Nothing written.', 'yellow');
      return 0;
    }
    mode = choice;
  }
  if (!km.MODES[mode]) {
    log(`Unknown mode "${mode}". One of: ${Object.keys(km.MODES).join(', ')}`, 'red');
    return 1;
  }

  const yaml = km.buildKnowledgeWorkflow({
    mode,
    provider: cfg.provider,
    envKey,
    model: cfg.model || null,
    defaultBranch,
  });

  const target = path.join(rootDir, km.WORKFLOW_PATH);
  log(`\nThis will create ${km.WORKFLOW_PATH}:`, 'cyan');
  log(`\n${yaml.split('\n').map((l) => `  ${l}`).join('\n')}`, 'dim');
  if (fs.existsSync(target)) {
    log(`\n${km.WORKFLOW_PATH} already exists and will be overwritten.`, 'yellow');
  }
  log('\nSecurity note: CI runs need your AI key as ONE encrypted repository secret. GitHub stores it encrypted; it is only ever sent to your AI provider — never to Gitset.', 'dim');

  if (!(await confirmOrAbort('\nWrite this workflow file?', argv))) {
    log('Nothing written.', 'yellow');
    return 0;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, yaml);
  log(`\nWrote ${km.WORKFLOW_PATH}.`, 'green');

  const repo = repoLabel(rootDir);
  log('\nNext steps:', 'cyan');
  log(`  1. Add the repository secret ${envKey} with your ${cfg.provider} API key:`, 'reset');
  if (repo.includes('/')) {
    log(`     https://github.com/${repo}/settings/secrets/actions/new`, 'dim');
  } else {
    log('     GitHub repo > Settings > Secrets and variables > Actions', 'dim');
  }
  log('  2. Enable "Allow GitHub Actions to create and approve pull requests" (required for the update PR):', 'reset');
  if (repo.includes('/')) {
    log(`     https://github.com/${repo}/settings/actions`, 'dim');
  } else {
    log('     GitHub repo > Settings > Actions > General > Workflow permissions', 'dim');
  }
  log('     Without this, the update still runs and commits safely — only opening the review PR fails, and the workflow run will show that failure clearly rather than hide it.', 'dim');
  log('  3. Make sure the knowledge base itself is committed (gitset knowledge generate, then commit docs/gitset-knowledge/ and AGENTS.md).', 'reset');
  log('  4. Commit and push the workflow file.', 'reset');
  log('\nWhen mapped source changes land, CI opens a PR on branch gitset/knowledge-update — you review it like any docs change. Runs with no mapped changes make zero AI calls.', 'dim');
  return 0;
}

async function runKnowledgeCommand(argv = []) {
  const verb = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;
  const rest = verb ? argv.slice(1) : argv;
  const rootDir = process.cwd();

  if (!git(['rev-parse', '--show-toplevel']) && verb !== 'scan' && verb !== null) {
    log('Tip: run from a git repository root for .gitignore-aware scanning.', 'dim');
  }

  switch (verb) {
    case 'init':
      return runInit(rootDir);
    case 'scan':
      return runScan(rootDir);
    case 'generate':
      return runGenerate(rootDir, rest);
    case 'update':
      return runUpdate(rootDir, rest);
    case 'automate':
      return runAutomate(rootDir, rest);
    default:
      log('Usage: gitset knowledge <init|scan|generate|update|automate> [flags]', 'reset');
      log('  init       scaffold .gitset-knowledge.json (optional scanning config)', 'dim');
      log('  scan       structural pass — zero AI calls, prints the run plan + cost estimate', 'dim');
      log('  generate   build docs/gitset-knowledge/ from source code (asks before spending)', 'dim');
      log('  update     incremental refresh: only changed modules are re-summarized', 'dim');
      log('  automate   write a CI workflow that keeps it fresh (always asks first)', 'dim');
      log('  flags      --provider <p> --model <m> --yes --since <ref> (update) --mode <push|releases|weekly> (automate)', 'dim');
      return verb ? 1 : 0;
  }
}

module.exports = { runKnowledgeCommand };
