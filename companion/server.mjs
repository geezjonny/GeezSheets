import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Companion, chat } from './core.mjs';
import { firebaseRequest } from '../js/gaia-core/firebase-store.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||8765);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid PORT.');
const origin='http://127.0.0.1:'+port;
const csrf=randomBytes(32).toString('hex');
// GEEZ_URL: 'firebase' = the live game (/v2), 'firebase:/v2-test/<run>' = a test copy.
const gaiaUrl=process.env.GEEZ_URL||'firebase';
const mode=gaiaUrl==='firebase'?'LIVE GAME • Firebase /v2':'TEST COPY • '+gaiaUrl.slice(9);
const store=new Companion(resolve(process.env.COMPANION_DATABASE||join(root,'data','companion.sqlite')),firebaseRequest(gaiaUrl,'gm'));
const active=new Set();
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
async function body(req) {
 let input='';for await(const chunk of req){input+=chunk;if(input.length>16000)throw Error('Request too large.');}
 return JSON.parse(input);
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try {
  if(req.headers.host!=='127.0.0.1:'+port){json(res,403,{error:'Use '+origin});return;}
  if(req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'Origin rejected.'});return;}
  const url=new URL(req.url,origin);
  if(req.method==='GET'){
   const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
   if(assets[url.pathname]){const [file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type});res.end(readFileSync(join(root,'web',file)));return;}
   if(url.pathname==='/api/state'){json(res,200,{...await store.state(url.searchParams.get('campaign')),csrf,model:process.env.OLLAMA_MODEL||'qwen3.5:4b',mode});return;}
  }
  if(req.method==='POST'){
   if(req.headers['x-companion-token']!==csrf||!req.headers['content-type']?.startsWith('application/json')){json(res,403,{error:'Refresh the page to authorize this local request.'});return;}
   const b=await body(req);
   if(url.pathname==='/api/journal'){json(res,200,await store.journal(b.campaign,b.requestId,b.text));return;}
   if(url.pathname==='/api/chat'){
    if(active.has(b.campaign)){json(res,409,{error:'A chat is already running for this campaign. Wait, then retry.'});return;}
    active.add(b.campaign);
    try{json(res,200,await chat(store,b.campaign,b.requestId,b.text));}finally{active.delete(b.campaign);}return;
   }
   if(url.pathname==='/api/review'){json(res,200,await store.review(b.campaign,b.id,b.revision,b.action));return;}
  }
  json(res,404,{error:'Not found.'});
 }catch(e){console.error(e.message);json(res,400,{error:e.message+' Check the review panel: any persisted proposal is still available. Ollama must be running for chat.'});}
});
server.requestTimeout=180000;
server.listen(port,'127.0.0.1',()=>console.log('Compendium Companion: '+origin+'\n'+mode+'\nModel: '+(process.env.OLLAMA_MODEL||'qwen3.5:4b')));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));

