// VENDORED from gitset-core-v2/lib/release-notes — do not edit here. Run `pnpm sync:ai`.
'use strict';

const OPT_OUT_MARKER = /<!--\s*gitset-commit-refs\s*:\s*off\s*-->/i;

const MIN_SHA = 7;
const SHORT_DISPLAY = 7;

function commitRefsOptedOut(template) {
  return OPT_OUT_MARKER.test(String(template || ''));
}

function shouldReferenceCommits({ commits, template } = {}) {
  return Array.isArray(commits) && commits.length > 0 && !commitRefsOptedOut(template);
}

function parseRemoteUrl(remote) {
  const raw = String(remote || '').trim();
  if (!raw) return null;

  let host;
  let path;

  const scp = raw.match(/^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    host = url.hostname;
    path = url.pathname;
  } else if (scp) {
    host = scp[1];
    path = scp[2];
  } else {
    return null;
  }

  path = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');

  if (!host || !path || !path.includes('/') || /(^|\.)azure\.com$|visualstudio\.com$/i.test(host)) return null;

  const h = host.toLowerCase();
  const kind = h === 'github.com' ? 'github'
    : h === 'bitbucket.org' ? 'bitbucket'
    : h === 'gitlab.com' || h.includes('gitlab') ? 'gitlab'
    : 'generic';

  return { host: h, path, kind, webUrl: `https://${h}/${path}` };
}

function commitUrlFor(remote, sha) {
  if (!remote || !sha) return null;
  if (remote.kind === 'gitlab') return `${remote.webUrl}/-/commit/${sha}`;
  if (remote.kind === 'bitbucket') return `${remote.webUrl}/commits/${sha}`;
  return `${remote.webUrl}/commit/${sha}`;
}

const HEX = /^[0-9a-f]+$/i;

function linkCommitRefs(text, { commits = [], commitUrl } = {}) {
  const body = String(text ?? '');
  const known = commits
    .map((c) => ({ sha: String(c?.hash || '').toLowerCase(), url: c?.url || null }))
    .filter((c) => c.sha.length >= MIN_SHA && HEX.test(c.sha));
  if (!body || !known.length) return body;

  const resolve = (token) => {
    const t = token.toLowerCase();
    const matches = known.filter((c) => c.sha.startsWith(t));

    if (matches.length !== 1) return null;
    const url = matches[0].url || (commitUrl ? commitUrl(matches[0].sha) : null);

    return url ? { url, display: matches[0].sha.slice(0, Math.max(SHORT_DISPLAY, t.length)) } : null;
  };

  const PROTECTED = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|<a\b[^>]*>[\s\S]*?<\/a>|!?\[[^\]\n]*\]\([^)\n]*\)|<https?:\/\/[^>\s]+>|https?:\/\/[^\s)<>\]]+)/gi;
  const parts = body.split(PROTECTED);

  return parts.map((part, i) => {

    if (i % 2 === 1) return part;
    return part.replace(/(^|[^0-9A-Za-z_\/#@.-])([0-9a-f]{7,40})(?![0-9A-Za-z_-])/gi, (match, lead, token) => {
      const hit = resolve(token);
      return hit ? `${lead}[${hit.display}](${hit.url})` : match;
    });
  }).join('');
}

function unlinkCommitRefs(text) {
  return String(text ?? '').replace(
    /\[`?([0-9a-f]{7,40})`?\]\((?:https?:\/\/[^)\s]*\/(?:-\/)?commits?\/[0-9a-f]{7,40}[^)\s]*)\)/gi,
    '$1',
  );
}

module.exports = {
  OPT_OUT_MARKER,
  commitRefsOptedOut,
  shouldReferenceCommits,
  parseRemoteUrl,
  commitUrlFor,
  linkCommitRefs,
  unlinkCommitRefs,
};
