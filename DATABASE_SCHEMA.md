# Database Analysis: gitset

**Generated:** 30/11/2025, 12:53:09

## Statistics

- **Total Tables:** 22
- **Total Rows:** 1261
- **Total Indexes:** 28
- **Total Triggers:** 0

---

## Tables

### commit_drafts

**Row Count:** 22

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| repo_context | TEXT | ✗ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### commit_settings

**Row Count:** 0

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| default_template | TEXT | ✗ | - | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### commit_versions

**Row Count:** 29

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| draft_id | TEXT | ✓ | - | ✗ |
| content | TEXT | ✓ | - | ✗ |
| instruction | TEXT | ✗ | - | ✗ |
| version_number | INTEGER | ✓ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| draft_id | commit_drafts | id |

### credentials

**Row Count:** 5

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| gitset_key | TEXT | ✓ | - | ✗ |
| github_oauth_token | TEXT | ✗ | - | ✗ |
| user_plan | TEXT | ✓ | 'basic' | ✗ |
| created_at | TEXT | ✗ | datetime('now') | ✗ |
| avatar_url | TEXT | ✗ | - | ✗ |
| username | TEXT | ✗ | - | ✗ |

### debug

**Row Count:** 64

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| user_plan | TEXT | ✓ | - | ✗ |
| created_at | DATETIME | ✓ | datetime('now') | ✗ |
| tool_name | TEXT | ✓ | - | ✗ |
| request_id | TEXT | ✓ | - | ✗ |
| user_query | TEXT | ✓ | - | ✗ |
| user_query_raw | TEXT | ✓ | - | ✗ |
| user_query_metadata | TEXT | ✗ | - | ✗ |
| cli_response | TEXT | ✓ | - | ✗ |
| cli_response_metadata | TEXT | ✗ | - | ✗ |
| ai_context_full | TEXT | ✓ | - | ✗ |
| ai_context_metadata | TEXT | ✗ | - | ✗ |
| ai_prompt_tokens | INTEGER | ✗ | - | ✗ |
| ai_raw_response | TEXT | ✓ | - | ✗ |
| ai_parsed_response | TEXT | ✓ | - | ✗ |
| ai_model_used | TEXT | ✗ | 'gemini-2.5-flash' | ✗ |
| ai_api_key_index | INTEGER | ✗ | - | ✗ |
| ai_generation_attempts | INTEGER | ✗ | 1 | ✗ |
| ai_response_tokens | INTEGER | ✗ | - | ✗ |
| processing_time_ms | INTEGER | ✗ | - | ✗ |
| backend_version | TEXT | ✗ | - | ✗ |
| cli_version | TEXT | ✗ | - | ✗ |
| error_occurred | BOOLEAN | ✗ | 0 | ✗ |
| error_message | TEXT | ✗ | - | ✗ |
| error_type | TEXT | ✗ | - | ✗ |
| counted_in_quota | BOOLEAN | ✗ | 0 | ✗ |

### gitignore_templates

**Row Count:** 264

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| category | TEXT | ✓ | - | ✗ |
| subcategory | TEXT | ✗ | - | ✗ |
| name | TEXT | ✓ | - | ✗ |
| filename | TEXT | ✓ | - | ✗ |
| content | JSON | ✓ | - | ✗ |
| created_at | INTEGER | ✗ | unixepoch() | ✗ |
| updated_at | INTEGER | ✗ | unixepoch() | ✗ |

### issue_drafts

**Row Count:** 58

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| repo_context | TEXT | ✗ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### issue_settings

**Row Count:** 1

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| default_template | TEXT | ✗ | - | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### issue_versions

**Row Count:** 142

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| draft_id | TEXT | ✓ | - | ✗ |
| field_type | TEXT | ✓ | - | ✗ |
| content | TEXT | ✓ | - | ✗ |
| version_number | INTEGER | ✓ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| draft_id | issue_drafts | id |

### login_logs

**Row Count:** 5

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✓ | - | ✓ |
| session_id | TEXT | ✗ | - | ✗ |
| user_id | INTEGER | ✗ | - | ✗ |
| strategy | TEXT | ✓ | - | ✗ |
| browser | TEXT | ✓ | - | ✗ |
| device | TEXT | ✓ | - | ✗ |
| os | TEXT | ✓ | - | ✗ |
| ip | TEXT | ✓ | - | ✗ |
| logged_in_at | TEXT | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| user_id | credentials | id |
| session_id | sessions | id |

### message_usage

**Row Count:** 499

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| created_at | TEXT | ✗ | datetime('now') | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| user_email | credentials | user_email |

### pr_drafts

**Row Count:** 25

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| repo_context | TEXT | ✗ | - | ✗ |
| base_branch | TEXT | ✗ | - | ✗ |
| head_branch | TEXT | ✗ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### pr_settings

**Row Count:** 1

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| default_template | TEXT | ✗ | - | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### pr_versions

**Row Count:** 61

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| draft_id | TEXT | ✓ | - | ✗ |
| field_type | TEXT | ✓ | - | ✗ |
| content | TEXT | ✓ | - | ✗ |
| version_number | INTEGER | ✓ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| draft_id | pr_drafts | id |

### readme_drafts

**Row Count:** 25

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| repo_context | TEXT | ✗ | - | ✗ |
| project_name | TEXT | ✗ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### readme_settings

**Row Count:** 1

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| default_template | TEXT | ✗ | - | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### readme_versions

**Row Count:** 39

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| draft_id | TEXT | ✓ | - | ✗ |
| section | TEXT | ✗ | 'full' | ✗ |
| content | TEXT | ✓ | - | ✗ |
| version_number | INTEGER | ✓ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| draft_id | readme_drafts | id |

### release_drafts

**Row Count:** 5

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✗ | - | ✓ |
| user_email | TEXT | ✓ | - | ✗ |
| repo_owner | TEXT | ✗ | - | ✗ |
| repo_name | TEXT | ✗ | - | ✗ |
| tag_name | TEXT | ✗ | - | ✗ |
| target_branch | TEXT | ✗ | - | ✗ |
| title | TEXT | ✗ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### release_settings

**Row Count:** 0

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| default_template | TEXT | ✗ | - | ✗ |
| version_scheme | TEXT | ✗ | 'semver' | ✗ |
| auto_link_issues | BOOLEAN | ✗ | 1 | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### release_versions

**Row Count:** 9

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | INTEGER | ✗ | - | ✓ |
| draft_id | TEXT | ✓ | - | ✗ |
| content | TEXT | ✓ | - | ✗ |
| instruction | TEXT | ✗ | - | ✗ |
| version_number | INTEGER | ✓ | - | ✗ |
| created_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| draft_id | release_drafts | id |

### repo_settings

**Row Count:** 1

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| user_email | TEXT | ✗ | - | ✓ |
| labels_template | TEXT | ✗ | - | ✗ |
| about_draft | TEXT | ✗ | - | ✗ |
| backup_config | TEXT | ✗ | - | ✗ |
| updated_at | DATETIME | ✗ | CURRENT_TIMESTAMP | ✗ |

### sessions

**Row Count:** 5

#### Columns

| Name | Type | Not Null | Default | Primary Key |
|------|------|----------|---------|-------------|
| id | TEXT | ✓ | - | ✓ |
| userId | INTEGER | ✗ | - | ✗ |
| expires_at | INTEGER | ✓ | - | ✗ |

#### Foreign Keys

| Column | References Table | References Column |
|--------|------------------|-------------------|
| userId | credentials | id |

---

## Indexes

### credentials_gitset_key_unique

**Table:** credentials

**Columns:** gitset_key

**SQL:**
```sql
CREATE UNIQUE INDEX `credentials_gitset_key_unique` ON `credentials` (`gitset_key`)
```

### credentials_user_email_unique

**Table:** credentials

**Columns:** user_email

**SQL:**
```sql
CREATE UNIQUE INDEX `credentials_user_email_unique` ON `credentials` (`user_email`)
```

### idx_category

**Table:** gitignore_templates

**Columns:** category

**SQL:**
```sql
CREATE INDEX idx_category ON gitignore_templates(category)
```

### idx_category_name

**Table:** gitignore_templates

**Columns:** category, name

**SQL:**
```sql
CREATE INDEX idx_category_name ON gitignore_templates(category, name)
```

### idx_commit_settings_user

**Table:** commit_settings

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_commit_settings_user ON commit_settings(user_email)
```

### idx_commit_versions_draft

**Table:** commit_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_commit_versions_draft ON commit_versions(draft_id)
```

### idx_debug_errors

**Table:** debug

**Columns:** error_occurred, created_at

**SQL:**
```sql
CREATE INDEX idx_debug_errors ON debug(error_occurred, created_at DESC) WHERE error_occurred = 1
```

### idx_debug_performance

**Table:** debug

**Columns:** processing_time_ms

**SQL:**
```sql
CREATE INDEX idx_debug_performance ON debug(processing_time_ms DESC)
```

### idx_debug_quota

**Table:** debug

**Columns:** counted_in_quota, created_at

**SQL:**
```sql
CREATE INDEX idx_debug_quota ON debug(counted_in_quota, created_at DESC)
```

### idx_debug_request_id

**Table:** debug

**Columns:** request_id

**SQL:**
```sql
CREATE INDEX idx_debug_request_id ON debug(request_id)
```

### idx_debug_tool_name

**Table:** debug

**Columns:** tool_name, created_at

**SQL:**
```sql
CREATE INDEX idx_debug_tool_name ON debug(tool_name, created_at DESC)
```

### idx_debug_user_date

**Table:** debug

**Columns:** user_email, created_at

**SQL:**
```sql
CREATE INDEX idx_debug_user_date ON debug(user_email, created_at DESC)
```

### idx_debug_user_tool

**Table:** debug

**Columns:** user_email, tool_name, created_at

**SQL:**
```sql
CREATE INDEX idx_debug_user_tool ON debug(user_email, tool_name, created_at DESC)
```

### idx_gitset_key

**Table:** credentials

**Columns:** gitset_key

**SQL:**
```sql
CREATE INDEX idx_gitset_key ON credentials(gitset_key)
```

### idx_issue_settings_user

**Table:** issue_settings

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_issue_settings_user ON issue_settings(user_email)
```

### idx_issue_versions_draft

**Table:** issue_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_issue_versions_draft ON issue_versions(draft_id)
```

### idx_message_usage_date

**Table:** message_usage

**Columns:** user_email, created_at

**SQL:**
```sql
CREATE INDEX idx_message_usage_date ON message_usage(user_email, created_at)
```

### idx_name

**Table:** gitignore_templates

**Columns:** name

**SQL:**
```sql
CREATE INDEX idx_name ON gitignore_templates(name)
```

### idx_pr_settings_user

**Table:** pr_settings

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_pr_settings_user ON pr_settings(user_email)
```

### idx_pr_versions_draft

**Table:** pr_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_pr_versions_draft ON pr_versions(draft_id)
```

### idx_readme_settings_user

**Table:** readme_settings

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_readme_settings_user ON readme_settings(user_email)
```

### idx_readme_versions_draft

**Table:** readme_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_readme_versions_draft ON readme_versions(draft_id)
```

### idx_release_drafts_user

**Table:** release_drafts

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_release_drafts_user ON release_drafts(user_email)
```

### idx_release_versions_draft

**Table:** release_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_release_versions_draft ON release_versions(draft_id)
```

### idx_repo_settings_user

**Table:** repo_settings

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_repo_settings_user ON repo_settings(user_email)
```

### idx_user_email

**Table:** credentials

**Columns:** user_email

**SQL:**
```sql
CREATE INDEX idx_user_email ON credentials(user_email)
```

### idx_versions_draft

**Table:** issue_versions

**Columns:** draft_id

**SQL:**
```sql
CREATE INDEX idx_versions_draft ON issue_versions(draft_id)
```

### login_logs_user_id_idx

**Table:** login_logs

**Columns:** user_id

**SQL:**
```sql
CREATE INDEX `login_logs_user_id_idx` ON `login_logs` (`user_id`)
```

