import http from 'node:http';
import {serveStatic} from './static-service.mjs';
const server = http.createServer(async (req,res) => { await serveStatic(req,res); });
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
// Local only by default: the dev server exposes the source tree. Set HOST=0.0.0.0 explicitly to test from another device.
const host = process.env.HOST || '127.0.0.1';
server.listen(4173,host,() => console.log(`Quest dev server ready on http://${host}:4173`));
