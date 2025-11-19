function generateBadges(analysis) {
    const badges = [];

    // Language Badge
    if (analysis.language !== 'Unknown') {
        badges.push(`![Language](https://img.shields.io/badge/language-${encodeURIComponent(analysis.language)}-blue.svg)`);
    }

    // Framework Badges
    analysis.frameworks.forEach(fw => {
        badges.push(`![Framework](https://img.shields.io/badge/framework-${encodeURIComponent(fw)}-green.svg)`);
    });

    // License Badge
    if (analysis.hasLicense) {
        badges.push(`![License](https://img.shields.io/badge/license-Existing-orange.svg)`);
    } else {
        badges.push(`![License](https://img.shields.io/badge/license-None-red.svg)`);
    }

    // CI/CD
    if (analysis.cicd.includes('GitHub Actions')) {
        badges.push(`![Build Status](https://img.shields.io/github/actions/workflow/status/${process.env.USER}/${analysis.name}/main.svg)`); // Approximation
    }

    return badges.join(' ');
}

module.exports = { generateBadges };
