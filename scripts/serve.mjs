import http from 'node:http';
import {createCharacterService} from './character-service.mjs';
import {serveStatic} from './static-service.mjs';
const service = createCharacterService();
const server = http.createServer(async (req,res) => {
  if (req.url?.split('?')[0] === '/api/characters') return service.handle(req,res);
  await serveStatic(req,res);
});
server.requestTimeout = 20_000;
server.headersTimeout = 10_000;
server.listen(4173,'0.0.0.0',() => {
  console.log('Quest dev server ready on port 4173');
  if (service.configured) console.log(`Quest dev image access code: ${service.accessCode}`);
});
