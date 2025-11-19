## gitset-v2-cli

![Language](https://img.shields.io/badge/language-JavaScript%2FTypeScript-blue.svg) ![License](https://img.shields.io/badge/license-Existing-orange.svg)

<div>
    <h1 align="left"><img width="128" src="https://raw.githubusercontent.com/username/gitset-v2-cli/main/artwork/gitset-logo.png" alt="gitset-v2-cli Logo"></h1>
</div>

<!-- BADGES_HERE -->

gitset-v2-cli is a powerful command-line interface (CLI) tool designed to streamline and intelligentize the process of generating conventional commit messages. By analyzing your staged changes, it helps you craft clear, consistent, and semantically meaningful commit messages, adhering to best practices and improving project maintainability and collaboration.

### Features
-   **Intelligent Message Generation**: Automatically suggests commit types, scopes, and descriptions based on your staged file changes and common development patterns.
-   **Conventional Commit Compliance**: Guides users in creating commits that rigorously follow the [Conventional Commits specification](https://www.conventionalcommits.org/en/v1.0.0/).
-   **Interactive Workflow**: Provides an intuitive, step-by-step interactive prompt to easily build complex commit messages without memorizing syntax.
-   **Diff Analysis**: Integrates deeply with Git to analyze the nature of staged modifications, aiding in the inference of appropriate commit message components.
-   **Customizable Templates**: Allows for the definition of custom commit types, scopes, and overall message structures to fit specific project requirements or team standards.
-   **Emoji Support**: Optionally enhances commit messages with relevant emojis for better visual parsing and expressiveness.
-   **Minimal Dependencies**: Built with a focus on performance and a lightweight footprint.

### Overview
The `gitset-v2-cli` streamlines your Git workflow by intelligently assisting with commit message creation. When executed in a Git repository with staged changes, it prompts you through a series of questions to gather necessary information (e.g., commit type, scope, subject, body, breaking changes, issues). Utilizing its analysis of your staged files, `gitset-v2-cli` suggests relevant options. Once all details are provided, it constructs a fully compliant conventional commit message and applies it to your Git repository. This process ensures consistency across your project's commit history, facilitating automated changelog generation, semantic versioning, and clearer communication among team members.

### Table of Contents
- [Features](#features)
- [Overview](#overview)
- [Version and Compatibility](#version-and-compatibility)
- [Basic Usage](#basic-usage)
  - [Installation](#installation)
  - [Generating a Commit Message](#generating-a-commit-message)
  - [Configuration](#configuration)
- [API (Command-Line Interface)](#api-command-line-interface)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [License](#license)

### Version and Compatibility
gitset-v2-cli requires Node.js (v14 or higher is recommended) and npm. It is compatible with modern Linux, macOS, and Windows environments.

### Basic Usage

#### Installation
To install `gitset-v2-cli` globally, use npm:

```bash
npm install -g gitset-v2-cli
```

After installation, you can typically invoke the CLI using `gitset-v2` or potentially an alias like `gitset` if configured.

#### Generating a Commit Message
1.  **Stage your changes**: Ensure you have files staged for commit.
    ```bash
    git add . # or git add <files>
    ```
2.  **Run `gitset-v2`**: Execute the command in your repository root.
    ```bash
    gitset-v2
    ```
    The CLI will guide you through an interactive series of prompts to construct your commit message.

    *Example Interactive Flow (simplified):*
    
    ```
    ? Select the commit type: (Use arrow keys)
    ❯ feat   A new feature
      fix    A bug fix
      docs   Documentation only changes
      style  Changes that do not affect the meaning of the code
    ...etc

    ? Enter the scope (e.g., component, module): (press enter to skip)
    (core)

    ? Enter the commit subject: (max 100 chars)
    (Implement intelligent message generation logic)

    ? Enter the commit body (optional): (press enter to skip)
    (This commit introduces advanced diff analysis to suggest commit types and scopes more accurately.)

    ? Is this a BREAKING CHANGE? (y/N)
    (N)

    ? Enter any issues closed by this commit (e.g., "closes #123, fix #456"): (press enter to skip)
    (closes #99)
    ```

#### Configuration
`gitset-v2-cli` provides default settings that are ready to use out of the box. For advanced customization, you can define project-specific rules, commit types, and prompt behaviors through a configuration file (e.g., `.gitsetrc` or `gitset.config.js`) in your project's root directory. Consult the official documentation for detailed configuration options.

### API (Command-Line Interface)
The primary interaction with `gitset-v2-cli` is through its command-line interface. Below are the most common commands and options:

*   **`gitset-v2`**: Initiates the interactive commit message generation process. This is the main command for daily use.

*   **`gitset-v2 --help`**: Displays comprehensive help information, including available commands, options, and examples.
    ```bash
    gitset-v2 --help
    ```

*   **`gitset-v2 --version`**: Shows the currently installed version of `gitset-v2-cli`.
    ```bash
    gitset-v2 --version
    ```

*   **`gitset-v2 <options>`**: While primarily interactive, some options allow for non-interactive or pre-filled inputs. (Details on specific flags like `-t`, `-s`, `-m` would be provided in full documentation).
    *Example (hypothetical non-interactive commit):*
    ```bash
    gitset-v2 -t "feat" -s "cli" -m "Add non-interactive commit mode" --no-verify
    ```

### Motivation
In collaborative development environments, consistent and descriptive commit messages are paramount for maintainability, effective code review, and automated tooling (such as changelog generation and semantic versioning). `gitset-v2-cli` was created to eliminate the manual overhead and cognitive load often associated with crafting such messages. By providing an intelligent, interactive, and customizable workflow, it aims to empower developers to maintain a pristine Git history effortlessly, fostering better communication, project clarity, and overall development velocity.

### Contributing
We welcome contributions to `gitset-v2-cli`! If you discover a bug, have an idea for an optimization, or wish to propose a new feature, please feel free to open an issue or submit a pull request. Your contributions help improve the project for everyone. Please refer to our `CONTRIBUTING.md` file (if available in the repository) for detailed guidelines on how to get started.

### License
This project is licensed under the [Your License Name Here] License. See the `LICENSE` file in this repository for the full license text.