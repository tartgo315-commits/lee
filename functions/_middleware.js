import { hmacSha256Base64Url } from './_helpers.js';

function cookieValue(request, name) {
  const pair=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
  if(!pair)return '';
  try{return decodeURIComponent(pair.slice(name.length+1));}catch{return '';}
}
function equal(a,b) {
  if(a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const login=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · LEE's Wealth</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font:16px system-ui;background:#080b12;color:#f9fafb}main{box-sizing:border-box;width:min(400px,calc(100% - 32px));padding:28px;border:1px solid #374151;border-radius:16px;background:#13161c}h1{font-size:22px}p{color:#9ca3af;line-height:1.6}label{display:block;margin-bottom:8px}input,button{box-sizing:border-box;width:100%;padding:12px;font:inherit;border-radius:8px}input{background:#080b12;border:1px solid #4b5563;color:#fff}button{margin-top:16px;background:#10b981;border:0;cursor:pointer}</style></head><body><main><h1>LEE's Wealth</h1><p>本站已启用访问密码。登录后可使用线上账本与本机备份。</p><form method="post" action="/api/auth"><label for="password">站点密码</label><input id="password" name="password" type="password" autocomplete="current-password" required><button type="submit">登录</button></form></main></body></html>`;

export async function onRequest(context) {
  const {request,env}=context;
  const path=new URL(request.url).pathname;
  const enabled=!!(env.SITE_PASSWORD&&env.SITE_AUTH_SECRET);
  const incomplete=!!(env.SITE_PASSWORD||env.SITE_AUTH_SECRET)&&!enabled;
  if(path==='/api/security-status')return Response.json({enabled,configured:enabled,gateSupported:true,misconfigured:incomplete},{headers});
  // Prevent duplicated function source files in the static output being served.
  if(path.startsWith('/functions/')||/^\/api\/.*\.js$/.test(path)||path==='/middleware.js')return new Response('Not Found',{status:404,headers});
  if(path==='/api/auth'||path==='/api/logout')return context.next();
  if(enabled){
    const expected=await hmacSha256Base64Url(env.SITE_AUTH_SECRET,env.SITE_PASSWORD);
    if(!equal(cookieValue(request,'wealth_gate'),expected)){
      if(path.startsWith('/api/')||path==='/proxy'||path==='/_proxy')return Response.json({error:'请先登录本站'},{status:401,headers});
      return new Response(login,{status:401,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    }
  }
  const upstream=await context.next();
  const response=new Response(upstream.body,upstream);
  for(const [name,value] of Object.entries(headers))response.headers.set(name,value);
  return response;
}
