export default function handler(req,res) {
  const enabled=!!(process.env.SITE_PASSWORD&&process.env.SITE_AUTH_SECRET);
  const incomplete=!!(process.env.SITE_PASSWORD||process.env.SITE_AUTH_SECRET)&&!enabled;
  res.setHeader('Cache-Control','no-store');
  res.status(200).json({enabled,configured:!incomplete});
}
