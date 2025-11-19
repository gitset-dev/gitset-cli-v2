const fs = require('fs');
const path = require('path');

function analyzeRepo(rootDir) {
    const analysis = {
        name: path.basename(rootDir),
        language: 'Unknown',
        frameworks: [],
        dependencies: [],
        testFrameworks: [],
        cicd: [],
        packageManager: 'Unknown',
        hasDocker: fs.existsSync(path.join(rootDir, 'Dockerfile')),
        hasLicense: fs.existsSync(path.join(rootDir, 'LICENSE')) || fs.existsSync(path.join(rootDir, 'LICENSE.md')),
    };

    // Node.js
    if (fs.existsSync(path.join(rootDir, 'package.json'))) {
        analysis.language = 'JavaScript/TypeScript';
        analysis.packageManager = fs.existsSync(path.join(rootDir, 'yarn.lock')) ? 'yarn' : 'npm';
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
            analysis.name = pkg.name || analysis.name;
            analysis.description = pkg.description;

            const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
            analysis.dependencies = Object.keys(allDeps);

            // Detect Frameworks
            if (allDeps['react']) analysis.frameworks.push('React');
            if (allDeps['vue']) analysis.frameworks.push('Vue');
            if (allDeps['next']) analysis.frameworks.push('Next.js');
            if (allDeps['express']) analysis.frameworks.push('Express');
            if (allDeps['nest']) analysis.frameworks.push('NestJS');

            // Detect Testing
            if (allDeps['jest']) analysis.testFrameworks.push('Jest');
            if (allDeps['mocha']) analysis.testFrameworks.push('Mocha');
            if (allDeps['cypress']) analysis.testFrameworks.push('Cypress');
        } catch (e) {
            console.error('Error parsing package.json:', e.message);
        }
    }

    // Python
    if (fs.existsSync(path.join(rootDir, 'requirements.txt'))) {
        analysis.language = 'Python';
        analysis.packageManager = 'pip';
        const reqs = fs.readFileSync(path.join(rootDir, 'requirements.txt'), 'utf8');
        if (reqs.includes('django')) analysis.frameworks.push('Django');
        if (reqs.includes('flask')) analysis.frameworks.push('Flask');
        if (reqs.includes('fastapi')) analysis.frameworks.push('FastAPI');
    }

    // Go
    if (fs.existsSync(path.join(rootDir, 'go.mod'))) {
        analysis.language = 'Go';
        analysis.packageManager = 'go modules';
    }

    // Rust
    if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) {
        analysis.language = 'Rust';
        analysis.packageManager = 'cargo';
    }

    // CI/CD
    if (fs.existsSync(path.join(rootDir, '.github/workflows'))) {
        analysis.cicd.push('GitHub Actions');
    }
    if (fs.existsSync(path.join(rootDir, '.travis.yml'))) {
        analysis.cicd.push('Travis CI');
    }

    return analysis;
}

module.exports = { analyzeRepo };
