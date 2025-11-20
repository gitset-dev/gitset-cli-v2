const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const DependabotAnalyzer = require('../utils/dependabot-analyzer');

// Helper for colors
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color] || colors.reset}${msg}${colors.reset}`);
}

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

function getLocalVersion(dependencyName, manifestPath) {
    try {
        const fullPath = path.resolve(process.cwd(), manifestPath);
        if (!fs.existsSync(fullPath)) return null;

        const content = fs.readFileSync(fullPath, 'utf8');

        if (manifestPath.endsWith('package.json')) {
            const pkg = JSON.parse(content);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const version = deps[dependencyName];
            return version ? version.replace(/^[\^~]/, '') : null;
        }
        // Add other parsers (requirements.txt, etc.) as needed
        // For now, simple regex for requirements.txt
        if (manifestPath.endsWith('requirements.txt')) {
            const regex = new RegExp(`^${dependencyName}==(.*)$`, 'm');
            const match = content.match(regex);
            return match ? match[1] : null;
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function commandDependabotResolver(config, args) {
    // Check gh authentication
    const ghStatus = execCommand('gh auth status');
    if (!ghStatus && !config.github_token) {
        log('✗ GitHub CLI (gh) not authenticated and no token in config.', 'red');
        log('  Run "gh auth login" or "gitset auth".', 'yellow');
        return;
    }

    const analyzer = new DependabotAnalyzer();

    // Get repo info from git config
    // We can reuse the getGitConfig from release.js if we export it, or duplicate for now to keep independent
    let owner, repo;
    try {
        const remoteUrl = execCommand('git config --get remote.origin.url');
        const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
        if (match) {
            owner = match[1];
            repo = match[2];
        }
    } catch (e) {
        log('✗ Could not detect repository info', 'red');
        return;
    }

    if (!owner || !repo) {
        log('✗ Invalid repository info', 'red');
        return;
    }

    const subcommand = args[0] || 'list';

    if (subcommand === 'list' || subcommand === 'resolve') {
        log(`\n🔍 Fetching Dependabot alerts for ${owner}/${repo}...\n`, 'cyan');

        try {
            const alertsJson = execCommand(`gh api "/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100"`);
            if (!alertsJson) {
                log('✗ Failed to fetch alerts (check permissions/auth)', 'red');
                return;
            }

            const alerts = JSON.parse(alertsJson);

            if (!alerts || alerts.length === 0) {
                log('✓ No open Dependabot alerts found!', 'green');
                return;
            }

            const analyzedAlerts = [];

            for (const alert of alerts) {
                const depName = alert.dependency.package.name;
                const ecosystem = alert.dependency.package.ecosystem;
                const manifestPath = alert.dependency.manifest_path;

                // Get patched version
                const patchedVersion = alert.security_advisory.patched_versions[0]?.identifier;

                if (!patchedVersion) {
                    continue; // Skip if no fix available
                }

                // Get local version
                const localVersion = getLocalVersion(depName, manifestPath);

                let risk = { level: 'UNKNOWN', reason: 'Local version not found' };
                if (localVersion) {
                    risk = analyzer.calculateRisk(localVersion, patchedVersion, ecosystem);
                }

                analyzedAlerts.push({
                    id: alert.number,
                    depName,
                    localVersion: localVersion || '?',
                    patchedVersion,
                    severity: alert.security_advisory.severity,
                    risk,
                    manifestPath,
                    ecosystem,
                    url: alert.html_url
                });
            }

            // Display Table
            log('ID   | Severity | Dependency       | Version Delta       | Risk', 'blue');
            log('-----|----------|------------------|---------------------|----------------', 'blue');

            analyzedAlerts.forEach(a => {
                const delta = `${a.localVersion} -> ${a.patchedVersion}`;
                const riskColor = a.risk.level === 'RISK_NONE' ? 'green' :
                    a.risk.level === 'RISK_LOW_BEHAVIORAL' ? 'cyan' :
                        a.risk.level === 'RISK_MODERATE_API' ? 'yellow' : 'red';

                console.log(
                    `${a.id.toString().padEnd(4)} | ` +
                    `${a.severity.padEnd(8)} | ` +
                    `${a.depName.padEnd(16)} | ` +
                    `${delta.padEnd(19)} | ` +
                    `${colors[riskColor]}${a.risk.level}${colors.reset}`
                );
            });
            log('');

            if (subcommand === 'resolve') {
                const isDryRun = args.includes('--dry-run');
                const autoResolvable = analyzedAlerts.filter(a => a.risk.level === 'RISK_NONE');

                if (autoResolvable.length === 0) {
                    log('No RISK_NONE alerts found for auto-resolution.', 'yellow');
                    return;
                }

                log(`Found ${autoResolvable.length} auto-resolvable alerts (RISK_NONE).`, 'green');

                if (isDryRun) {
                    log('\n=== DRY RUN: Proposed Actions ===', 'magenta');
                    autoResolvable.forEach(alert => {
                        console.log(`\n[Alert #${alert.id}] ${alert.depName}`);
                        console.log(`  Branch: dependabot/gitset/${alert.depName}-${alert.patchedVersion}`);
                        console.log(`  PR Title: fix(deps): update ${alert.depName} to ${alert.patchedVersion}`);
                        console.log(`  Action: Create branch, Update ${alert.manifestPath}, Create PR`);
                    });
                    return;
                }

                const confirm = await askQuestion('Do you want to generate PRs for these alerts? (y/n): ');

                if (confirm.toLowerCase() === 'y') {
                    log('\n🚀 Generating PRs...', 'cyan');

                    for (const alert of autoResolvable) {
                        const branchName = `dependabot/gitset/${alert.depName}-${alert.patchedVersion}`;
                        const title = `fix(deps): update ${alert.depName} to ${alert.patchedVersion}`;
                        const body = `Resolves Dependabot alert #${alert.id}\n\nUpdate ${alert.depName} from ${alert.localVersion} to ${alert.patchedVersion}.\n\nRisk: ${alert.risk.level}\nReason: ${alert.risk.reason}`;

                        try {
                            // 1. Create Branch
                            const defaultBranch = execCommand('git symbolic-ref refs/remotes/origin/HEAD').split('/').pop().trim();
                            execCommand(`git checkout ${defaultBranch}`);
                            execCommand(`git pull`);
                            execCommand(`git checkout -b ${branchName}`);
                            log(`  ✓ Created branch ${branchName}`, 'green');

                            // 2. Update File
                            const fullPath = path.resolve(process.cwd(), alert.manifestPath);
                            if (fs.existsSync(fullPath)) {
                                let content = fs.readFileSync(fullPath, 'utf8');
                                let newContent = content;

                                if (alert.ecosystem === 'npm') {
                                    newContent = content.replace(new RegExp(`"${alert.depName}":\\s*"[^"]+"`), `"${alert.depName}": "${alert.patchedVersion}"`);
                                } else if (alert.ecosystem === 'pip') {
                                    newContent = content.replace(new RegExp(`^${alert.depName}==.*$`, 'm'), `${alert.depName}==${alert.patchedVersion}`);
                                }

                                if (newContent !== content) {
                                    fs.writeFileSync(fullPath, newContent);
                                    execCommand(`git add ${alert.manifestPath}`);
                                    execCommand(`git commit -m "${title}"`);
                                    execCommand(`git push -u origin ${branchName}`);
                                    log(`  ✓ Updated ${alert.manifestPath} and pushed`, 'green');

                                    // 3. Create PR
                                    const prUrl = execCommand(`gh pr create --title "${title}" --body "${body}" --base ${defaultBranch} --head ${branchName}`);
                                    if (prUrl) {
                                        log(`  ✨ PR Created: ${prUrl}`, 'green');
                                    } else {
                                        log(`  ✗ Failed to create PR`, 'red');
                                    }
                                } else {
                                    log(`  ⚠️  Could not replace version in ${alert.manifestPath}`, 'yellow');
                                }
                            } else {
                                log(`  ✗ File not found: ${alert.manifestPath}`, 'red');
                            }

                            // Cleanup: switch back
                            execCommand(`git checkout ${defaultBranch}`);

                        } catch (e) {
                            log(`  ✗ Failed to resolve ${alert.depName}: ${e.message}`, 'red');
                            execCommand(`git checkout -`); // Try to go back
                        }
                    }
                }
            }

        } catch (e) {
            log(`✗ Error: ${e.message}`, 'red');
        }
    } else {
        log('Usage: gitset dependabot-resolver [list|resolve]', 'yellow');
    }
}

module.exports = commandDependabotResolver;
