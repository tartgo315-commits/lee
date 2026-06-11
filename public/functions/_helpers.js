/** 共享响应与请求工具（下划线目录不参与 Pages 路由） */

export function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', ...extra };
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

export function textResponse(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: corsHeaders({
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

export function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: corsHeaders({
      'Content-Type': 'text/html; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

export function redirectResponse(url, status = 302, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: { Location: url, ...extraHeaders },
  });
}

export function optionsResponse(allowMethods = 'GET, OPTIONS', allowHeaders = 'Content-Type') {
  return new Response(null, {
    status: 204,
    headers: corsHeaders({
      'Access-Control-Allow-Methods': allowMethods,
      'Access-Control-Allow-Headers': allowHeaders,
    }),
  });
}

export function getQueryParam(url, name) {
  return url.searchParams.get(name);
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function isSecureRequest(request) {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return proto === 'https';
}

export async function hmacSha256Base64Url(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
