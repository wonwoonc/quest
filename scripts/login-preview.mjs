import {readFile, writeFile} from 'node:fs/promises';
export async function loginPreview() {
  const source = await readFile(new URL('../dist/quest.html', import.meta.url), 'utf8');
  const preview = source.replaceAll('quest:foundation:empty:v2', 'quest:preview:login:20261101')
    .replace('<html lang="ko"', '<html lang="ko" data-entry-screen="login"');
  await writeFile(new URL('../dist/login-preview.html', import.meta.url), preview);
}
await loginPreview();
