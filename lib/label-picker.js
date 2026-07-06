'use strict';

/**
 * Shared label-selection UI for `gitset issue` / `gitset pr`'s [l]abels
 * step. Three explicit sources, so it's always clear whether a pick
 * applies something that already exists in the repo, asks the AI (which
 * marks each suggestion new vs. existing), or pulls from your saved
 * label pack (`gitset labelspack`).
 */
const { execFileSync } = require('child_process');
const readline = require('readline');
const { suggestLabels } = require('./labels-ai');
const { getLabels } = require('../src/utils/labels');
const theme = require('../src/utils/theme');

const out = (s = '') => console.log(s);
const errln = (s) => console.error(`${theme.error('✗')} ${s}`);

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a.trim()); }));
}

function getRepoLabels() {
  try {
    return JSON.parse(execFileSync(
      'gh', ['label', 'list', '--limit', '200', '--json', 'name,color,description'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ));
  } catch { return []; }
}

function tagExisting(candidates, repoLabels) {
  const names = new Set(repoLabels.map((l) => l.name.toLowerCase()));
  return candidates.map((l) => ({ ...l, existsInRepo: names.has(String(l.name).toLowerCase()) }));
}

function printChoices(list) {
  list.forEach((l, i) => {
    const tag = l.existsInRepo === true ? theme.dim(' (existing)')
      : l.existsInRepo === false ? theme.accent(' (new)') : '';
    const desc = l.description ? theme.dim(`  — ${l.description}`) : '';
    out(`  [${i + 1}] ${l.name}${tag}${desc}`);
  });
}

async function pickFrom(list) {
  if (list.length === 0) return [];
  printChoices(list);
  const pick = await ask('Apply which? (comma numbers, "all", or blank to skip): ');
  if (pick.toLowerCase() === 'all') return list;
  const idx = pick.split(',').map((s) => parseInt(s.trim(), 10) - 1).filter((n) => n >= 0 && n < list.length);
  return idx.map((i) => list[i]);
}

/**
 * @returns {Promise<Array<{name,color,description}>>} labels picked this round ([] to skip)
 */
async function pickLabels({ title, body, provider, model }) {
  const repoLabels = getRepoLabels();

  for (;;) {
    out();
    out(theme.bold('Labels — where from?'));
    out(`  ${theme.key('1', ' Existing repo labels')} ${theme.dim(`(${repoLabels.length} in this repo)`)}`);
    out(`  ${theme.key('2', ' AI suggestions')} ${theme.dim('(tags each pick new vs. existing)')}`);
    out(`  ${theme.key('3', ' Your label pack')} ${theme.dim('(gitset labelspack)')}`);
    const src = (await ask(`  ${theme.key('q', 'uit / skip')} > `)).toLowerCase();

    if (src === '1') {
      if (repoLabels.length === 0) {
        out(theme.warn('This repo has no labels yet — try 2 (AI) or 3 (your pack) instead.'));
        continue;
      }
      const chosen = await pickFrom(repoLabels.map((l) => ({ ...l, existsInRepo: true })));
      if (chosen.length) out(theme.success(`✓ labels: ${chosen.map((l) => l.name).join(', ')}`));
      return chosen;
    }

    if (src === '2') {
      process.stderr.write(theme.dim('… asking the AI for label suggestions\n'));
      let sug;
      try {
        sug = await suggestLabels({
          title, body, existing: repoLabels.map((l) => l.name).join(', '), provider, model,
        });
      } catch (e) {
        errln(e.message || 'AI label suggestion failed.');
        continue;
      }
      if (sug.length === 0) {
        out(theme.warn("The AI didn't return usable suggestions. Try again, or use 1/3 instead."));
        continue;
      }
      const chosen = await pickFrom(tagExisting(sug, repoLabels));
      if (chosen.length) out(theme.success(`✓ labels: ${chosen.map((l) => l.name).join(', ')}`));
      return chosen;
    }

    if (src === '3') {
      const { source, labels } = getLabels();
      if (labels.length === 0) {
        out(theme.warn('Your label pack is empty. Run `gitset labelspack --init` first.'));
        continue;
      }
      out(theme.dim(`(from ${source})`));
      const chosen = await pickFrom(tagExisting(labels, repoLabels));
      if (chosen.length) out(theme.success(`✓ labels: ${chosen.map((l) => l.name).join(', ')}`));
      return chosen;
    }

    if (src === 'q' || src === '') return [];
    out(theme.warn('Unrecognized option.'));
  }
}

module.exports = { pickLabels };
