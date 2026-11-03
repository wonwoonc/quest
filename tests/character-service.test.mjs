import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCharacterService, runGsk, MAX_BODY, imageType} from '../scripts/character-service.mjs';
import {serveStatic} from '../scripts/static-service.mjs';
import {characterOptions, permanentCharacterURL} from '../src/character-contract.js';
import {createCharacterClient} from '../src/character-client.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const url = 'https://www.genspark.ai/api/files/s/mock_result?cache_control=3600';
const enabled = {QUEST_DEV_IMAGE_GENERATION:'1',NODE_ENV:'development'};
function form({bytes = png, type = 'image/png', consent = true} = {}) {
  const body = new FormData(); body.set('photo',new Blob([bytes],{type}),'private-photo.png');
  body.set('options',JSON.stringify({...characterOptions('#3DBE8B'),consent})); return body;
}
async function fixture(t,{execute,env=enabled} = {}) {
  const tempRoot = await mkdtemp(path.join(tmpdir(),'quest-test-'));
  let calls = 0, time = 100_000;
  const service = createCharacterService({env,tempRoot,now:()=>time,execute:async args => {
    calls++; if (execute) return execute(args);
    assert.equal(args[0],'image_generation');
    assert.match(args[1],/head 55-60% of total character height/); assert.match(args[1],/STYLE ONLY/);
    assert.match(args[1],/#3DBE8B/); assert.match(args[1],/never copy.*hoodie or outfit/);
    assert.doesNotMatch(args[1],/UNTRUSTED_OVERRIDE|evil\.test|3-head-tall/);
    const i = args.indexOf('-i');
    assert.deepEqual(await readFile(args[i+1]),png);
    assert.equal(args[i+2],'https://www.genspark.ai/api/files/s/p8jwqX27?cache_control=3600');
    assert.deepEqual(args.slice(i+3,i+7),['-m','nano-banana-2-flash-lite','-r','1:1']);
    await writeFile(args.at(-1),png);
    return JSON.stringify({status:'ok',data:{generated_images:[{model:'nano-banana-2-flash-lite',task_id:'mock-task',status:'success',image_urls:[url]}]}});
  }});
  const server = http.createServer((req,res)=>req.url.startsWith('/api/') ? service.handle(req,res) : serveStatic(req,res)).listen(0,'127.0.0.1');
  await once(server,'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await rm(tempRoot,{recursive:true,force:true});});
  return {service,tempRoot,origin,get calls(){return calls;},advance(){time+=30_000;},
    post: (body = form(), extra = {})=>fetch(origin+'/api/characters',{method:'POST',body,headers:{Origin:origin,'X-Quest-Dev-Code':service.accessCode,...extra}})};
}
async function clean(f) {
  for(let i=0;i<50;i++) { if (!(await readdir(f.tempRoot)).length) return; await new Promise(r=>setTimeout(r,5)); }
  assert.deepEqual(await readdir(f.tempRoot),[]);
}
test('gate is off by default and cannot be enabled in production',async t=>{
  for(const env of [{},{QUEST_DEV_IMAGE_GENERATION:'true'}, {...enabled,NODE_ENV:'production'}]) {
    const f = await fixture(t,{env}); assert.equal(f.service.accessCode,null);
    const ready = await (await fetch(f.origin+'/api/characters')).json(); assert.equal(ready.configured,false);
    assert.equal((await f.post('not multipart')).status,503); assert.equal(f.calls,0);
  }
});
test('readiness exposes requirements, never code; code is random per startup',async t=>{
  const f = await fixture(t), g = await fixture(t);
  assert.notEqual(f.service.accessCode,g.service.accessCode);
  const r = await fetch(f.origin+'/api/characters'), text = await r.text();
  assert.equal(JSON.parse(text).requiresCode,true); assert.ok(!text.includes(f.service.accessCode));
  assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('POST requires same-origin and dev code, never URL code',async t=>{
  const f = await fixture(t);
  for(const h of [{Origin:'https://evil.test'}, {Origin:''}, {'Sec-Fetch-Site':'cross-site'}, {'X-Quest-Dev-Code':'wrong'}, {'X-Quest-Dev-Code':''}]) assert.ok([401,403].includes((await f.post(form(),h)).status));
  const r = await fetch(f.origin+'/api/characters?code='+f.service.accessCode,{method:'POST',headers:{Origin:f.origin},body:form()});
  assert.equal(r.status,401); assert.equal(f.calls,0); await clean(f);
});
test('bounded multipart validates consent and MIME magic before provider',async t=>{
  const f = await fixture(t);
  for(const opts of [{consent:false},{bytes:Buffer.from('not an image')},{type:'image/jpeg'}, {type:'image/svg+xml'}]) {
    const r = await f.post(form(opts)); assert.ok([400,415].includes(r.status));
  }
  assert.equal((await f.post('plain text')).status,415);
  const duplicate = form(); duplicate.append('photo',new Blob([png],{type:'image/png'}),'extra.png');
  assert.equal((await f.post(duplicate)).status,400);
  const malformed = form(); malformed.set('options','not json'); assert.equal((await f.post(malformed)).status,400);
  const large = form({bytes:Buffer.alloc(MAX_BODY)}); assert.equal((await f.post(large)).status,413);
  assert.equal(f.calls,0); await clean(f);
});
test('chunked multipart body also has a hard size bound',async t=>{
  const f = await fixture(t);
  const status = await new Promise((resolve,reject)=>{
    const req = http.request(f.origin+'/api/characters',{method:'POST',headers:{Origin:f.origin,'X-Quest-Dev-Code':f.service.accessCode,'Content-Type':'multipart/form-data; boundary=x'}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',err=>err.code === 'ECONNRESET' ? resolve(413) : reject(err));
    req.write(Buffer.alloc(MAX_BODY)); req.end(Buffer.alloc(1));
  });
  assert.equal(status,413); assert.equal(f.calls,0);
});
test('success uses actual photo, returns bytes and permanent URL, cleans temp files',async t=>{
  const f = await fixture(t); const r = await f.post(); assert.equal(r.status,200);
  const result = await r.json(); assert.equal(result.image,`data:image/png;base64,${png.toString('base64')}`);
  assert.equal(result.resultUrl,url); assert.equal(result.avatarStyle,'fullbody'); assert.equal(f.calls,1);
  await clean(f); assert.equal((await f.post()).status,429);
});
test('legacy version 1 client policy cannot override approved server instructions',async t=>{
  const f = await fixture(t);
  const body = form();
  body.set('options',JSON.stringify({version:1,consent:true,color:'#3DBE8B',avatarStyle:'fullbody',policy:{style:'UNTRUSTED_OVERRIDE',styleReference:'https://evil.test/reference'}}));
  const r = await f.post(body);
  assert.equal(r.status,200); assert.equal((await r.json()).version,1);
  assert.equal(f.calls,1); await clean(f);
});
test('session cap counts failed attempts and cooldown is global',async t=>{
  const f = await fixture(t,{execute:async()=>{throw new Error('secret_token_do_not_echo');}});
  for(let i=0;i<5;i++) { const r = await f.post(); assert.equal(r.status,502); assert.ok(!(await r.text()).includes('secret')); await clean(f); assert.equal((await f.post()).status,429); f.advance(); }
  const r = await f.post(); assert.equal((await r.json()).code,'SESSION_LIMIT'); assert.equal(f.calls,5);
});
test('session cap also limits successful generations to five',async t=>{
  const f = await fixture(t);
  for(let i=0;i<5;i++) { assert.equal((await f.post()).status,200); await clean(f); f.advance(); }
  assert.equal((await (await f.post()).json()).code,'SESSION_LIMIT'); assert.equal(f.calls,5);
});
test('only one provider or upload in flight',async t=>{
  let release, entered; const started = new Promise(r=>entered=r);
  const f = await fixture(t,{execute:async args=>{entered(); await new Promise(r=>release=r); await writeFile(args.at(-1),png); return JSON.stringify({data:{generated_images:[{status:'success',image_urls:[url]}]}});}});
  const pending = f.post(); await started; f.advance();
  const r = await f.post(); assert.equal(r.status,429); assert.equal((await r.json()).code,'GENERATION_BUSY');
  release(); assert.equal((await pending).status,200); await clean(f); assert.equal(f.calls,1);
});
for (const [name,execute,expected] of [
  ['failed',async()=>JSON.stringify({status:'failed',data:{generated_images:[]}}),502],
  ['bad JSON',async()=>'{bad',502],
  ['credits',async()=>JSON.stringify({status:'failed',error:{code:'insufficient_credits',message:'private'}}),402],
  ['bad output',async args=>{await writeFile(args.at(-1),'fake');return JSON.stringify({data:{generated_images:[{status:'success'}]}});},502]
]) test(`provider ${name} does not retry or leak and cleans files`,async t=>{
  const f = await fixture(t,{execute}); const r = await f.post(); assert.equal(r.status,expected); assert.ok(!(await r.text()).includes('private')); await clean(f);
  assert.equal(f.calls,1);
  if(expected === 402) { f.advance(); assert.equal((await f.post()).status,402); assert.equal(f.calls,1); }
});
test('execFile wrapper enforces no shell, timeout and bounded buffers, sanitizes errors',async()=>{
  let options;
  const output = await runGsk(['mock'],(cmd,args,opts,cb)=>{assert.equal(cmd,'gsk');options=opts;cb(null,'{"status":"ok"}','secret stderr');});
  assert.equal(output,'{"status":"ok"}'); assert.equal(options.shell,false); assert.equal(options.timeout,180_000); assert.equal(options.maxBuffer,1024*1024);
  for(const [error,stderr,code] of [[{killed:true},'token','GENERATION_TIMEOUT'],[{code:1},'insufficient_credits token','PROVIDER_CREDITS_STOPPED'],[{code:1},'token','PROVIDER_FAILED']]) {
    await assert.rejects(runGsk([],(_c,_a,_o,cb)=>cb(error,'',stderr)),e=>e.code === code && !JSON.stringify(e).includes('token'));
  }
});
test('timeout mapped through service and cleans temporary input',async t=>{
  const f = await fixture(t,{execute:args=>runGsk(args,(_c,_a,_o,cb)=>cb({killed:true},'','private'))});
  const r = await f.post(); assert.equal(r.status,504); assert.equal((await r.json()).code,'GENERATION_TIMEOUT'); await clean(f);
});
test('static server denies service source, config, temp and arbitrary files',async t=>{
  const f = await fixture(t);
  for(const p of ['/scripts/character-service.mjs','/package.json','/.env','/tests/character.test.mjs','/dist/private.log','/src/.env','/tmp/result.png','/README.md','/src/../scripts/serve.mjs']) assert.equal((await fetch(f.origin+p)).status,404,p);
  for(const p of ['/','/demo.html','/src/entry.js','/dist/quest.html','/dist/login-preview.html','/dist/image-start.html']) assert.equal((await fetch(f.origin+p)).status,200,p);
});
test('client holds code only in memory, requires it before upload, returns safe result URL',async()=>{
  let calls = 0;
  const client = createCharacterClient({enabled:true,fetchImpl:async(_url,opts)=>{
    calls++; if(opts.method === 'GET') return {ok:true,json:async()=>({version:1,configured:true,requiresCode:true})};
    assert.equal(opts.headers['X-Quest-Dev-Code'],'dev-only');
    return {ok:true,json:async()=>({version:1,avatarStyle:'fullbody',image:`data:image/png;base64,${png.toString('base64')}`,resultUrl:url})};
  }});
  const args = {file:new Blob([png],{type:'image/png'}),color:'#3DBE8B',consent:true};
  await assert.rejects(client.generate(args),/코드/); assert.equal(calls,1);
  client.setDevCode('dev-only'); assert.equal((await client.generate(args)).resultUrl,url);
  assert.equal(permanentCharacterURL('https://evil.test/x'),null); assert.equal(permanentCharacterURL(url+'?token=secret'),null);
});
test('magic sniff accepts real PNG and rejects text',()=>{assert.equal(imageType(png),'image/png');assert.equal(imageType(Buffer.from('fake')),null);});
