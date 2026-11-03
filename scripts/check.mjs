import {readdir, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Script} from 'node:vm';
import {root} from './build.mjs';
async function walk(dir) {
  let count = 0;
  for (const file of await readdir(dir,{withFileTypes:true})) {
    const name = dir+'/'+file.name;
    if (file.isDirectory()) count += await walk(name);
    else if (/\.(js|mjs)$/.test(name)) {
      const result = spawnSync(process.execPath,['--check',name],{encoding:'utf8'});
      if (result.status !== 0) throw new Error(result.stderr);
      count++;
    }
  }
  return count;
}
let count = 0;
for (const dir of ['src','scripts','tests']) count += await walk(root+'/'+dir);
for (const file of ['quest.html','quest-demo.html','login-preview.html','image-start.html']) {
  const html = await readFile(root+'/dist/'+file,'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error('Expected exactly one inline script');
  new Script(scripts[0][1],{filename:file});
}
console.log(`Syntax OK: ${count} source/script/test modules + 4 inline bundles`);
