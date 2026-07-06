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
        const cleanVersion = version.replace(/^v/, '');
        const parts = cleanVersion.split('.').map(Number);

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

        const patchedVersion = alert.security_advisory.patched_versions
            ? alert.security_advisory.patched_versions[0]
            : null;

        if (!patchedVersion) {
            return {
                level: this.RISK_LEVELS.HIGH,
                reason: 'Could not determine patched version',
                updateType: 'UNKNOWN'
            };
        }

        return {
            level: this.RISK_LEVELS.HIGH,
            targetVersion: patchedVersion.identifier,
            reason: 'Pending local file analysis'
        };
    }

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

                if (ecosystem === 'npm' || ecosystem === 'pip') {
                    risk = this.RISK_LEVELS.LOW;
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
