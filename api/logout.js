export default function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const secure = proto === 'https' || process.env.VERCEL === '1';
  const cookie = `wealth_gate=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
  res.redirect(302, '/');
}
