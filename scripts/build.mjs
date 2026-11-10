// Dependency-free, restricted ESM bundler for this project's named imports/exports.
// Each module gets its OWN function scope; no concatenated implicit shared globals.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function bundle(entry) {
  const modules = new Map();
  async function visit(name) {
    if (modules.has(name)) return;
    modules.set(name, '');
    let code = await readFile(path.join(root, 'src', name), 'utf8');
    const deps = [];
    code = code.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?$/gm, (_, bindings, spec) => {
      if (!spec.startsWith('.')) throw new Error('External dependency not permitted');
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      if (dep.startsWith('../')) throw new Error('Dependency escapes src');
      deps.push(dep); return `const {${bindings}} = __require(${JSON.stringify(dep)});`;
    });
    const exports = [];
    code = code.replace(/^export\s+(function|const)\s+(\w+)/gm, (_, kind, name) => { exports.push(name); return kind+' '+name; });
    if (/^\s*(import|export)\s+(?!:)/m.test(code) || /\bimport\s*\(\s*['"]/.test(code)) throw new Error('Unsupported module syntax: '+name);
    modules.set(name, `function(__require,__exports){\n"use strict";\n${code}\nObject.assign(__exports,{${exports.join(',')}});\n}`);
    for (const dep of deps) await visit(dep);
  }
  await visit(entry);
  return `(function(){"use strict";\nconst modules={${[...modules].map(([k,v]) => JSON.stringify(k)+':'+v).join(',\n')}};\nconst cache=Object.create(null);\nfunction __require(id){if(cache[id])return cache[id];const out=cache[id]={};modules[id](__require,out);return out;}\n__require(${JSON.stringify(entry)});\n})();`;
}
export async function build() {
  const shell = await readFile(path.join(root,'src/shell.html'),'utf8');
  await mkdir(path.join(root,'dist'),{recursive:true});
  for (const [entry, output, dev] of [['entry.js','quest.html','index.html'], ['demo-entry.js','quest-demo.html','demo.html']]) {
    const js = await bundle(entry);
    // Escape closing-script sequences embedded in user-facing strings.
    await writeFile(path.join(root,'dist',output), shell.replace('<!--APP_ENTRY-->', '<script>\n'+js.replace(/<\/script/gi,'<\\/script')+'\n</script>'));
    await writeFile(path.join(root,dev),shell.replace('<!--APP_ENTRY-->',`<script type="module" src="./src/${entry}"></script>`));
  }
  const source = await readFile(path.join(root,'dist/quest.html'),'utf8');
  for (const [file,key,screen] of [['login-preview','login','login'],['image-start','image-start','character']]) {
    await writeFile(path.join(root,'dist',file+'.html'),source.replaceAll('quest:foundation:empty:v2',`quest:preview:${key}:20261101`).replace('<html lang="ko"',`<html lang="ko" data-entry-screen="${screen}"`));
  }
  // Public trial for ebook readers: same bundle, trial edition switched on (wording, onboarding, hidden social parts).
  await writeFile(path.join(root,'dist/quest-tester.html'),source.replace('<title>퀘스트 v3</title>','<title>퀘스트 테스트판</title>').replace('<html lang="ko"','<html lang="ko" data-edition="trial"'));
  console.log('Built dist/quest.html + dist/quest-demo.html; dev index.html + demo.html');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
