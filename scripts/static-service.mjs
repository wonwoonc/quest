import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {root} from './build.mjs';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8'};
export async function serveStatic(req,res) {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const name = pathname === '/' ? '/index.html' : pathname;
    const allowed = ['/index.html','/demo.html'].includes(name) || /^\/src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:js|html)$/.test(name) || /^\/dist\/(?:quest|quest-demo|image-start|login-preview)\.html$/.test(name);
    if (!allowed) throw 0;
    const file = path.resolve(root,'.'+name);
    if (await realpath(file) !== file) throw 0;
    const data = await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}
