import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createCharacterClient, generateCharacter} from '../src/character-client.js';
import {CHARACTER_POLICY, CHARACTER_UNAVAILABLE} from '../src/character-contract.js';
import {createCharacterService} from '../scripts/character-service.mjs';

const file = () => new Blob(['user-photo'],{type:'image/png'});
const image = 'data:image/png;base64,aW1hZ2U=';
const args = () => ({file:file(), color:'#3DBE8B', consent:true});
const response = (body,status = 200) => ({ok:status >= 200 && status < 300,status,json:async()=>body});
test('normal client refuses generation before any capability request or upload even with code and consent',async () => {
  let calls = 0;
  const client = createCharacterClient({fetchImpl:async()=>{calls++;}});
  client.setDevCode('not-an-enablement');
  await assert.rejects(client.generate(args()),/사진 기반 생성은 개발 테스트에서만 이용할 수 있어요/);
  assert.equal(calls,0);
});
test('client readiness prevents photograph upload when service is unconfigured',async () => {
  const calls = [];
  const client = createCharacterClient({enabled:true,fetchImpl:async (...a) => {calls.push(a); return response({version:1,configured:false});}});
  await assert.rejects(client.generate(args()),{message:CHARACTER_UNAVAILABLE});
  assert.equal(calls.length,1); assert.equal(calls[0][0],'/api/characters');
  assert.equal(calls[0][1].method,'GET'); assert.equal(calls[0][1].body,undefined);
});
test('client multipart success contract contains consent, color and style-only policy',async () => {
  const calls = [];
  const client = createCharacterClient({enabled:true,fetchImpl:async (...a) => {calls.push(a); return response(calls.length === 1 ? {version:1,configured:true} : {version:1,avatarStyle:'fullbody',image});}});
  assert.deepEqual(await client.generate(args()),{image,avatarStyle:'fullbody'});
  assert.equal(calls.length,2);
  const [url, options] = calls[1];
  assert.equal(url,'/api/characters'); assert.equal(options.method,'POST'); assert.equal(options.credentials,'same-origin');
  assert.equal(options.headers,undefined,'browser sets multipart boundary');
  const request = JSON.parse(options.body.get('options'));
  assert.deepEqual(request,{version:1,consent:true,color:'#3DBE8B',avatarStyle:'fullbody',policy:CHARACTER_POLICY});
  assert.equal(await options.body.get('photo').text(),'user-photo');
  assert.equal(request.policy.referenceUse,'style-only');
  assert.match(request.policy.style,/head 55-60% of total character height/);
  assert.match(request.policy.identity,/never copy.*hoodie or outfit/);
  assert.match(request.policy.clothing,/Never force the style reference gray\/dark outfit/);
});
for (const [name,override] of [
  ['no consent',{consent:false}],['wrong MIME',{file:new Blob(['x'],{type:'text/plain'})}],
  ['empty photo',{file:new Blob([],{type:'image/png'})}],['oversize',{file:{type:'image/png',size:8*1024*1024+1}}],
  ['invalid color',{color:'red'}]
]) test(`client rejects ${name} before network`,async () => {
  let calls = 0; const client = createCharacterClient({enabled:true,fetchImpl:async()=>{calls++;}});
  await assert.rejects(client.generate({...args(),...override})); assert.equal(calls,0);
});
for (const mode of ['network','503','500','json','missing-image','face-style','external-url','svg','wrong-version']) {
  test(`${mode} error preserves previous avatar and resets making`,async () => {
    let calls = 0, starts = 0, changes = 0;
    const client = createCharacterClient({enabled:true,fetchImpl:async()=>{
      if (++calls === 1) return response({version:1,configured:true});
      if (mode === 'network') throw new Error('offline');
      if (mode === 'json') return {ok:true,json:async()=>{throw new SyntaxError('invalid');}};
      if (['503','500'].includes(mode)) return response({},Number(mode));
      return response({version:mode === 'wrong-version' ? 2 : 1,avatarStyle:mode === 'face-style' ? 'face' : 'fullbody',
        image:mode === 'missing-image' ? undefined : mode === 'external-url' ? 'https://example.com/image.png' : mode === 'svg' ? 'data:image/svg+xml;base64,abcd' : image});
    }});
    const target = {face:'old-media',avatarStyle:'fullbody'};
    assert.equal(await generateCharacter({client,target,...args(),onStart:()=>{starts++;assert.equal(target.making,true);},onChange:()=>changes++}),false);
    assert.equal(target.face,'old-media'); assert.equal(target.avatarStyle,'fullbody'); assert.equal(target.making,false);
    assert.ok(target.characterError); assert.equal(starts,1); assert.equal(changes,1);
  });
}
test('onStart exception still resets making; concurrent requests are ignored',async () => {
  const target = {face:'old'}; let calls = 0;
  const client = {generate:async()=>{calls++;return {image,avatarStyle:'fullbody'};}};
  assert.equal(await generateCharacter({client,target,...args(),onStart:()=>{throw new Error('render failed');}}),false);
  assert.equal(target.making,false); assert.equal(target.face,'old'); assert.equal(calls,0);
  target.making = true;
  assert.equal(await generateCharacter({client,target,...args()}),false); assert.equal(calls,0);
});
test('development service reports readiness false and always rejects POST with real HTTP 503',async () => {
  const service = createCharacterService({env:{}});
  assert.equal(service.configured,false);
  const server = http.createServer(service.handle).listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/characters`;
    const ready = await fetch(url); assert.equal(ready.status,200); assert.equal((await ready.json()).configured,false);
    const result = await fetch(url,{method:'POST',body:'not even multipart'});
    assert.equal(result.status,503); assert.equal(result.headers.get('cache-control'),'no-store');
    const body = await result.json(); assert.equal(body.code,'CHARACTER_SERVICE_NOT_CONFIGURED'); assert.equal(body.message,CHARACTER_UNAVAILABLE);
    const denied = await fetch(url,{method:'DELETE'}); assert.equal(denied.status,405); assert.equal(denied.headers.get('allow'),'GET, POST');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
