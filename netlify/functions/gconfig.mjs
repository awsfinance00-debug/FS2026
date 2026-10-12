// Public (browser-safe) Google settings, read from Netlify environment variables.
export default async () =>
  new Response(JSON.stringify({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    apiKey: process.env.GOOGLE_API_KEY || '',
    appId: process.env.GOOGLE_APP_ID || ''
  }), { headers: { 'content-type': 'application/json' } });
export const config = { path: '/api/gconfig' };
