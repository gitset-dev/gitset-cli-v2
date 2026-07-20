'use strict';

const KEY_RULES = [
  { rule: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { rule: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g },
  { rule: 'github-pat', re: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { rule: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { rule: 'gcp-oauth-key', re: /\bAQ\.[A-Za-z0-9_-]{30,}\b/g },
  { rule: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { rule: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { rule: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { rule: 'stripe-key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  { rule: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  { rule: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g },
  { rule: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
];

const ASSIGNMENT_RE = /(\b(?:api[_-]?key|apikey|secret|token|password|passwd|pwd|auth|credential|private[_-]?key)[\w-]*\s*[=:]\s*["']?)([A-Za-z0-9+/_.-]{16,})(["']?)/gi;

const ASSIGNMENT_SAFE_VALUES = /^(?:process\.env|import\.meta|os\.environ|env\(|\$\{|\$[A-Z_]|<[^>]+>|your[_-]|xxx|placeholder|example|changeme|dummy|test)/i;

const PROPERTY_CHAIN_RE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/;

const ENTROPY_TOKEN_RE = /\b[A-Za-z0-9+/_-]{24,}\b/g;
const ENTROPY_THRESHOLD = 4.2;
const MAX_FINDINGS_PER_FILE = 5;

function shannonEntropy(str) {
  const freq = new Map();
  for (const ch of str) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function looksLikeIdentifier(token) {
  if (/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(token)) return true;
  if (/^[A-Z0-9_]+$/.test(token)) return true;
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(token)) return true;
  if (/^(?:[0-9a-f]{2}[-:])+[0-9a-f]{2}$/i.test(token)) return true;
  if (!/[0-9]/.test(token) || !/[a-zA-Z]/.test(token)) return false;
  return false;
}

function redactSecrets(content) {
  if (typeof content !== 'string' || !content) {
    return { content, findings: [] };
  }

  const findings = [];
  let out = content;

  for (const { rule, re } of KEY_RULES) {
    re.lastIndex = 0;
    out = out.replace(re, () => {
      findings.push(rule);
      return `[REDACTED:${rule}]`;
    });
  }

  ASSIGNMENT_RE.lastIndex = 0;
  out = out.replace(ASSIGNMENT_RE, (full, prefix, value, suffix) => {
    if (ASSIGNMENT_SAFE_VALUES.test(value)) return full;
    if (PROPERTY_CHAIN_RE.test(value)) return full;
    if (value.includes('[REDACTED:')) return full;
    if (looksLikeIdentifier(value) && shannonEntropy(value) < ENTROPY_THRESHOLD) return full;
    findings.push('secret-assignment');
    return `${prefix}[REDACTED:secret-assignment]${suffix}`;
  });

  ENTROPY_TOKEN_RE.lastIndex = 0;
  out = out.replace(ENTROPY_TOKEN_RE, (token) => {
    if (token.includes('REDACTED')) return token;
    if (looksLikeIdentifier(token)) return token;
    if (shannonEntropy(token) < ENTROPY_THRESHOLD) return token;
    findings.push('high-entropy-token');
    return '[REDACTED:high-entropy-token]';
  });

  return { content: out, findings };
}

function sanitizeForPrompt(content) {
  const { content: redacted, findings } = redactSecrets(content);
  if (findings.length > MAX_FINDINGS_PER_FILE) {
    return { content: null, findings, dropped: true };
  }
  return { content: redacted, findings, dropped: false };
}

module.exports = {
  redactSecrets,
  sanitizeForPrompt,
  shannonEntropy,
  MAX_FINDINGS_PER_FILE,
};
