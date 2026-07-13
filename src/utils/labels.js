'use strict';

/**
 * Local label-pack util. No backend, no gitset_key — the old remote
 * /api/issue label CRUD has been removed. Source of truth is a local
 * ~/.gitset/labels.md (a fenced ```yaml block) or a built-in default set.
 * Live repo labels are read via the user's authenticated `gh` CLI.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = process.env.GITSET_CONFIG_DIR || path.join(os.homedir(), '.gitset');
const LABELS_FILE = path.join(DIR, 'labels.md');

const DEFAULT_LABELS = [
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
  { name: 'documentation', color: '0075ca', description: 'Documentation changes' },
  { name: 'question', color: 'd876e3', description: 'Further information requested' },
  { name: 'good first issue', color: '7057ff', description: 'Good for newcomers' },
  { name: 'help wanted', color: '008672', description: 'Extra attention is needed' },
  { name: 'dependencies', color: '0366d6', description: 'Dependency updates' },
  { name: 'security', color: 'b60205', description: 'Security-related' },
  { name: 'refactor', color: 'fbca04', description: 'Code refactor, no behavior change' },
  { name: 'wontfix', color: 'ffffff', description: 'This will not be worked on' },
  { name: 'duplicate', color: 'cfd3d7', description: 'Already exists' },
];

function parseLabelsYaml(content) {
  const labels = [];
  let cur = null;
  for (let line of String(content).split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('- name:')) {
      if (cur) labels.push(cur);
      cur = { name: unquote(line.replace('- name:', '').trim()) };
    } else if (cur && line.startsWith('color:')) {
      cur.color = unquote(line.replace('color:', '').trim());
    } else if (cur && line.startsWith('description:')) {
      cur.description = unquote(line.replace('description:', '').trim());
    }
  }
  if (cur) labels.push(cur);
  return labels;
}
function unquote(s) {
  return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1) : s;
}

function serializePack(labels) {
  const body = labels.map((l) =>
    `  - name: "${l.name}"\n    color: "${(l.color || '').replace('#', '')}"\n    description: "${l.description || ''}"`).join('\n');
  return `# Gitset label pack — edit freely.\n\n\`\`\`yaml\n${body}\n\`\`\`\n`;
}

function getLabels() {
  if (fs.existsSync(LABELS_FILE)) {
    const content = fs.readFileSync(LABELS_FILE, 'utf8');
    const m = content.match(/```ya?ml([\s\S]*?)```/);
    const labels = m ? parseLabelsYaml(m[1]) : parseLabelsYaml(content);
    if (labels.length) return { source: `local ${path.relative(os.homedir(), LABELS_FILE) || LABELS_FILE}`, labels };
  }
  return { source: 'built-in default pack', labels: DEFAULT_LABELS };
}

function writeDefaultPack() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(LABELS_FILE, serializePack(DEFAULT_LABELS));
  return LABELS_FILE;
}

function addLabel(label) {
  if (!label || !label.name) return false;
  const { labels } = fs.existsSync(LABELS_FILE) ? getLabels() : { labels: [...DEFAULT_LABELS] };
  if (labels.some((l) => l.name === label.name)) {
    const i = labels.findIndex((l) => l.name === label.name);
    labels[i] = { ...labels[i], ...label };
  } else {
    labels.push({ name: label.name, color: (label.color || '').replace('#', ''), description: label.description || '' });
  }
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(LABELS_FILE, serializePack(labels));
  return true;
}

function getRepoLabels() {
  try {
    const out = execFileSync('gh', ['label', 'list', '--limit', '200', '--json', 'name,color,description'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch {
    return [];
  }
}

function writePack(labels) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(LABELS_FILE, serializePack(labels));
  return LABELS_FILE;
}

module.exports = {
  LABELS_FILE, DEFAULT_LABELS,
  getLabels, addLabel, writeDefaultPack, writePack, getRepoLabels, parseLabelsYaml,
};
