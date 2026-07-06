const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DependabotAnalyzer = require('../utils/dependabot-analyzer');
const { log, askQuestion, selectOption, colors } = require('../utils/ui');

function execCommand(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (err) {
        return null;
    }
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

        if (manifestPath.endsWith('package-lock.json')) {
            const lock = JSON.parse(content);

            if (lock.packages) {
                const pkgKey = `node_modules/${dependencyName}`;
                if (lock.packages[pkgKey]) {
                    return lock.packages[pkgKey].version;
                }
            }

            if (lock.dependencies && lock.dependencies[dependencyName]) {
                return lock.dependencies[dependencyName].version;
            }
            return null;
        }

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

async function fetchAlerts(owner, repo, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`;
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('Unauthorized (check token scopes)');
            if (response.status === 403) throw new Error('Forbidden (check permissions/dependabot access)');
            if (response.status === 404) throw new Error('Repo not found or no access');
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (e) {
        throw e;
    }
}

async function commandDependabotResolver(config, args) {
    const token = config?.github_token;
    const ghStatus = execCommand('gh auth status');

    if (!token && !ghStatus) {
        log('✗ No GitHub authentication found.', 'red');
        log('  Run "gh auth login" (GitHub CLI) and try again.', 'yellow');
        return 1;
    }

    const analyzer = new DependabotAnalyzer();

    let owner, repo;
    try {
        const remoteUrl = execCommand('git config --get remote.origin.url');
        if (!remoteUrl) throw new Error('No remote origin found');

        const match = remoteUrl.match(/[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
        if (match) {
            owner = match[1];
            repo = match[2];
        }
    } catch (e) {
        log('✗ Could not detect repository info from git config', 'red');
        return;
    }

    if (!owner || !repo) {
        log('✗ Invalid repository info detected', 'red');
        return;
    }

    const shouldResolve = args.includes('--resolve');
    const subcommand = shouldResolve ? 'resolve' : 'list';

    if (subcommand === 'list' || subcommand === 'resolve') {
        log(`\n→ Fetching Dependabot alerts for ${owner}/${repo}...\n`, 'cyan');

        try {
            let alerts = [];
            let tokenError = null;

            if (token) {
                try {
                    alerts = await fetchAlerts(owner, repo, token);
                } catch (e) {
                    tokenError = e;

                    if (e.message.includes('Unauthorized') || e.message.includes('Forbidden')) {
                        log(`⚠ Stored token failed (${e.message}).`, 'yellow');
                        log('→ Falling back to local "gh" CLI...', 'cyan');
                    } else {
                        throw e;
                    }
                }
            }

            if (!token || (tokenError && (tokenError.message.includes('Unauthorized') || tokenError.message.includes('Forbidden')))) {
                try {
                    const alertsJson = execCommand(`gh api "/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100"`);
                    if (!alertsJson) {
                        throw new Error('Failed to fetch alerts via gh CLI (check "gh auth status" and scopes)');
                    }
                    alerts = JSON.parse(alertsJson);
                } catch (ghError) {
                    if (tokenError) {
                        throw new Error(`Both methods failed.\n  Token: ${tokenError.message}\n  CLI: ${ghError.message}\n  (Note: Dependabot alerts require 'security_events' scope)`);
                    } else {
                        throw ghError;
                    }
                }
            }

            if (!alerts || alerts.length === 0) {
                log('✓ No open Dependabot alerts found!', 'green');
                return;
            }

            const analyzedAlerts = [];

            for (const alert of alerts) {
                const depName = alert.dependency.package.name;
                const ecosystem = alert.dependency.package.ecosystem;
                const manifestPath = alert.dependency.manifest_path;

                let patchedVersion = null;

                if (alert.security_vulnerability && alert.security_vulnerability.first_patched_version) {
                    patchedVersion = alert.security_vulnerability.first_patched_version.identifier;
                }

                else if (alert.security_advisory && alert.security_advisory.vulnerabilities) {
                    const v = alert.security_advisory.vulnerabilities.find(v => v.package.name === depName);
                    if (v && v.first_patched_version) {
                        patchedVersion = v.first_patched_version.identifier;
                    }
                }

                else if (alert.security_advisory && alert.security_advisory.patched_versions && alert.security_advisory.patched_versions.length > 0) {
                    patchedVersion = alert.security_advisory.patched_versions[0].identifier;
                }

                if (!patchedVersion) {
                    continue;
                }

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

            log('ID   | Severity | Dependency       | Version Delta       | Risk', 'blue');
            log('-----|----------|------------------|---------------------|----------------', 'blue');

            analyzedAlerts.forEach(a => {
                const delta = `${a.localVersion} -> ${a.patchedVersion}`;
                const riskColor = a.risk.level === 'RISK_NONE' ? 'green' :
                    a.risk.level === 'RISK_LOW_BEHAVIORAL' ? 'cyan' :
                        a.risk.level === 'RISK_MODERATE_API' ? 'yellow' : 'red';

                const paint = colors[riskColor] || ((s) => s);
                console.log(
                    `${a.id.toString().padEnd(4)} | ` +
                    `${a.severity.padEnd(8)} | ` +
                    `${a.depName.padEnd(16)} | ` +
                    `${delta.padEnd(19)} | ` +
                    paint(a.risk.level)
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
                    log('\n=== DRY RUN: Proposed Actions ===', 'pink');
                    autoResolvable.forEach(alert => {
                        console.log(`\n[Alert #${alert.id}] ${alert.depName}`);
                        console.log(`  Update: ${alert.localVersion} -> ${alert.patchedVersion}`);
                        console.log(`  Action: Update ${alert.manifestPath} locally`);
                    });
                    return;
                }

                const confirm = await askQuestion('Do you want to apply these updates locally? (y/n): ');

                if (confirm.toLowerCase() === 'y') {
                    log('\n→ Applying updates...', 'cyan');

                    for (const alert of autoResolvable) {
                        log(`\n[${alert.depName}] Updating to ${alert.patchedVersion}...`, 'blue');

                        try {
                            if (alert.ecosystem === 'npm') {
                                const pkgPath = path.resolve(process.cwd(), 'package.json');
                                let saveDev = false;
                                if (fs.existsSync(pkgPath)) {
                                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                                    if (pkg.devDependencies && pkg.devDependencies[alert.depName]) {
                                        saveDev = true;
                                    }
                                }

                                try {
                                    execCommand(`npm install ${alert.depName}@${alert.patchedVersion} ${saveDev ? '--save-dev' : ''}`);
                                    log(`  ✓ Updated ${alert.depName}`, 'green');
                                } catch (err) {
                                    log(`  ✗ npm install failed: ${err.message}`, 'red');
                                    throw err;
                                }
                            } else {
                                const fullPath = path.resolve(process.cwd(), alert.manifestPath);
                                if (fs.existsSync(fullPath)) {
                                    let content = fs.readFileSync(fullPath, 'utf8');
                                    let newContent = content;

                                    if (alert.ecosystem === 'pip') {
                                        newContent = content.replace(new RegExp(`^${alert.depName}==.*$`, 'm'), `${alert.depName}==${alert.patchedVersion}`);
                                    }

                                    if (newContent !== content) {
                                        fs.writeFileSync(fullPath, newContent);
                                        log(`  ✓ Updated ${alert.manifestPath}`, 'green');
                                    } else {
                                        log(`  → Could not replace version in ${alert.manifestPath}`, 'yellow');
                                    }
                                } else {
                                    log(`  ✗ File not found: ${alert.manifestPath}`, 'red');
                                }
                            }
                        } catch (e) {
                            log(`  ✗ Failed to resolve ${alert.depName}: ${e.message}`, 'red');
                        }
                    }

                    log('\n✓ Updates completed!', 'green');
                    log('● Run "gitset commit" to review and commit these changes.', 'pink');
                }
            }
        } catch (e) {
            log(`✗ Error: ${e.message}`, 'red');
            if (e.message.includes('404')) {
                log('  (Make sure Dependabot alerts are enabled for this repo)', 'yellow');
            }
        }
    } else {
        log('Usage: gitset dependabot [--resolve]', 'yellow');
    }
}

module.exports = commandDependabotResolver;
