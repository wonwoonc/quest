import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {build, bundle, root} from '../scripts/build.mjs';
await build();
test('original file byte hash preserved (optional external original)', async t => {
  let data;
  try { data = await readFile(root+'/../quest/index-before-preview-sync.html'); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('Original intentionally not included in distribution'); return; } throw error; }
  assert.equal(createHash('sha256').update(data).digest('hex'),'8f43bd89c5c6b6261c8c160afe09c9cb7868ce6c227e6417baf6d300ffd99452');
});
test('empty dependency graph excludes entire fixture module and unique sample strings', async () => {
  const prod = await bundle('entry.js'), demo = await bundle('demo-entry.js');
  for (const marker of ['fixtures/demo.js','s-jihoon','토익 850점 넘기기','sp-body','첫 모의고사 710점','buildSample','picSvg','바디프로필 촬영하기']) {
    assert.ok(!prod.includes(marker),marker); assert.ok(demo.includes(marker),marker);
  }
});
test('provider capabilities, archive scheduling, artificial reactions and prior removals absent', async () => {
  const prod = await readFile(root+'/dist/quest.html','utf8');
  for (const marker of [/claude\.(db|room|self|artifact)\b/,/use\(['"](db|room|self|artifact)['"]\)/,/userCap/,/resolveNames/,/initLive/,/archiveOld/,/wrapArch/,/r-live/,/weekRange/,/weekStats/,/data-act="more-settings"/,/share:true/]) assert.doesNotMatch(prod,marker);
  assert.match(prod,/개발 미리보기 · 실제 인증 미연결/);
  assert.doesNotMatch(prod,/setTimeout\([^\n]+(?:15000|30000)/);
});
test('both build products contain one self-contained syntactically valid script, no split JS/CSS', async () => {
  for (const name of ['quest.html','quest-demo.html','login-preview.html','image-start.html']) {
    const html = await readFile(root+'/dist/'+name,'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1); new Script(scripts[0][1]);
    assert.doesNotMatch(html,/<script[^>]+src=/); assert.doesNotMatch(html,/<link[^>]+href="\.\//);
  }
});
test('legacy UI is explicitly dependency-injected ESM, preferences never touch old key', async () => {
  const js = await readFile(root+'/src/legacy-app.js','utf8');
  assert.match(js,/export function startLegacyApp\(\{runtime, storage, seed = null\}\)/);
  assert.doesNotMatch(js,/localStorage|lq2:|quest:v1/);
  assert.match(js,/const LS = storage.preferences/);
  assert.match(js,/planner:\{cond:70, emo:null, share:false\}/);
});
test('bundler rejects implicit global concatenation by giving every module its own wrapper', async () => {
  const js = await bundle('entry.js');
  for (const module of ['entry.js','bootstrap.js','storage.js','runtime.js','legacy-app.js','backups.js']) assert.ok(js.includes(JSON.stringify(module)+':function(__require,__exports)'));
});
