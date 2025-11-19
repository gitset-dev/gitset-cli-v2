```markdown
## Gitset CLI

[![License](https://img.shields.io/badge/license-MPL_2.0-blue)](https://github.com/imprvhub/gitset-cli-v2/blob/main/LICENSE)

Gitset CLI is a command-line interface tool designed to streamline your Git workflow by generating intelligent and consistent commit messages. It helps developers adhere to conventional commit standards, improving project clarity, maintainability, and automated release processes.

### Features
*   **Intelligent Commit Message Generation**: Generates commit messages based on user input and configurable templates.
*   **Conventional Commits Adherence**: Encourages and facilitates the use of [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/) for standardized commit history.
*   **Customizable Templates**: Allows users to define and use their own commit message templates and types.
*   **Interactive Prompts**: Guides users through an interactive process to construct well-formed commit messages.
*   **Type and Scope Support**: Easily specify commit types (e.g., `feat`, `fix`, `chore`) and scopes to categorize changes.
*   **Multi-line Body and Footers**: Supports detailed commit bodies and custom footers for issue tracking or breaking changes.
*   **Seamless Git Integration**: Designed to integrate smoothly into existing Git-based development workflows.
*   **Cross-Platform**: Built with JavaScript/TypeScript, it runs on any platform supported by Node.js.

### Table of Contents
- [Description](#description)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

### Tech Stack
*   **Language**: JavaScript / TypeScript
*   **Package Manager**: npm

### Installation

To use Gitset CLI, you need Node.js (v14 or higher is recommended) and npm installed on your system.

#### Global Installation

Install Gitset CLI globally to access it from any directory in your terminal:

```bash
npm install -g gitset-v2-cli
```

#### Local Installation (for project-specific use)

If you prefer to install it locally within a project:

```bash
npm install gitset-v2-cli
```

Then, you can run it using `npx` or by adding a script to your `package.json`:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "commit": "gitset"
  }
}
```

And run it with:

```bash
npm run commit
```

### Usage

After installation, you can use `gitset` to generate commit messages interactively. The CLI will prompt you for the necessary information.

#### Basic Usage

Simply run the `gitset` command in your Git repository:

```bash
gitset
```

This will start an interactive session guiding you through:

1.  **Select commit type**: Choose from `feat`, `fix`, `docs`, `chore`, etc.
2.  **Enter scope (optional)**: Specify the part of the codebase affected (e.g., `api`, `cli`, `auth`).
3.  **Enter subject**: A short, imperative, present-tense description of the change.
4.  **Enter body (optional)**: A longer descriptive body.
5.  **Enter footer (optional)**: For breaking changes or issue references (e.g., `BREAKING CHANGE:`, `Closes #123`).

#### Using with Git Hook (Recommended)

Integrate `gitset` directly into your Git commit process using a `prepare-commit-msg` hook. This ensures all commits in your repository follow the standard.

1.  **Install `husky` (or similar tool)**:
    ```bash
    npm install husky --save-dev
    ```

2.  **Set up `prepare-commit-msg` hook**:
    Add the following script to `.husky/prepare-commit-msg` (create if it doesn't exist):
    ```bash
    #!/usr/bin/env sh
    . "$(dirname -- "$0")/_/husky.sh"

    exec < /dev/tty
    gitset --hook "$1"
    ```

    Make sure the hook file is executable:
    ```bash
    chmod +x .husky/prepare-commit-msg
    ```

Now, when you run `git commit`, `gitset` will launch automatically to help you compose your message.

### Configuration

Gitset CLI supports configuration through a `gitset.config.js` or `gitset.json` file in your project root. This allows you to customize commit types, scopes, and message templates.

#### Example `gitset.config.js`:

```javascript
module.exports = {
  types: [
    { value: 'feat', name: 'feat:     A new feature' },
    { value: 'fix', name: 'fix:      A bug fix' },
    { value: 'docs', name: 'docs:     Documentation only changes' },
    { value: 'chore', name: 'chore:    Other changes that don't modify src or test files' },
    { value: 'refactor', name: 'refactor: A code change that neither fixes a bug nor adds a feature' },
    { value: 'test', name: 'test:     Adding missing tests or correcting existing tests' },
    { value: 'build', name: 'build:    Changes that affect the build system or external dependencies' },
    { value: 'ci', name: 'ci:       Changes to our CI configuration files and scripts' },
    { value: 'perf', name: 'perf:     A code change that improves performance' },
    { value: 'revert', name: 'revert:   Reverts a previous commit' },
  ],
  scopes: [
    { name: 'api' },
    { name: 'cli' },
    { name: 'ui' },
    { name: 'config' },
    { name: 'deps' },
  ],
  // Optional: Custom prompt messages
  messages: {
    type: 'Select the type of change that you\'re committing:',
    scope: 'What is the scope of this change (e.g. component or file name): (press enter to skip)',
    subject: 'Write a short, imperative tense summary of the change:\n',
    body: 'Provide a longer change description: (press enter to skip)',
    breaking: 'List any BREAKING CHANGES (press enter to skip):',
    footer: 'List any ISSUES CLOSED by this change (e.g., "Fixes #123", "Closes #123"): (press enter to skip)',
    confirmCommit: 'Are you sure you want to proceed with the commit above?',
  },
  // Optional: Set a default type or scope
  defaultType: 'feat',
  defaultScope: 'core',
};
```

### Contributing

We welcome contributions! If you have suggestions, bug reports, or want to contribute code, please feel free to open an issue or submit a pull request.

1.  **Fork the repository**.
2.  **Create a new branch**: `git checkout -b feature/your-feature-name`.
3.  **Make your changes**.
4.  **Commit your changes** using `gitset` to ensure conventional commit messages.
5.  **Push to the branch**: `git push origin feature/your-feature-name`.
6.  **Open a Pull Request**.

### License

This project is licensed under the Mozilla Public License 2.0. See the [LICENSE](https://github.com/imprvhub/gitset-cli-v2/blob/main/LICENSE) file for details.
```