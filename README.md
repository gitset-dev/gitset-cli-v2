# gitset-v2-cli

![License](https://img.shields.io/badge/license-MPL_2.0-blue)

# example

Gitset is a powerful Command-Line Interface (CLI) tool designed to streamline your development workflow by generating intelligent and well-structured commit messages. Leveraging AI capabilities through a backend service, Gitset helps maintain clean and consistent commit history, authenticate users, and provides a suite of utility commands for common repository tasks such as generating `.gitignore` files, managing releases, and resolving Dependabot alerts.

## Features

*   **Intelligent Commit Message Generation**: Automatically generates smart, descriptive commit messages based on your staged changes, integrating with an AI-powered backend.
*   **User Authentication**: Secure authentication system using a personal Gitset Key to interact with the backend services.
*   **Local Configuration Management**: Stores user configuration and API keys securely in your home directory (`~/.gitset`).
*   **Git Repository Detection**: Automatically detects if the current directory is a Git repository, ensuring commands are run in the correct context.
*   **Dependabot Resolver**: Specialized commands for analyzing and potentially resolving Dependabot security alerts.
*   **`.gitignore` Generator**: Quickly generate or update `.gitignore` files with common patterns for various languages and frameworks.
*   **Release Management**: Tools to assist with project release processes.
*   **Repository Utilities**: General commands for repository analysis and management.
*   **Badge Generator**: Utility to create project badges.
*   **License Generator**: Helps in generating standard license files for your projects.
*   **Interactive UI**: Provides a user-friendly, interactive command-line experience with clear prompts and colored output.

## Tech Stack

*   **Language**: JavaScript/TypeScript
*   **Runtime**: Node.js
*   **Package Manager**: npm
*   **Core Modules**: `child_process`, `fs`, `path`, `os`, `readline`
*   **Networking**: `fetch` for backend API interactions
*   **UI Utilities**: Custom `ui` module for logging, questions, and options

## Installation

To install Gitset CLI globally on your system, use npm:

bash
npm install -g gitset-v2-cli


## Usage

Before using most Gitset commands, you'll need to authenticate with your Gitset Key.

### Authentication

Run the `auth` command and follow the prompts to enter your Gitset Key:

bash
gitset auth


Your key will be validated with the backend and saved locally in `~/.gitset/config.json`.

### Generate an Intelligent Commit Message

Once authenticated, navigate to your Git repository and run the main command to generate a commit message:

bash
gitset commit


This command will analyze your staged changes and provide an AI-generated commit message proposal.

### Dependabot Resolver

Use this command to interact with Dependabot related features, such as resolving alerts:

bash
gitset dependabot-resolver [options]


### `.gitignore` Generator

Generate or update your `.gitignore` file for common project types:

bash
gitset gitignore [options]


### Release Management

Access tools for managing your project releases:

bash
gitset release [options]


### Repository Utilities

Utilize commands for various repository-specific tasks, such as analyzing the repository or generating badges and licenses:

bash
gitset repo [options]


## API

The Gitset CLI interacts with a backend API for functionalities like commit message generation and key validation. The primary backend endpoint used is:

`https://gitset-core-v2.vercel.app/api/commit`

## Contributing

We welcome contributions! If you find a bug, have an idea for an optimization, or want to refactor existing code, feel free to submit a Pull Request. All contributions will be reviewed.

## License

This project is licensed under the Mozilla Public License 2.0 - see the [LICENSE](LICENSE) file for details.