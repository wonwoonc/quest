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
  assert.match(js,/export function startLegacyApp\(\{runtime, storage, seed = null, account = null\}\)/);
  assert.doesNotMatch(js,/localStorage|lq2:|quest:v1/);
  assert.match(js,/const LS = storage.preferences/);
  assert.match(js,/planner:\{cond:70, emo:null, share:false\}/);
});
test('bundler rejects implicit global concatenation by giving every module its own wrapper', async () => {
  const js = await bundle('entry.js');
  for (const module of ['entry.js','bootstrap.js','storage.js','runtime.js','legacy-app.js','backups.js']) assert.ok(js.includes(JSON.stringify(module)+':function(__require,__exports)'));
});

test('Cloudflare build carries the Supabase login; the artifact/tester builds never contact a server', async () => {
  const {readFile} = await import('node:fs/promises');
  const cf = await readFile(new URL('../dist/cloudflare/index.html', import.meta.url), 'utf8');
  assert.match(cf, /rqoghflmyxpoqrhydgce\.supabase\.co/); assert.match(cf, /sb_publishable_/); assert.match(cf, /data-auth-form/);
  assert.doesNotMatch(cf, /sb_secret_|service_role/, 'no secret keys in the public bundle');
  for (const f of ['quest.html', 'quest-tester.html', 'quest-demo.html']) assert.doesNotMatch(await readFile(new URL('../dist/' + f, import.meta.url), 'utf8'), /supabase\.co/, f);
  const sql = await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
  assert.match(sql, /enable row level security/); assert.match(sql, /security definer set search_path = ''/); assert.match(sql, /on delete cascade/);
});

test('public pages for store listings: /privacy renders the full policy, /delete-account explains in-app and email deletion', async () => {
  const {readFile} = await import('node:fs/promises');
  const pv = await readFile(new URL('../dist/cloudflare/privacy.html', import.meta.url), 'utf8');
  assert.match(pv, /<title>개인정보처리방침 · 퀘스트<\/title>/); assert.match(pv, /1\. 처리 목적[\s\S]*5\. 처리 위탁과 국외 이전[\s\S]*Supabase[\s\S]*10\. 개인정보 보호책임자[\s\S]*12\. 방침의 변경/);
  assert.match(pv, /\(주\)원운컴퍼니/); assert.doesNotMatch(pv, /class="tbd"|<script/);
  const del = await readFile(new URL('../dist/cloudflare/delete-account.html', import.meta.url), 'utf8');
  assert.match(del, /회원 탈퇴[\s\S]*mailto:wonwoonc10@gmail\.com[\s\S]*삭제되는 정보[\s\S]*보관되는 정보[\s\S]*3개월/); assert.doesNotMatch(del, /<script/);
});
