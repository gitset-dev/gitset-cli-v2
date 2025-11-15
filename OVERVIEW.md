# ⭐ **Complete Gitset Flow (WebApp → Turso → CLI → Core Backend)**

### **Simplified explanation, no code**

---

### **1. User authenticates in the Gitset WebApp**

The WebApp obtains and stores in Turso:

* **gitset_key**
* **user_email**
* **user_plan** (basic / pro / enterprise)
* **github_oauth_token**

This data is stored in the `credentials` table.

---

### **2. User installs the CLI or NPM package (gitset-cli-npm)**

* Not yet published; tested with `npm link`.
* This CLI lives separately from the backend (`gitset-core-v2`), though they work together.

---

### **3. User runs `gitset auth` in their terminal**

* The CLI asks for the **Gitset Key**.
* The CLI calls `gitset-core-v2` → `/validate`.
* The backend searches for the key in Turso:
  * If it exists, returns email, plan, and GitHub token.
* The CLI saves this info in `~/.gitset/config.json`.

---

### **4. User makes changes to their repository and executes:**

**Three analysis modes available:**

* `gitset commit` → analyzes **unstaged changes** (working directory)
* `gitset commit --staged` → analyzes **staged changes only**
* `gitset commit --all` → analyzes **both staged and unstaged changes**

Optional flag:
* `gitset commit --custom` → includes commit history analysis for style consistency

The CLI inspects the local repo:
* modified files
* content before/after
* diff
* history (if using custom mode)

---

### **5. CLI sends changes to Gitset Core backend**

Payload:

* gitset_key
* changes (file status, before/after content)
* diff (full git diff)
* commit_history (if custom mode enabled)

---

### **6. Backend validates the Gitset Key again**

Queries Turso to confirm:

* key exists
* user plan
* email
* OAuth token

Then checks **monthly quota based on plan** and updates it.

---

### **7. Backend processes the changes**

* Summarizes added, modified, or deleted files.
* Calculates additions and deletions.
* Builds a structured prompt for the AI generator.

---

### **8. Backend calls Gemini AI**

* Uses a **multi-key system with fallback**.
* Generates the commit message.
* Cleans and standardizes the format.

---

### **9. Backend responds to CLI**

Includes:

* commit_message (in Conventional Commits format)
* quota information (used/remaining)
* change statistics (files, additions, deletions)

---

### **10. CLI displays it to the user**, ready to copy/paste into `git commit -m`.

---

# 🧩 **BRIEF FLOW SUMMARY**

**WebApp → Turso → CLI → Core Backend → Gemini → Backend → CLI**

1. WebApp saves credentials in Turso
2. CLI validates Gitset Key
3. CLI sends changes (unstaged, staged, or all)
4. Backend validates and controls quotas
5. Backend generates commit message using Gemini AI
6. CLI receives and displays it

---

## 📋 **Command Reference**

### Authentication
* `gitset auth` - Authenticate with your Gitset Key
* `gitset verify` - Verify connection with server
* `gitset logout` - Close session

### Commit Message Generation
* `gitset commit` - Analyze unstaged changes (default)
* `gitset commit --staged` - Analyze staged changes only
* `gitset commit --all` - Analyze all changes (staged + unstaged)
* `gitset commit --custom` - Include commit history for style consistency

### Utilities
* `gitset status` - View repository and authentication status
* `gitset tree` - Display project structure
* `gitset help` - Show available commands

---

## 🎯 **Key Features**

### Multi-mode Analysis
The CLI intelligently analyzes different change states:
- **Unstaged mode**: Focus on working directory changes before staging
- **Staged mode**: Generate messages for what's about to be committed
- **All mode**: Comprehensive analysis of entire repository state

### Smart AI Generation
- Uses Gemini 2.5 Flash model
- Multiple API keys with automatic fallback
- Custom mode learns from commit history for consistent style
- Generates Conventional Commits format messages

### Quota Management
Plan-based monthly limits:
- **Basic**: 50 messages (non-renewable)
- **Pro**: 200 messages (monthly renewable)
- **Enterprise**: 600 messages (monthly renewable)

### Secure Authentication
- Gitset Key validation against Turso database
- Local config storage in `~/.gitset/config.json`
- GitHub OAuth token integration for future features

---

## 🏗️ **Architecture**

### Components
1. **WebApp** - User authentication and key generation
2. **Turso DB** - Credential and usage tracking
3. **CLI** - Local git analysis and user interface
4. **Core Backend** - API validation, quota control, AI integration
5. **Gemini AI** - Commit message generation

### Data Flow
```
User changes → CLI analysis → Backend validation → 
AI generation → Backend response → CLI display
```

---

## 🔒 **Security & Privacy**

- API keys never stored in git repositories
- User credentials encrypted in Turso
- Local config stored securely in user home directory
- OAuth tokens truncated in responses for security

---

## 📊 **Database Schema**

### credentials table
- gitset_key (primary)
- user_email
- user_plan
- github_oauth_token
- created_at

### message_usage table
- user_email
- created_at
- (tracked per month for quota limits)

---

## 🚀 **Future Enhancements**

- NPM package publication
- GitHub integration features using OAuth token
- Advanced custom mode with ML-based style learning
- Team collaboration features
- IDE extensions and plugins