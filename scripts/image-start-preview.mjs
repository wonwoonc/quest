import {readFile, writeFile} from 'node:fs/promises';
const source = await readFile(new URL('../dist/quest.html', import.meta.url), 'utf8');
// Explicit character route only. Paid development controls still require ?devCharacter=1.
const preview = source.replaceAll('quest:foundation:empty:v2', 'quest:preview:image-start:20261101')
  .replace('<html lang="ko"', '<html lang="ko" data-entry-screen="character"');
await writeFile(new URL('../dist/image-start.html', import.meta.url), preview);
console.log('Image setup preview ready; regular workspace unchanged.');
