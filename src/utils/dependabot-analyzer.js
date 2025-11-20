
class DependabotAnalyzer {
    constructor() {
        this.RISK_LEVELS = {
            NONE: 'RISK_NONE',
            LOW: 'RISK_LOW_BEHAVIORAL',
            MODERATE: 'RISK_MODERATE_API',
            HIGH: 'RISK_HIGH_BREAKING'
        };
    }

    parseSemver(version) {
        // Remove 'v' prefix if present
        const cleanVersion = version.replace(/^v/, '');
        const parts = cleanVersion.split('.').map(Number);

        // Handle incomplete versions (e.g., "1.2")
        while (parts.length < 3) {
            parts.push(0);
        }

        return {
            major: parts[0],
            minor: parts[1],
            patch: parts[2],
            original: version
        };
    }

    getUpdateType(current, target) {
        const v1 = this.parseSemver(current);
        const v2 = this.parseSemver(target);

        if (v2.major > v1.major) return 'MAJOR';
        if (v2.minor > v1.minor) return 'MINOR';
        if (v2.patch > v1.patch) return 'PATCH';
        return 'UNKNOWN';
    }

    analyzeRisk(alert) {
        const dependency = alert.dependency.package.name;
        const ecosystem = alert.dependency.package.ecosystem;
        const currentVersion = alert.dependency.manifest_path ? '0.0.0' : '0.0.0'; // Placeholder if not available directly
        // Note: Dependabot alerts API structure is complex. 
        // Usually we get the vulnerable range, but for resolution we need the fixed version.
        // The alert object usually contains 'security_advisory' and 'dependency'.

        // We need to infer the update path. 
        // Typically, we take the 'patched_versions' from security_advisory.
        const patchedVersion = alert.security_advisory.patched_versions
            ? alert.security_advisory.patched_versions[0] // Take the first patched version
            : null;

        // If we can't determine versions, default to HIGH risk for safety
        if (!patchedVersion) {
            return {
                level: this.RISK_LEVELS.HIGH,
                reason: 'Could not determine patched version',
                updateType: 'UNKNOWN'
            };
        }

        // We might not know the EXACT current version from the alert alone without looking at the file,
        // but we can infer risk from the patched version if we assume we are on the latest previous version.
        // However, a better approach for the CLI is to rely on what the user likely has.
        // For now, let's try to parse the 'first_patched_version' identifier.

        // In a real scenario, we would read the lockfile to get the current version.
        // For this implementation, we will rely on the fact that we are updating TO 'patchedVersion'.
        // We will assume the worst case for the current version if unknown, OR we can try to fetch it.
        // But to keep it simple and stateless:

        // Let's assume the alert provides enough info or we treat it conservatively.
        // Actually, the alert JSON often has `dependency.scope` and other details but not always the installed version 
        // unless we cross-reference with the repo.

        // Strategy:
        // 1. If we can't find current version, we can't do a delta.
        // 2. BUT, the user request says: "The tool will leverage... to retrieve active Dependabot alerts... and facilitate their resolution."
        // 3. We will rely on the `patched_versions` to see if it looks like a major bump from a "typical" version? 
        //    No, that's unsafe.

        // Improved Strategy:
        // We will return a "Pending Analysis" state if we lack file access, but since we are a CLI running LOCALLY,
        // we CAN read the local package.json/lock files to find the current version!
        // That is the key advantage of this CLI tool.

        return {
            level: this.RISK_LEVELS.HIGH, // Default to high until we verify with local files
            targetVersion: patchedVersion.identifier,
            reason: 'Pending local file analysis'
        };
    }

    // This method is called after we read the local file and know the current version
    calculateRisk(currentVersion, targetVersion, ecosystem) {
        const updateType = this.getUpdateType(currentVersion, targetVersion);
        let risk = this.RISK_LEVELS.HIGH;
        let reason = '';

        switch (updateType) {
            case 'MAJOR':
                risk = this.RISK_LEVELS.HIGH;
                reason = 'Major version update - likely breaking changes';
                break;
            case 'MINOR':
                // Heuristic: Minor updates in some ecosystems are safer than others
                if (ecosystem === 'npm' || ecosystem === 'pip') {
                    risk = this.RISK_LEVELS.LOW; // Default to low for minor
                    // TODO: Check changelogs here in future
                } else {
                    risk = this.RISK_LEVELS.MODERATE;
                }
                reason = 'Minor version update - check changelog for behavioral changes';
                break;
            case 'PATCH':
                risk = this.RISK_LEVELS.NONE;
                reason = 'Patch update - bug fixes only';
                break;
            default:
                risk = this.RISK_LEVELS.HIGH;
                reason = 'Unknown update type';
        }

        return {
            level: risk,
            reason,
            updateType
        };
    }
}

module.exports = DependabotAnalyzer;
