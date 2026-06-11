import { isSecureRequest, redirectResponse } from '../_helpers.js';

export async function onRequest(context) {
  const { request } = context;
  const secure = isSecureRequest(request);
  const cookie = `wealth_gate=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  return redirectResponse('/', 302, { 'Set-Cookie': cookie });
}
