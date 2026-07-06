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
        'when the real repository is given below, using that exact path; otherwise omit it.',
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

module.exports = { commit, issue, pr, readme, release, about, gitignore, labels, labelDescriptions };
