
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

        if (v1.major === v2.major && v1.minor === v2.minor && v1.patch === v2.patch) return 'EQUAL';
        if (v2.major > v1.major) return 'MAJOR';
        if (v2.minor > v1.minor) return 'MINOR';
        if (v2.patch > v1.patch) return 'PATCH';
        return 'UNKNOWN';
    }

    analyzeRisk(alert) {
        const dependency = alert.dependency.package.name;
        const ecosystem = alert.dependency.package.ecosystem;
        
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
            case 'EQUAL':
                risk = this.RISK_LEVELS.NONE;
                reason = 'Already on patched version';
                break;
            case 'MAJOR':
                risk = this.RISK_LEVELS.HIGH;
                reason = 'Major version update - likely breaking changes';
                break;
            case 'MINOR':
                // Heuristic: Minor updates in some ecosystems are safer than others
                if (ecosystem === 'npm' || ecosystem === 'pip') {
                    risk = this.RISK_LEVELS.LOW; // Default to low for minor
                } else {
                    risk = this.RISK_LEVELS.MODERATE;
                }
                reason = 'Minor version update - check changelog for behavioral changes';
                break;
            case 'PATCH':
                risk = this.RISK_LEVELS.NONE; // Patch updates are usually safe
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
