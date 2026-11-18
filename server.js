// Loopback-only development server. Always uses synthetic local emulators.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname, PORT = Number(process.env.PORT || 5500);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.task':'application/octet-stream'};
const PUBLIC_DIRS = new Set(['admin', 'assets', 'config', 'js', 'student', 'teacher']);
const PUBLIC_FILES = new Set(['index.html', 'manifest.json', 'sw.js']);
const requestHandler = (req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);return res.end();}
  const parts=pathname.split(/[\\/]/).filter(Boolean);
  if(pathname.includes('\0') || parts.some(p=>p.startsWith('.') || p.includes(':'))
    || (parts.length && !PUBLIC_DIRS.has(parts[0]) && !PUBLIC_FILES.has(parts[0]))) {res.writeHead(403);return res.end('Forbidden');}
  let file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep) && file!==ROOT) {res.writeHead(403);return res.end();}
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if(!fs.existsSync(file) && fs.existsSync(file+'.html')) file+='.html';
  const ext=path.extname(file);
  if(!TYPES[ext] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end('Not found');}
  const realFile = fs.realpathSync(file);
  if (!realFile.toLowerCase().startsWith(fs.realpathSync(ROOT).toLowerCase() + path.sep)) {res.writeHead(403);return res.end('Forbidden');}
  let body=fs.readFileSync(file);
  // Never serve live credentials from this development server. The shared
  // Firebase initializer connects demo-classcare to Auth/Firestore emulators.
  if(realFile.toLowerCase()===path.join(ROOT,'js','config.js').toLowerCase()) body=Buffer.from("window.CLASSCARE_CONFIG={firebase:{apiKey:'demo-key',projectId:'demo-classcare',authDomain:'demo-classcare.firebaseapp.com'},telegram:{botToken:''},emailjs:{}};");
  res.writeHead(200,{'Content-Type':TYPES[ext],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:body);
};
if (require.main === module) {
http.createServer(requestHandler).listen(PORT,'127.0.0.1',()=>{
  console.log(`ClassCare dev server running at:`);
  console.log(`  - http://localhost:${PORT}/`);
  console.log(`  - http://127.0.0.1:${PORT}/`);
});
if (PORT !== 5599 && !process.env.PORT) {
  const alt = http.createServer(requestHandler);
  alt.on('error', () => {});
  alt.listen(5599, '127.0.0.1', () => {
    console.log(`  - http://localhost:5599/ (compat)`);
  });
}
}
module.exports = { requestHandler };
