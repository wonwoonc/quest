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
    code = code.replace(/^export\s+(async\s+function|function|const)\s+(\w+)/gm, (_, kind, name) => { exports.push(name); return kind+' '+name; });
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
  await writeFile(path.join(root,'dist/quest-tester.html'),source.replace('<title>퀘스트</title>','<title>퀘스트 테스트판</title>').replace('<html lang="ko"','<html lang="ko" data-edition="trial"'));
  // Cloudflare Pages: 출시판(본판 1.0 + 로그인)을 index.html로 둔 배포 폴더. 대시보드에 폴더째 올리거나 Git 연결 시 출력 폴더로 지정.
  const cf = path.join(root,'dist/cloudflare'); await mkdir(cf,{recursive:true});
  // 배포판: 본판 화면 + Supabase 로그인·동기화(cloud-entry.js). 아티팩트용 dist/quest.html은 서버 연결 없이 그대로 둔다.
  const cloudJs = await bundle('cloud-entry.js');
  await writeFile(path.join(cf,'index.html'),shell.replace('<!--APP_ENTRY-->', '<script>\n'+cloudJs.replace(/<\/script/gi,'<\\/script')+'\n</script>'));
  await writeFile(path.join(cf,'_headers'),`/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), payment=()
  Strict-Transport-Security: max-age=31536000
/
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`);
  console.log('Built dist/quest.html + dist/quest-demo.html; dev index.html + demo.html; dist/cloudflare/');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
