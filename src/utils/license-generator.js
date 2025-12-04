const fs = require('fs');
const path = require('path');

const LICENSES_API_URL = 'https://gitset-core-v2.vercel.app/api/licenses';

async function fetchLicenses() {
    try {
        const res = await fetch(LICENSES_API_URL);
        if (!res.ok) throw new Error('Failed to fetch licenses');
        return await res.json();
    } catch (error) {
        return [];
    }
}

async function generateLicenseContent(licenseId, year, owner) {
    try {
        const res = await fetch(LICENSES_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'generate',
                licenseId,
                year,
                owner
            })
        });
        if (!res.ok) throw new Error('Failed to generate license');
        const data = await res.json();
        return data.content;
    } catch (error) {
        return null;
    }
}

module.exports = { fetchLicenses, generateLicenseContent };
