import {readFile, writeFile, access} from 'node:fs/promises';
const old = new URL('../../quest/index.html', import.meta.url);
const backup = new URL('../../quest/index-before-preview-sync.html', import.meta.url);
try { await access(backup); } catch { await writeFile(backup, await readFile(old)); }
await writeFile(old, await readFile(new URL('../dist/quest.html', import.meta.url)));
console.log('Legacy preview updated; original retained in index-before-preview-sync.html');
