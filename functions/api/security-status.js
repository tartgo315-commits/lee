/** Read-only status for the current Cloudflare deployment. */
export function onRequest({env}) {
  // Kept in sync with the Pages middleware, which enforces this configuration.
  return Response.json({
    enabled:!!(env.SITE_PASSWORD&&env.SITE_AUTH_SECRET),
    configured:!!(env.SITE_PASSWORD&&env.SITE_AUTH_SECRET),
    gateSupported:true,
    misconfigured:!!(env.SITE_PASSWORD||env.SITE_AUTH_SECRET)&&!(env.SITE_PASSWORD&&env.SITE_AUTH_SECRET),
  },{headers:{'Cache-Control':'no-store'}});
}
