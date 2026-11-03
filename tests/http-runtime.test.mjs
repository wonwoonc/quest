import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {serveStatic} from '../scripts/static-service.mjs';
import {root} from '../scripts/build.mjs';
test('real HTTP serves four current bundles and economy module without invoking image service',async()=>{
  const server=http.createServer(serveStatic);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const base=`http://127.0.0.1:${server.address().port}`;
    for(const file of ['quest','quest-demo','login-preview','image-start']){
      const r=await fetch(`${base}/dist/${file}.html`);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const html=await r.text();assert.equal(html,await readFile(`${root}/dist/${file}.html`,'utf8'));assert.ok(html.includes('function processEconomy('));assert.ok(html.includes('purchaseAction'));assert.ok(html.includes('data-eco-cardtheme'));
    }
    const esm=await fetch(base+'/src/economy.js');assert.equal(esm.status,200);assert.match(esm.headers.get('content-type'),/javascript/);
    assert.equal((await fetch(base+'/ECONOMY.md')).status,404,'docs not exposed by restricted dev service');
  }finally{await new Promise(r=>server.close(r));}
});
