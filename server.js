// Loopback-only development server. Always uses synthetic local emulators.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname, PORT = Number(process.env.PORT || 5599);
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);return res.end();}
  const parts=pathname.split(/[\\/]/);
  if(parts.some(p=>p.startsWith('.')) || parts.some(p=>['node_modules','scratch','tests','docs'].includes(p))) {res.writeHead(403);return res.end('Forbidden');}
  let file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep) && file!==ROOT) {res.writeHead(403);return res.end();}
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
  if(!fs.existsSync(file) && fs.existsSync(file+'.html')) file+='.html';
  const ext=path.extname(file);
  if(!TYPES[ext] || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end('Not found');}
  let body=fs.readFileSync(file);
  if(file===path.join(ROOT,'js','config.js')) body=Buffer.from("window.CLASSCARE_CONFIG={firebase:{apiKey:'demo-key',projectId:'demo-classcare',authDomain:'demo-classcare.firebaseapp.com'},telegram:{botToken:''}};");
  if(file===path.join(ROOT,'config','firebase-config.js')) body=Buffer.from(body.toString()
    .replace('_auth = firebase.auth();',"_auth = firebase.auth(); _auth.useEmulator('http://127.0.0.1:9099',{disableWarnings:true});")
    .replace('_db = firebase.firestore();',"_db = firebase.firestore(); _db.useEmulator('127.0.0.1',8080);"));
  res.writeHead(200,{'Content-Type':TYPES[ext],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='HEAD'?undefined:body);
}).listen(PORT,'127.0.0.1',()=>console.log(`ClassCare SYNTHETIC emulator preview: http://127.0.0.1:${PORT}/`));
