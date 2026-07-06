'use strict';

/**
 * `gitset license` — fully local, offline license generator.
 * No backend. Standard public license texts embedded; {year}/{owner}
 * substituted. Replaces the old remote /api/licenses path.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const readline = require('readline');

const tty = () => process.stdout.isTTY;
const c = (code, s) => (tty() ? `\x1b[${code}m${s}\x1b[0m` : s);
const ask = (q) => new Promise((r) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); r(a.trim()); });
});

const MIT = `MIT License

Copyright (c) {year} {owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const ISC = `ISC License

Copyright (c) {year} {owner}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;

const BSD2 = `BSD 2-Clause License

Copyright (c) {year}, {owner}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.
`;

const BSD3 = `BSD 3-Clause License

Copyright (c) {year}, {owner}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE
COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING IN ANY WAY
OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.
`;

const UNLICENSE = `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute
this software, either in source code form or as a compiled binary, for any
purpose, commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>
`;

const APACHE2_NOTICE = `                                 Apache License
                           Version 2.0, January 2004

Copyright (c) {year} {owner}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

NOTE: This is the standard Apache-2.0 short notice. Include the full license
text from https://www.apache.org/licenses/LICENSE-2.0.txt as required.
`;

const LICENSES = {
  mit: { name: 'MIT License', requiresOwner: true, text: MIT },
  isc: { name: 'ISC License', requiresOwner: true, text: ISC },
  'bsd-2-clause': { name: 'BSD 2-Clause', requiresOwner: true, text: BSD2 },
  'bsd-3-clause': { name: 'BSD 3-Clause', requiresOwner: true, text: BSD3 },
  'apache-2.0': { name: 'Apache License 2.0', requiresOwner: true, text: APACHE2_NOTICE },
  unlicense: { name: 'The Unlicense', requiresOwner: false, text: UNLICENSE },
};

function listIds() { return Object.keys(LICENSES); }

function getLicense(id, { owner = '', year = new Date().getFullYear() } = {}) {
  const lic = LICENSES[String(id).toLowerCase()];
  if (!lic) return null;
  return lic.text.replace(/\{year\}/g, String(year)).replace(/\{owner\}/g, owner || 'the authors');
}

function flag(argv, name) {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[i + 1] : null;
}

async function runLicenseCommand(argv) {
  const printList = () => {
    console.log('Available licenses:');
    for (const k of listIds()) console.log(`  ${k.padEnd(16)} ${LICENSES[k].name}`);
  };

  if (argv.includes('--list')) { printList(); return 0; }

  let id = flag(argv, '--id') || (argv[0] && !argv[0].startsWith('-') ? argv[0] : null);
  if (!id) {
    printList();
    if (!process.stdin.isTTY) { console.error(`${c('31', '✗')} Specify a license: gitset license --id mit --owner "Name"`); return 1; }
    id = (await ask('\nLicense id: ')).toLowerCase();
  }
  const lic = LICENSES[String(id).toLowerCase()];
  if (!lic) { console.error(`${c('31', '✗')} Unknown license "${id}". Try --list.`); return 1; }

  let owner = flag(argv, '--owner') || '';
  if (lic.requiresOwner && !owner) {
    let guess = '';
    try { guess = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8' }).trim(); } catch {  }
    if (!process.stdin.isTTY) owner = guess;
    else owner = (await ask(`Copyright holder${guess ? ` (${guess})` : ''}: `)) || guess;
    if (!owner) { console.error(`${c('31', '✗')} This license needs a copyright holder (--owner).`); return 1; }
  }

  const content = getLicense(id, { owner });
  const target = path.join(process.cwd(), 'LICENSE');
  if (fs.existsSync(target) && !argv.includes('--force')) {
    if (!process.stdin.isTTY) { console.error(`${c('31', '✗')} LICENSE exists. Use --force.`); return 1; }
    if ((await ask('LICENSE exists. Overwrite? [y/N] ')).toLowerCase() !== 'y') { console.log('Aborted.'); return 0; }
  }
  fs.writeFileSync(target, content);
  console.log(`${c('32', '✓')} Wrote LICENSE (${lic.name})`);
  return 0;
}

module.exports = { runLicenseCommand, getLicense, listIds, LICENSES };
