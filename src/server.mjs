import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Store } from './store.mjs';
import { Chain, deployLocal, providerFor } from './chain.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function application({ directory=resolve(root,'.local'), rpc='http://127.0.0.1:18547', port=4323 }={}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const store = new Store(resolve(directory,'payroom.sqlite'));
  const provider = providerFor(rpc);
  const configPath = resolve(directory, 'deployment.json');
  let config;
  if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath));
  else {
    if (store.list().length || store.operations().length) throw new Error('Deployment file missing for saved invoices. Restore it before starting.');
    config = await deployLocal(provider);
    writeFileSync(`${configPath}.tmp`, JSON.stringify(config,null,2), { mode: 0o600 }); renameSync(`${configPath}.tmp`, configPath);
  }
  const chain = new Chain(provider, config, store);
  await chain.verify();
  await chain.reconcile();
  const session = randomBytes(24).toString('hex');
  const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const assets = { '/': ['public/index.html','text/html'], '/app.js': ['public/app.js','text/javascript'], '/style.css': ['public/style.css','text/css'], '/fonts/manrope.woff2': ['public/fonts/manrope.woff2','font/woff2'], '/favicon.svg': ['public/favicon.svg','image/svg+xml'] };
  const server = createServer(async (req,res) => {
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (!allowed.has(req.headers.host)) return send(403,{error:'Use the local Payroom address.'});
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403,{error:'Cross-origin requests are not allowed.'});
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    try {
      if (req.method === 'GET' && assets[path]) {
        const [file,type] = assets[path]; res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(readFileSync(resolve(root,file)));
      }
      if (req.method === 'GET' && path === '/api/state') return send(200,{...await chain.state(), session});
      if (req.method === 'GET' && path === '/api/export') return send(200,{ version:1, exportedAt:new Date().toISOString(), ...await chain.state() });
      if (req.method !== 'POST') return send(404,{error:'Page not found.'});
      const supplied = String(req.headers['x-payroom-session'] ?? '');
      if (supplied.length !== session.length || !timingSafeEqual(Buffer.from(supplied),Buffer.from(session))) return send(403,{error:'Refresh Payroom before making changes.'});
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(415,{error:'Use JSON for this request.'});
      let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) return send(413,{error:'This request is too large.'}); }
      const input = JSON.parse(body || '{}');
      if (path === '/api/invoices') return send(201,store.create(input,config));
      if (path === '/api/policy') return send(200,await chain.policy(input));
      if (path === '/api/reconcile') return send(200,await chain.serial(() => chain.reconcile()));
      const match = path.match(/^\/api\/invoices\/(0x[a-fA-F0-9]{64})\/(approve|execute|cancel)$/);
      if (match) return send(200,await chain.action(match[1],match[2]));
      return send(404,{error:'Action not found.'});
    } catch(error) {
      const safe = /^(Enter |Use |This |The |Only |Approve |Reconcile |A transaction|Invoice |Local |Saved |Receipt |Deployment |Cross-origin|Refresh |Unknown |A positive)/.test(error.message);
      send(400,{error: safe ? error.message.slice(0,260) : 'This action could not finish. Check the connection and reconcile any pending transaction.'});
    }
  });
  server.requestTimeout = 60000;
  return { server, chain, store, provider, close: async () => { await new Promise(r => server.close(r)); store.close(); provider.destroy(); } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await application();
  app.server.listen(4323,'127.0.0.1', () => console.log('Payroom is ready at http://127.0.0.1:4323'));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
