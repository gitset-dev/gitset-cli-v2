'use strict';

const clip = (s, n) => {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n)}\n…(truncated)` : str;
};

const commit = {
  id: 'commit',
  build(ctx = {}) {
    const { diff = '', stats = '', style = 'conventional', template = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You are a precise Git commit message author. Produce ONE commit message only, no prose, no code fences. ' +
        `Follow the ${style} commits convention. Imperative mood, concise subject (<= 72 chars), ` +
        'optional body explaining the why when the change is non-trivial.',
      user: [
        stats && `Change stats:\n${clip(stats, 2000)}`,
        template && `Follow this commit template/style:\n${clip(template, 2000)}`,
        `Staged diff:\n${clip(diff, 12000)}`,
        previous && `Previous attempt to improve on:\n${clip(previous, 2000)}`,
        instruction && `Extra instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const issue = {
  id: 'issue',
  build(ctx = {}) {
    const { title = '', context = '', template = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You write clear, actionable GitHub issues. Output GitHub-flavored Markdown only. ' +
        'Include a short summary, concrete steps/acceptance criteria, and scope. No filler.',
      user: [
        title && `Topic: ${clip(title, 500)}`,
        template && `Follow this template:\n${clip(template, 4000)}`,
        context && `Repository context:\n${clip(context, 8000)}`,
        previous && `Refine this previous version:\n${clip(previous, 6000)}`,
        instruction && `Refinement instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const pr = {
  id: 'pr',
  build(ctx = {}) {
    const { diff = '', commits = '', template = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You write high-signal pull request descriptions in GitHub-flavored Markdown. ' +
        'Sections: Summary, Changes, Testing. Be specific and concise; no boilerplate.',
      user: [
        template && `Follow this template:\n${clip(template, 4000)}`,
        commits && `Commits:\n${clip(commits, 4000)}`,
        diff && `Diff:\n${clip(diff, 12000)}`,
        previous && `Refine this previous version:\n${clip(previous, 6000)}`,
        instruction && `Refinement instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const readme = {
  id: 'readme',
  build(ctx = {}) {
    const { projectName = '', context = '', template = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You write professional README.md files in GitHub-flavored Markdown. ' +
        'Accurate to the provided code context. Include title, description, install, usage. ' +
        'Do not invent features that are not evidenced by the context.',
      user: [
        projectName && `Project: ${clip(projectName, 200)}`,
        template && `Follow this structure:\n${clip(template, 4000)}`,
        context && `Repository context:\n${clip(context, 16000)}`,
        previous && `Refine this previous version:\n${clip(previous, 12000)}`,
        instruction && `Refinement instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const release = {
  id: 'release',
  build(ctx = {}) {
    const { tag = '', repo = '', commits = '', mode = 'summary', template = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You write release notes in GitHub-flavored Markdown. Group changes ' +
        '(Features, Fixes, Other). User-facing language. No commit hashes in headings. ' +
        'Output ONLY the release notes themselves — start directly with the content, ' +
        'with NO preamble, NO sign-off, and NO conversational text such as ' +
        '"Here\'s a summary" or "Here are the release notes". ' +
        'When a template/style example is provided, follow its structure, section ' +
        'headings, ordering, and tone closely — treat it as the format to reproduce. ' +
        'Never invent a repository path (e.g. placeholders like "your-project/your-repo" ' +
        'or "user/repo") for a "Full Changelog" or compare link — only include such a link ' +
        'when the real repository is given below, using that exact path; otherwise omit it. ' +
        'Never attribute a change to a person (e.g. "by @username") — a commit author\'s ' +
        'display name (e.g. "Jane Smith") is NOT their GitHub username and must never be ' +
        'guessed into one (e.g. never invent "@jane-smith"). If a commit message already ' +
        'ends in a real PR reference like "(#123)", you may link directly to that PR using ' +
        'the given repository path (e.g. https://github.com/<repo>/pull/123), but state only ' +
        'what changed — no author mention.',
      user: [
        repo && `Repository: ${clip(repo, 200)}`,
        tag && `Release: ${clip(tag, 100)}`,
        `Mode: ${mode}`,
        template && `Reproduce the structure, sections, and tone of this template/example closely:\n${clip(template, 12000)}`,
        commits && `Commits/diff:\n${clip(commits, 14000)}`,
        previous && `Refine this previous version:\n${clip(previous, 8000)}`,
        instruction && `Refinement instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const about = {
  id: 'about',
  build(ctx = {}) {
    const { context = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You generate a concise GitHub repository "About" description (<= 350 chars) ' +
        'and up to 12 lowercase topic tags. Respond as JSON: {"description": string, "topics": string[]}.',
      user: [
        context && `Repository context:\n${clip(context, 12000)}`,
        previous && `Improve on:\n${clip(previous, 2000)}`,
        instruction && `Instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const knowledgeSummarize = {
  id: 'knowledgeSummarize',
  build(ctx = {}) {
    const { repo = '', module = '', files = '' } = ctx;
    return {
      system:
        'You are a code cartographer producing structured file summaries for a ' +
        'repository knowledge base consumed by AI agents and developers. Describe ' +
        'ONLY what is present in the provided file contents — if something is not ' +
        'visible in the input, do not claim it. Never invent file paths, exports, ' +
        'or behavior. Respond with ONLY a valid JSON array, no prose, no code ' +
        'fences: [{"path": string, "purpose": string (<= 220 chars, concrete and ' +
        'specific), "exports": string[] (ONLY values the file actually exports/' +
        'exposes — module.exports, export statements, __all__; an executable or ' +
        'script with no exports gets [], never its internal functions; max 12), ' +
        '"dependencies": string[] (notable internal files or external ' +
        'packages this file relies on, max 10 — each entry must be a distinct, ' +
        'real import copied from the file\'s own import/require statements; if ' +
        'you are not certain of one, omit it rather than guessing, and never ' +
        'repeat or extend a name into a longer variant), "notes": string ' +
        '(<= 160 chars — gotchas, side effects, or "" if none)}]. One entry per ' +
        'FILE block in the input, using the exact path given. For a dispatcher/' +
        'entry-point file, note in "notes" the exact command or route names it ' +
        'registers.',
      user: [
        repo && `Repository: ${clip(repo, 200)}`,
        module && `Module: ${clip(module, 200)}`,
        `Files:\n\n${clip(files, 30000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const knowledgeWrite = {
  id: 'knowledgeWrite',
  build(ctx = {}) {
    const { repo = '', doc = '', sections = '', guidance = '', digest = '', summaries = '' } = ctx;
    return {
      system:
        'You write one Markdown document of a repository knowledge base optimized ' +
        'for AI agents and developers: dense, factual, skimmable. Ground every ' +
        'statement in the structural digest and file summaries provided — never ' +
        'cite a file path, command, script, or dependency that does not appear in ' +
        'the input. If the input lacks information for a section, write what is ' +
        'known and omit speculation entirely. Use the exact section headings ' +
        'requested, as "## " headings, in the given order — every requested ' +
        'section must appear. Start directly with ' +
        'the "# " title line — no preamble, no sign-off, no code fences around ' +
        'the document. Keep it concise: prefer tables and short bullet lists ' +
        'over paragraphs. In Markdown tables, keep every cell compact with a ' +
        'single space around each pipe (| Cell | Cell |) — never pad columns ' +
        'with runs of spaces to align them. When referring to a repository file, format it as a ' +
        'relative markdown link from docs/gitset-knowledge/ (e.g. ' +
        '[src/x.js](../../src/x.js)) — the link target is the file path prefixed ' +
        'with ../../, never a repeated or altered filename. When documenting CLI ' +
        'commands or routes, use the exact names the dispatcher/entry point ' +
        'registers (from the summaries/digest), never names derived from file ' +
        'names. End the document immediately after the last line of the final ' +
        'requested section — no trailing blank lines, separators, or repeated ' +
        'characters of any kind.',
      user: [
        repo && `Repository: ${clip(repo, 200)}`,
        `Document to write: ${clip(doc, 200)}`,
        sections && `Required sections, in order: ${clip(sections, 500)}`,
        guidance && `Section guidance (follow strictly): ${clip(guidance, 1000)}`,
        digest && `Structural digest (ground truth):\n${clip(digest, 12000)}`,
        summaries && `File summaries (ground truth):\n${clip(summaries, 40000)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

const gitignore = {
  id: 'gitignore',
  build(ctx = {}) {
    const { stack = '', context = '', instruction = '', previous = '' } = ctx;
    return {
      system:
        'You generate the contents of a .gitignore file. Output ONLY the raw ' +
        '.gitignore contents — no prose, no Markdown, no code fences. Group ' +
        'entries under short "# Section" comments. Cover OS, editor, language/' +
        'framework build artifacts, deps, env/secret files, and logs as relevant.',
      user: [
        stack && `Target stack / tools: ${clip(stack, 2000)}`,
        context && `Repository signals:\n${clip(context, 6000)}`,
        previous && `Improve on this existing .gitignore:\n${clip(previous, 6000)}`,
        instruction && `Extra instruction: ${clip(instruction, 1000)}`,
      ].filter(Boolean).join('\n\n') || 'Generate a sensible general-purpose .gitignore.',
    };
  },
};

const labels = {
  id: 'labels',
  build(ctx = {}) {
    const { title = '', body = '', existing = '', instruction = '' } = ctx;
    return {
      system:
        'You suggest GitHub labels for an issue or pull request. Respond with ' +
        'ONLY a JSON array of objects: [{"name","color","description"}]. ' +
        'name lowercase, 1-2 words (hyphenate if two, e.g. "bug", "good-first-issue"); ' +
        'color a 6-char hex WITHOUT "#"; description under 80 chars. Suggest 1-4 ' +
        'labels. Prefer names from the existing list when they fit. No prose, no fences.',
      user: [
        title && `Title: ${clip(title, 500)}`,
        body && `Body:\n${clip(body, 4000)}`,
        existing && `Existing repo labels (prefer these when fitting): ${clip(existing, 1500)}`,
        instruction && `Instruction: ${clip(instruction, 500)}`,
      ].filter(Boolean).join('\n\n') || 'Suggest sensible default labels.',
    };
  },
};

const labelDescriptions = {
  id: 'labelDescriptions',
  build(ctx = {}) {
    const { labels = '', instruction = '' } = ctx;
    return {
      system:
        'You are an expert technical writer for software projects. Rewrite or ' +
        'generate concise descriptions for the given GitHub labels. Tone: ' +
        'professional, technical, concise. Each description MUST be under 100 ' +
        'characters. If a description already exists, rewrite it to read ' +
        'differently while preserving its meaning; if none exists, infer a ' +
        'logical one from the label name. Respond with ONLY valid JSON mapping ' +
        'each label name to its description: {"label-name":"description"}. ' +
        'No prose, no Markdown, no code fences.',
      user: [
        `Labels:\n${clip(labels, 6000)}`,
        instruction && `Instruction: ${clip(instruction, 500)}`,
      ].filter(Boolean).join('\n\n'),
    };
  },
};

module.exports = { commit, issue, pr, readme, release, about, gitignore, labels, labelDescriptions, knowledgeSummarize, knowledgeWrite };
