/*
 * dev-server.js: run TalentBridge locally against your real Salesforce Site,
 * without setting up CORS.
 *
 *   node dev-server.js https://YOUR-SITE.my.salesforce-sites.com
 *   then open http://localhost:8080
 *
 * How it works:
 *   - Requests for the app's own files (index.html, js/, css/, views/...) are
 *     served from this folder.
 *   - Requests to /services/apexrest/... are forwarded to your Salesforce Site,
 *     and the answer is passed back to the browser.
 *
 * The browser only ever talks to localhost:8080, so it never makes a cross-origin
 * request and CORS doesn't apply. Keep API_URL in app.module.js as
 * '/services/apexrest' when you use this.
 *
 * No npm install needed: it uses only Node's built-in modules.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const siteUrl = (process.argv[2] || '').replace(/\/+$/, '');
const port = Number(process.argv[3]) || 8080;
const root = __dirname;

if (!/^https?:\/\//.test(siteUrl)) {
  console.error('Usage: node dev-server.js https://YOUR-SITE.my.salesforce-sites.com [port]');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// Forward /services/apexrest/... to Salesforce and stream the answer back.
function proxy(req, res) {
  const target = new URL(siteUrl + req.url);
  const client = target.protocol === 'https:' ? https : http;
  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/json',
    'Accept': 'application/json'
  };
  // The sign-in token (added by authInterceptor) must reach Apex too.
  if (req.headers['x-tb-token']) { headers['X-TB-Token'] = req.headers['x-tb-token']; }
  const upstream = client.request(target, { method: req.method, headers }, sfRes => {
    res.writeHead(sfRes.statusCode, { 'Content-Type': sfRes.headers['content-type'] || 'application/json' });
    sfRes.pipe(res);
    console.log(`${req.method} ${req.url} -> ${sfRes.statusCode}`);
  });
  upstream.on('error', err => {
    console.error(`${req.method} ${req.url} -> could not reach Salesforce: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ errorCode: 'BAD_GATEWAY', message: 'The local proxy could not reach Salesforce.' }]));
  });
  req.pipe(upstream);
}

// Serve a file from this folder.
function serveFile(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }   // no ../ tricks
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.url.startsWith('/services/apexrest/')) { proxy(req, res); } else { serveFile(req, res); }
}).listen(port, () => {
  console.log(`TalentBridge: http://localhost:${port}`);
  console.log(`API calls forwarded to: ${siteUrl}/services/apexrest/...`);
});
