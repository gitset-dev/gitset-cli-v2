# ⭐ **Complete Gitset Flow**

### **End-to-end system architecture and functionality**

---

## **System Architecture**

### **Core Components**

1. **WebApp** - User authentication and credential management
2. **Turso Database** - Credential storage, usage tracking, and draft persistence
3. **CLI** - Local git analysis, user interface, and GitHub interactions
4. **Core Backend** - API validation, quota control, AI integration (Gemini)
5. **Gemini AI** - Content generation engine (Commit, PR, Issue, Release, Readme)

### **Data Flow**

```
User Action (CLI) → Local Analysis (Git/Files) → Backend Request (API)
Backend Validation (Auth/Quota) → AI Generation (Gemini) → Draft Storage (Turso)
Backend Response → CLI Display → User Refinement/Execution (gh CLI)
```

---

## **Authentication Flow**

### **1. User Authentication in WebApp**

The WebApp collects and stores in Turso:

* **gitset_key** - Unique authentication token
* **user_email** - User identification
* **user_plan** - Subscription tier (basic/pro/enterprise)
* **github_oauth_token** - GitHub integration token (used for backend-side operations if needed, though CLI primarily uses local `gh` auth)

Data is stored in the `credentials` table.

### **2. CLI Authentication**

* **Command**: `gitset auth`
* CLI prompts for Gitset Key
* CLI calls backend endpoint `/validate`
* Backend verifies key against Turso database
* Credentials saved locally in `~/.gitset/config.json`

---

## **Command Reference**

### **Authentication**

| Command | Description |
|---------|-------------|
| `gitset auth` | Authenticate with Gitset Key |
| `gitset verify` | Verify server connection |
| `gitset logout` | Close session |

### **Commit Generation**

| Command | Description |
|---------|-------------|
| `gitset commit` | Analyze unstaged changes |
| `gitset commit --staged` | Analyze staged changes only |
| `gitset commit --all` | Analyze all changes |
| `gitset commit --custom` | Use custom template |
| `gitset commit --historical --N` | Use N commits for style learning (default 10) |

### **Project Management Tools**

| Command | Description |
|---------|-------------|
| `gitset issue` | Create new issue with AI assistance |
| `gitset issue --close` | Interactive issue closing wizard |
| `gitset pr` | Create Pull Request with AI analysis of diffs |
| `gitset release` | Manage Tags & Releases with AI notes |
| `gitset readme` | Generate or Update README.md based on project analysis |
| `gitset dependabot-resolver` | Analyze and resolve Dependabot alerts |

### **Template Management**

| Command | Description |
|---------|-------------|
| `gitset template --sync` | Create/update commit message template |
| `gitset template --show` | Display current template |
| `gitset template --delete` | Remove template |

### **Utilities**

| Command | Description |
|---------|-------------|
| `gitset status` | View repository and auth status |
| `gitset tree` | Display complete project structure |
| `gitset tree --flag PATTERN` | Exclude specific patterns (e.g., `/node_modules`, `.png`) |
| `gitset tree --flag --gitignore` | Exclude all .gitignore patterns |
| `gitset help` | Show available commands |

---

## **Feature Details**

### **1. Commit Message Generator**

* **Modes**: Unstaged, Staged, All.
* **Historical Learning**: Analyzes past commits to match project style.
* **Custom Templates**: Enforce specific formats via `~/.gitset/COMMIT-MSG-TEMPLATE.md`.
* **Refinement**: Interactive refinement of generated messages.

### **2. Issue Crafter (`gitset issue`)**

* **Interactive Wizard**: Prompts for issue description.
* **AI Generation**: Generates professional title, body, and labels.
* **Context Aware**: Uses repository context (remote URL) to tailor content.
* **Refinement**: Allows refining title or body before creation.
* **Execution**: Uses `gh issue create` to create the issue on GitHub.
* **Closing**: `gitset issue --close` lists open issues and allows closing with reasons.

### **3. PR Maker (`gitset pr`)**

* **Diff Analysis**: Analyzes the diff between current branch and base branch.
* **AI Generation**: Creates comprehensive PR description (Summary, Changes, Testing).
* **Smart Defaults**: Detects base branch (default: `main` or `master`).
* **Refinement**: Interactive refinement loop.
* **Execution**: Uses `gh pr create` to open the PR.

### **4. Release Manager (`gitset release`)**

* **Tag Management**: Lists recent tags and helps create new ones (SemVer support).
* **Release Notes**: Generates release notes based on commits since last tag.
* **Styles**: Supports 'Detailed' or 'Concise' release note styles.
* **Drafts**: Saves release drafts in Turso database.
* **Execution**: Uses `gh release create` to publish.

### **5. README Generator (`gitset readme`)**

* **Project Analysis**: Scans `package.json` and file structure.
* **AI Generation**: Creates a full `README.md` with sections (Installation, Usage, Features).
* **Section Update**: Can update specific sections of an existing README.
* **Refinement**: Interactive refinement of generated content.

### **6. Dependabot Resolver (`gitset dependabot-resolver`)**

* **Alert Fetching**: Fetches open Dependabot alerts via `gh api`.
* **Risk Analysis**: Analyzes update risks (Breaking, Moderate, Low) based on SemVer and ecosystem.
* **Auto-Resolution**: Can automatically create branches, update manifests, and open PRs for low-risk updates.
* **Dry Run**: `--dry-run` mode to preview actions.

### **7. Tree Visualization (`gitset tree`)**

* **Native**: No external dependencies.
* **Filtering**: Powerful filtering by directory, extension, or `.gitignore`.

---

## **Backend Processing & Database**

### **API Endpoints (`gitset-core-v2`)**

* `/api/commit`: Commit message generation.
* `/api/issue`: Issue content generation and refinement.
* `/api/pr`: PR description generation.
* `/api/release`: Release notes generation.
* `/api/readme`: README content generation.
* `/validate`: Key validation.

### **Database Schema (Turso)**

* **`credentials`**: User auth and plan info.
* **`message_usage`**: Quota tracking.
* **`debug`**: Detailed logs for debugging and performance analysis.
* **Draft Tables**:
    * `commit_drafts`, `commit_versions`
    * `issue_drafts`, `issue_versions`
    * `pr_drafts`, `pr_versions`
    * `release_drafts`, `release_versions`
    * `readme_drafts`, `readme_versions`

### **Quota Management**

* **Basic**: 50 requests/month.
* **Pro**: 200 requests/month.
* **Enterprise**: 600 requests/month.

---

## **Technical Details**

### **Platform Compatibility**
* **OS**: macOS, Linux, Windows.
* **Node.js**: v14+ required.
* **Dependencies**: Minimal (mostly native Node.js).

### **Configuration**
* **Config**: `~/.gitset/config.json`.
* **Templates**: `~/.gitset/*-TEMPLATE.md`.

### **Security**
* **API Keys**: Stored securely in Turso (backend).
* **Local Auth**: `gitset_key` stored locally.
* **GitHub Auth**: Relies on user's local `gh` CLI authentication for execution, ensuring least privilege and using existing secure credentials.

---

## **Summary**

Gitset v2 is a comprehensive developer productivity suite. It goes beyond simple commit messages to automate the entire software development lifecycle—from coding (Commits), to planning (Issues), to reviewing (PRs), to documenting (README), and finally releasing (Tags/Releases) and maintaining (Dependabot). It leverages a hybrid architecture with a powerful CLI for local context and execution, and a robust backend for AI intelligence and state management.