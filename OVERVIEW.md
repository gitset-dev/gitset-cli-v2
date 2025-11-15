# ⭐ **Complete Gitset Flow**

### **End-to-end system architecture and functionality**

---

## **Tree Visualization**

### **Native Implementation**

Gitset includes a built-in tree visualization that works without external dependencies:

* **No installation required**: Works immediately without `brew` or `tree` command
* **Cross-platform**: Functions on macOS, Linux, and Windows
* **Pure JavaScript**: Native Node.js implementation

### **Commands**

#### **Basic Usage**

```bash
gitset tree
```

Displays complete project structure with all files and directories.

#### **Exclude Directories**

```bash
gitset tree --flag /node_modules --flag .astro
```

Excludes specific folders from the tree visualization.

#### **Exclude by Extension**

```bash
gitset tree --flag .png
gitset tree --flag .md
gitset tree --flag .jpg --flag .gif
```

Excludes all files matching the specified extensions throughout the entire directory tree.

#### **Use .gitignore Patterns**

```bash
gitset tree --flag --gitignore
```

Automatically excludes all patterns defined in the project's `.gitignore` file.

### **Pattern Matching**

The tree command supports multiple pattern types:

* **Directory patterns**: `/node_modules`, `/dist`, `.astro`
* **Extension patterns**: `.png`, `.jpg`, `.md`
* **File patterns**: `package-lock.json`, `yarn.lock`
* **Gitignore patterns**: Automatically parsed from `.gitignore`

### **Features**

* Displays file and directory counts
* Shows visual tree structure with Unicode characters
* Recursively scans all subdirectories
* Smart pattern matching for flexible filtering
* Respects gitignore syntax (comments, leading slashes, wildcards)

### **Example Output**

```
📂 Project structure:

├── 📁 src
│   ├── 📄 index.js
│   └── 📁 utils
│       └── 📄 helper.js
├── 📁 tests
│   └── 📄 main.test.js
└── 📄 package.json

2 directories, 4 files
```

---

## **System Architecture**

### **Core Components**

1. **WebApp** - User authentication and credential management
2. **Turso Database** - Credential storage and usage tracking
3. **CLI** - Local git analysis and user interface
4. **Core Backend** - API validation, quota control, AI integration
5. **Gemini AI** - Commit message generation engine

### **Data Flow**

```
User changes → CLI analysis → Backend validation → 
AI generation → Backend response → CLI display
```

---

## **Authentication Flow**

### **1. User Authentication in WebApp**

The WebApp collects and stores in Turso:

* **gitset_key** - Unique authentication token
* **user_email** - User identification
* **user_plan** - Subscription tier (basic/pro/enterprise)
* **github_oauth_token** - GitHub integration token

Data is stored in the `credentials` table.

### **2. CLI Installation**

* Install globally via npm (when published)
* Currently tested with `npm link` for development
* Works independently from backend while maintaining integration

### **3. CLI Authentication**

* User runs `gitset auth`
* CLI prompts for Gitset Key
* CLI calls backend endpoint `/validate`
* Backend verifies key against Turso database
* Credentials saved locally in `~/.gitset/config.json`

---

## **Commit Message Generation**

### **Analysis Modes**

Three distinct analysis modes available:

* **`gitset commit`** - Analyzes unstaged changes (working directory)
* **`gitset commit --staged`** - Analyzes staged changes only
* **`gitset commit --all`** - Analyzes both staged and unstaged changes

### **Enhanced Features**

#### **Custom Template Mode**

* **Command**: `gitset commit --custom`
* Uses custom template from `~/.gitset/COMMIT-MSG-TEMPLATE.md`
* AI learns style, format, and conventions from template
* Maintains consistency across commits

#### **Historical Analysis Mode**

* **Command**: `gitset commit --historical --N`
* Analyzes last N commits (range: 5-20, default: 10)
* Examples:
  * `gitset commit --historical` - Uses 10 commits
  * `gitset commit --historical --15` - Uses 15 commits
  * `gitset commit --historical --20` - Uses 20 commits
* AI learns from commit history patterns
* Debug logging shows retrieved commits during generation

### **Feature Combinations**

Modes can be combined for powerful workflows:

* `gitset commit --custom --historical --15`
* `gitset commit --all --historical`
* `gitset commit --staged --custom`

---

## **Template Management**

### **Commands**

* **`gitset template --sync`** - Create or update template
* **`gitset template --show`** - Display current template
* **`gitset template --delete`** - Remove template

### **Template Structure**

Stored in `~/.gitset/COMMIT-MSG-TEMPLATE.md` as Markdown file.

Example template:
```
type(scope): brief description

- Use present tense
- Keep first line under 72 characters
- Add detailed context if needed
```

### **Cross-Platform Compatibility**

The `~/.gitset` directory structure works on:
* **macOS**: `/Users/username/.gitset/`
* **Linux**: `/home/username/.gitset/`
* **Windows**: `C:\Users\username\.gitset\`

Node.js `os.homedir()` ensures proper path resolution across all platforms.

---

## **Backend Processing**

### **1. Key Validation**

* Backend receives gitset_key
* Queries Turso credentials table
* Returns user plan and quota information

### **2. Quota Management**

Plan-based monthly limits:

* **Basic**: 50 messages (non-renewable)
* **Pro**: 200 messages (monthly renewable)
* **Enterprise**: 600 messages (monthly renewable)

Usage tracked in `message_usage` table.

### **3. Change Analysis**

* Summarizes file operations (add/modify/delete)
* Calculates line additions and deletions
* Generates structured diff

### **4. AI Prompt Construction**

Builds comprehensive prompt including:
* Change summary and statistics
* Full git diff (truncated if too large)
* Custom template (if provided)
* Commit history (if historical mode enabled)
* Conventional Commits guidelines

### **5. AI Generation**

* Uses Gemini 2.5 Flash model
* Multi-key system with automatic fallback
* Handles rate limiting and quota exhaustion
* Parses and formats response

### **6. Response**

Returns to CLI:
* **commit_message** - Formatted Conventional Commits message
* **quota_info** - Usage statistics
* **analysis** - Change statistics

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
| `gitset commit --historical --N` | Use N commits for style learning |
| `gitset commit --historical` | Use 10 commits (default) |

### **Template Management**

| Command | Description |
|---------|-------------|
| `gitset template --sync` | Create/update template |
| `gitset template --show` | Display current template |
| `gitset template --delete` | Remove template |

### **Utilities**

| Command | Description |
|---------|-------------|
| `gitset status` | View repository and auth status |
| `gitset tree` | Display complete project structure |
| `gitset tree --flag PATTERN` | Exclude specific patterns |
| `gitset tree --flag --gitignore` | Exclude all .gitignore patterns |
| `gitset help` | Show available commands |

---

## **Key Features**

### **Multi-Mode Analysis**

The CLI intelligently analyzes different repository states:
* **Unstaged mode**: Focus on working directory changes before staging
* **Staged mode**: Generate messages for what's about to be committed
* **All mode**: Comprehensive analysis of entire repository state

### **Smart AI Generation**

* Uses Gemini 2.5 Flash model for fast, accurate generation
* Multiple API keys with automatic fallback for high availability
* Custom template mode for consistent project style
* Historical analysis learns from past commit patterns
* Generates Conventional Commits format messages

### **Native Tree Visualization**

* **Zero dependencies**: No need for `brew` or external `tree` command
* **Cross-platform**: Works on macOS, Linux, Windows
* **Flexible filtering**: Exclude by directory, extension, or .gitignore
* **Multiple patterns**: Combine multiple exclusions in single command
* **Smart parsing**: Understands .gitignore syntax and patterns
* **Visual output**: Unicode tree structure with icons

### **Template System**

* Markdown-based template storage
* Cross-platform compatibility (macOS, Linux, Windows)
* Easy creation and management via CLI
* AI interprets and applies template guidelines
* Supports future tool extensions

### **Historical Learning**

* Analyzes 5-20 past commits (configurable)
* Debug logging for development visibility
* Pattern recognition for style consistency
* Combines with template mode for maximum customization

### **Secure Authentication**

* Gitset Key validation against Turso database
* Local config storage in `~/.gitset/config.json`
* GitHub OAuth token integration for future features
* Sensitive data truncation in responses

---

## **Database Schema**

### **credentials table**

| Column | Type | Description |
|--------|------|-------------|
| gitset_key | TEXT | Primary authentication key |
| user_email | TEXT | User identifier |
| user_plan | TEXT | Subscription tier |
| github_oauth_token | TEXT | GitHub integration |
| created_at | DATETIME | Account creation timestamp |

### **message_usage table**

| Column | Type | Description |
|--------|------|-------------|
| user_email | TEXT | User identifier |
| created_at | DATETIME | Usage timestamp |

Tracked per month for quota enforcement.

---

## **Workflow Examples**

### **Basic Workflow**

```bash
# Authenticate
gitset auth

# Make changes to files
git add file.js

# Generate commit message
gitset commit --staged

# Copy and use the generated message
git commit -m "feat(api): add user authentication endpoint"
```

### **Tree Visualization Workflow**

```bash
# View complete project structure
gitset tree

# Exclude common build directories
gitset tree --flag /node_modules --flag /dist --flag /.next

# Exclude specific file types
gitset tree --flag .png --flag .jpg --flag .gif

# Use .gitignore patterns for clean output
gitset tree --flag --gitignore

# Combine multiple exclusions
gitset tree --flag /node_modules --flag .test.js --flag .spec.js
```

### **Custom Template Workflow**

```bash
# Create custom template
gitset template --sync
# Enter your template format...
# Press Ctrl+D when done

# Use template for generation
gitset commit --custom

# View current template
gitset template --show
```

### **Historical Analysis Workflow**

```bash
# Use last 15 commits for style learning
gitset commit --historical --15

# Combine with other modes
gitset commit --all --historical --20
gitset commit --staged --custom --historical
```

---

## **Future Enhancements**

### **Planned Tools**

The template system is designed to support multiple tools:

1. **Commit Message Generator** (Current)
2. **Pull Request Maker** (Planned)
3. **Issues Crafter** (Planned)
4. **README Generator** (Planned)
5. **Sync & Backup** (Planned)
6. **Git Ignore Builder** (Planned)
7. **Code Decommenter** (Planned)

### **Upcoming Features**

* NPM package publication
* GitHub integration using OAuth tokens
* Team collaboration features
* IDE extensions and plugins
* Advanced ML-based style learning
* Multi-language support

---

## **Technical Details**

### **Platform Compatibility**

* **Operating Systems**: macOS, Linux, Windows
* **Node.js**: v14+ required
* **Git**: v2.0+ required

### **Configuration Storage**

* **Config location**: `~/.gitset/config.json`
* **Template location**: `~/.gitset/COMMIT-MSG-TEMPLATE.md`
* **Cross-platform**: Uses Node.js `os.homedir()` for path resolution

### **API Integration**

* **Endpoint**: `https://gitset-core-v2.vercel.app/api/engine`
* **Method**: POST
* **Authentication**: gitset_key in request body
* **Rate limiting**: Plan-based monthly quotas

### **AI Model**

* **Model**: Gemini 2.5 Flash
* **Provider**: Google Generative AI
* **Fallback**: Multi-key rotation system
* **Context**: Custom prompts with diff analysis

---

## **Security & Privacy**

* API keys never stored in git repositories
* User credentials encrypted in Turso
* Local config stored securely in user home directory
* OAuth tokens truncated in responses
* No sensitive data in logs (production mode)

---

## **Development & Debugging**

### **Historical Analysis Debug Mode**

When using `--historical`, CLI logs:
* Number of commits requested
* Number of commits retrieved
* Full list of commit messages analyzed

Example output:
```
📊 Historical Analysis Debug:
   Requested: 15 commits
   Retrieved: 15 commits
   Commits:
      1. feat(auth): implement JWT authentication
      2. fix(api): resolve CORS configuration issue
      ...
```

This logging helps developers understand:
* How commit history is retrieved
* What context is provided to AI
* Pattern analysis effectiveness

Debug logs can be removed in production builds while maintaining full functionality.

---

## **Support & Resources**

* **Documentation**: This file
* **Backend Repository**: gitset-core-v2
* **CLI Repository**: gitset-cli-npm
* **Database**: Turso (LibSQL)
* **AI Provider**: Google Gemini

---

## **Summary**

Gitset provides intelligent, AI-powered commit message generation with:

* **Three analysis modes**: unstaged, staged, all
* **Custom templates**: Define your project's style
* **Historical learning**: Learn from past commits
* **Native tree visualization**: No external dependencies required
* **Cross-platform**: Works on macOS, Linux, Windows
* **Secure**: Key-based authentication with quota management
* **Extensible**: Template system supports future tools
* **Smart AI**: Gemini 2.5 Flash with fallback system
* **Flexible filtering**: Advanced pattern matching for tree visualization

The system combines local git analysis, cloud-based validation, and AI generation to create consistent, high-quality commit messages that follow Conventional Commits standards while respecting project-specific styles and patterns.