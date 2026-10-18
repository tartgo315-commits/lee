import fs from 'node:fs';
import assert from 'node:assert/strict';
const helpers=fs.readFileSync('functions/_helpers.js','utf8');
const helperUrl='data:text/javascript;base64,'+Buffer.from(helpers).toString('base64');
async function load(file){
  const code=fs.readFileSync(file,'utf8').replace(/from ['"]\.\.?\/_helpers\.js['"]/g,`from '${helperUrl}'`);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {onRequest:gate}=await load('functions/_middleware.js');
const {onRequest:auth}=await load('functions/api/auth.js');
const {onRequest:logout}=await load('functions/api/logout.js');
const {hmacSha256Base64Url}=await import(helperUrl);
const env={SITE_PASSWORD:'test-only-password',SITE_AUTH_SECRET:'test-only-secret'};
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
function context(path,config={},cookie=''){
  return {request:new Request('https://test.invalid'+path,{headers:cookie?{cookie}:{}}),env:config,next:async()=>new Response('UPSTREAM CONTENT',{headers:{'Content-Type':'text/plain'}})};
}
await check('Unconfigured deployment preserves access, body and security headers',async()=>{
  const r=await gate(context('/'));
  assert.equal(r.status,200);assert.equal(await r.text(),'UPSTREAM CONTENT');
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
});
await check('Partially configured deployment stays accessible and reports the issue',async()=>{
  const partial={SITE_PASSWORD:env.SITE_PASSWORD};
  assert.equal((await gate(context('/',partial))).status,200);
  const data=await (await gate(context('/api/security-status',partial))).json();
  assert.equal(data.enabled,false);assert.equal(data.misconfigured,true);
});
await check('Configured deployment requires login for pages',async()=>{
  const r=await gate(context('/',env));assert.equal(r.status,401);
  assert.ok((await r.text()).includes('action="/api/auth"'));
});
await check('Unauthenticated APIs and proxy aliases return JSON 401',async()=>{
  for(const path of ['/api/ai-advisor','/api/stock-price','/proxy','/_proxy']){
    const r=await gate(context(path,env));assert.equal(r.status,401,path);
    assert.ok((await r.json()).error);
  }
});
await check('Correct password produces the existing secure HttpOnly cookie',async()=>{
  const request=new Request('https://test.invalid/api/auth',{method:'POST',body:new URLSearchParams({password:env.SITE_PASSWORD})});
  const r=await auth({request,env});assert.equal(r.status,302);
  const cookie=r.headers.get('Set-Cookie');
  assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));assert.ok(cookie.includes('SameSite=Lax'));
  const page=await gate(context('/',env,cookie.split(';')[0]));
  assert.equal(page.status,200);assert.equal(await page.text(),'UPSTREAM CONTENT');
  assert.equal((await gate(context('/api/ai-advisor',env,cookie.split(';')[0]))).status,200);
});
await check('Wrong password and forged or malformed cookies are rejected',async()=>{
  const request=new Request('https://test.invalid/api/auth',{method:'POST',body:'password=wrong'});
  assert.equal((await auth({request,env})).status,401);
  for(const cookie of ['wealth_gate=forged','wealth_gate=%E0%A4%A'])assert.equal((await gate(context('/',env,cookie))).status,401);
});
await check('Logout invalidates the browser cookie',async()=>{
  const r=await logout({request:new Request('https://test.invalid/api/logout'),env});
  assert.equal(r.status,302);assert.ok(/Max-Age=0/i.test(r.headers.get('Set-Cookie')));
});
await check('Login, logout and read-only status remain reachable before login',async()=>{
  for(const path of ['/api/auth','/api/logout'])assert.equal((await gate(context(path,env))).status,200);
  const r=await gate(context('/api/security-status',env));const text=await r.text();
  assert.equal(JSON.parse(text).enabled,true);assert.ok(!text.includes(env.SITE_PASSWORD));assert.ok(!text.includes(env.SITE_AUTH_SECRET));
});
await check('Static copies of server source are not served',async()=>{
  for(const path of ['/functions/api/ai-advisor.js','/api/auth.js','/middleware.js'])assert.equal((await gate(context(path))).status,404);
});
await check('Deployment copies are identical',async()=>{
  for(const file of ['_middleware.js','api/security-status.js'])assert.equal(fs.readFileSync('functions/'+file,'utf8'),fs.readFileSync('public/functions/'+file,'utf8'));
});
console.log(`${passed} gate checks passed.`);
