<div align="center">
  <a href="https://gitset.dev" target="_blank">
    <img src="https://raw.githubusercontent.com/gitset-dev/gitset/main/public/cli/favicon-192.png" alt="Gitset CLI" width="88" />
  </a>

  <h1>Gitset CLI</h1>

  <p><strong><code>Draft. Refine. Ship.</code></strong></p>

  <p>
    <img src="https://img.shields.io/badge/license-MPL--2.0-blue?style=flat-square" alt="MPL-2.0" />
    <img src="https://img.shields.io/badge/model-BYOAI-white?style=flat-square" alt="BYOAI" />
    <img src="https://img.shields.io/badge/node-%E2%89%A520-green?style=flat-square" alt="node >= 20" />
  </p>
</div>

---

Gitset is an open-source toolkit for everything around your code on GitHub:
commit messages, issues, pull requests, release notes, READMEs, labels, and
repository upkeep. Every tool drafts from your repository's real context; you
refine the draft until it ships. This package is the **CLI** — the same
tools, in your terminal.

**The CLI runs entirely on your machine.** There is no account, no login, and
no telemetry. Your provider keys live in `~/.gitset` with owner-only
permissions, and your code goes from your machine to your AI provider —
nowhere else. It never contacts a Gitset server.

## Install

```sh
npm install -g @gitset-dev/cli
```

Requires Node.js 20+. Commands that publish to GitHub (`--create`,
`--apply`) use the [GitHub CLI](https://cli.github.com) (`gh`) with your
existing login.

## Quick start

```sh
# interactive setup — pick a provider, paste your key, pick a model
gitset config

# stage changes, draft a commit message, refine it, commit
git add -A
gitset commit
```

`gitset config` walks you through it (provider list, masked key entry, a
curated model per provider with "recommended" pre-selected). Prefer flags or
scripting? `gitset config set anthropic --key sk-... --default` still works
exactly as before. Providers: `anthropic` · `openai` · `gemini` ·
`openrouter` · `custom` (any OpenAI-compatible endpoint). Override per run
with `--provider` and `--model`.

Terminal on a light background? `gitset config theme light` switches the
accent color to one tuned for readability there (defaults to a dark-terminal
palette).

## Commands

Drafting (uses your provider key):

| Command | Drafts |
|---|---|
| `gitset commit` | A commit message from your staged changes, with interactive refine |
| `gitset pr` | A pull-request description from the branch diff (`--create` opens it via `gh`) |
| `gitset issue -m "..."` | A structured GitHub issue from one sentence + repo context |
| `gitset readme` | A README from your tracked files (`--template` uses yours as the base) |
| `gitset release` | Release notes from a commit range (default: since the last tag) |
| `gitset gitignore` | A `.gitignore` for the detected stack |
| `gitset repo about` | A repository description + topics, applied via `gh` |

Local tools (no AI):

| Command | Does |
|---|---|
| `gitset labelspack` | Applies your reusable label set (`~/.gitset/labels.md`) to the repo |
| `gitset repo backup` | Writes a scheduled mirror-backup GitHub Actions workflow |
| `gitset repo license` | Generates a LICENSE file, fully offline |
| `gitset template` / `gitset init` | Manage / scaffold your local templates |
| `gitset dependabot` | Resolve open Dependabot alerts |
| `gitset tree` · `gitset status` | Repository structure · git + provider status |

Common flags: `--provider` `--model` `--yes` `--print` `--json`. Run
`gitset help <command>` for everything else.

## Knowledge Mapper

`gitset knowledge` builds and maintains `docs/gitset-knowledge/` — a
structured, always-current map of your codebase (architecture, module
boundaries, commands, dependency graph) that both developers and AI coding
agents can read before touching your code. It's generated from your source
code, manifests, and CI configuration — never from your existing prose docs,
so it can't inherit their drift.

```sh
gitset knowledge init       # scaffold optional .gitset-knowledge.json (include/exclude globs)
gitset knowledge scan       # zero AI calls — discovers files, prints the plan + exact cost estimate
gitset knowledge generate   # shows the estimate again, asks to confirm, then writes the knowledge base
gitset knowledge update     # incremental — only changed modules (and their direct importers) are re-summarized
gitset knowledge automate   # writes a GitHub Actions workflow that keeps it fresh in CI (direct commits, or PRs with --sync pr)
```

It's a six-stage local pipeline (Discover → Map → Summarize → Plan → Write →
Validate): Discover and Map walk the repository and build an import graph
with zero AI calls; only Summarize and Write touch your configured provider
— there's no separate "default model" for this tool, it uses whatever you
picked with `gitset config`; and a deterministic Validate pass checks every
generated link, command, and script before anything is written to disk.
Secrets are redacted locally before any file content is sent, and prose
docs / test file bodies are listed structurally but never sent at all.

`gitset knowledge automate` applies updates in one of two ways, and you
never touch a GitHub settings page for either:

- **Direct commit (the default).** CI commits refreshed docs straight to
  your default branch using only the built-in Actions token — works on
  every repository and organization, zero extra permissions or tokens,
  and it can't re-trigger itself.
- **Review pull request (`--sync pr`).** Each update arrives as a PR on
  the `gitset/knowledge-update` branch. Its one prerequisite is set up
  for you: the CLI first tries enabling the repo's Actions PR permission
  via the API; if your organization blocks that, it offers to store a
  token from your existing `gh` login as the `GITSET_PR_TOKEN` secret —
  explained in plain language before asking, reversible anytime by
  deleting the secret. If neither works out, updates still commit and
  push their branch safely; only the PR step fails, and the workflow run
  shows that failure clearly rather than hide it.

## Templates

Define your commit style, issue structure, PR format, README skeleton, or
release-notes layout once in `~/.gitset/templates` and every draft follows
it — the same define-once-reuse-everywhere model as the
[web app](https://gitset.dev). `gitset template edit <commit|pr|issue|readme|release>`
opens (or creates) one in `$EDITOR` — no need to hunt for the file path.

## Configuration

Keys and defaults: `~/.gitset/config.json` (created with `0600`
permissions). Templates: `~/.gitset/templates`. Label pack:
`~/.gitset/labels.md`. Delete `~/.gitset` and every trace is gone.

## Contributing

Issues and pull requests are welcome:
[gitset-dev/gitset-cli-v2](https://github.com/gitset-dev/gitset-cli-v2).

## License

[MPL-2.0](LICENSE) © Iván Luna. The Gitset name and logo are not covered by
the code license.
