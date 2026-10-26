import { hmacSha256Base64Url } from './_helpers.js';

const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const MAX_BYTES=1000000;
function cookie(request){const entry=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('wealth_gate='));try{return decodeURIComponent(entry?.slice(12)||'');}catch{return '';}}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function encode(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);}
function decode(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function key(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,secret){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new TextEncoder().encode(JSON.stringify(value)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('wealth-ledger:v1')},await key(secret),bytes);return JSON.stringify({v:1,iv:encode(iv),data:encode(new Uint8Array(encrypted))});}
async function decrypt(text,secret){const box=JSON.parse(text);if(box.v!==1)throw Error('Unsupported encrypted ledger');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv),additionalData:new TextEncoder().encode('wealth-ledger:v1')},await key(secret),decode(box.data));return JSON.parse(new TextDecoder().decode(bytes));}
export async function handleLedgerSync(request,env){
  if(!env.SITE_PASSWORD||!env.SITE_AUTH_SECRET)return json({error:'请先配置站点访问保护'},503);
  const expected=await hmacSha256Base64Url(env.SITE_AUTH_SECRET,env.SITE_PASSWORD);
  if(!equal(cookie(request),expected))return json({error:'登录已过期，请重新登录'},401);
  if(request.headers.get('X-Wealth-Sync')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'不允许跨站同步请求'},403);
  if(!env.LEDGER_DB||!env.LEDGER_SYNC_SECRET||env.LEDGER_SYNC_SECRET.length<32)return json({error:'线上同步存储尚未配置',configured:false},503);
  try{
    if(request.method==='GET'){
      const row=await env.LEDGER_DB.prepare('SELECT revision,payload,updated_at FROM cloud_ledger WHERE id = ?').bind('primary').first();
      if(!row)return json({configured:true,revision:0,ledger:null});
      if(new URL(request.url).searchParams.get('since')===String(row.revision))return json({configured:true,revision:row.revision,unchanged:true,updatedAt:row.updated_at});
      return json({configured:true,revision:row.revision,updatedAt:row.updated_at,ledger:await decrypt(row.payload,env.LEDGER_SYNC_SECRET)});
    }
    if(request.method!=='PUT')return json({error:'不支持的请求方式'},405);
    if(request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'同步来源无效'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'需要JSON账本'},415);
    // Read a bounded stream: do not buffer an unbounded upload before checking its size.
    const reader=request.body?.getReader();if(!reader)return json({error:'缺少账本'},400);
    const parts=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();return json({error:'账本超过1MB，请先导出备份并清理过量记录'},413);}parts.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'账本格式无效'},400);}
    const {ledger,baseRevision}=body||{};
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0||!ledger||typeof ledger!=='object'||Array.isArray(ledger)||!Array.isArray(ledger.products)||!Array.isArray(ledger.navHistory)||!Array.isArray(ledger.movementLog)||!Array.isArray(ledger.cashFlows))return json({error:'账本或版本号无效'},400);
    const payload=await encrypt(ledger,env.LEDGER_SYNC_SECRET),updatedAt=new Date().toISOString();
    const row=baseRevision===0
      ?await env.LEDGER_DB.prepare('INSERT INTO cloud_ledger(id,revision,payload,updated_at) VALUES (?,1,?,?) ON CONFLICT(id) DO NOTHING RETURNING revision,updated_at').bind('primary',payload,updatedAt).first()
      :await env.LEDGER_DB.prepare('UPDATE cloud_ledger SET revision=revision+1,payload=?,updated_at=? WHERE id=? AND revision=? RETURNING revision,updated_at').bind(payload,updatedAt,'primary',baseRevision).first();
    if(!row)return json({error:'另一台设备已更新账本，请先处理冲突'},409);
    return json({revision:row.revision,updatedAt:row.updated_at});
  }catch{return json({error:'线上账本暂时无法读写；本机数据已保留'},503);}
}
