import { J, guard } from '../lib/auth.mjs';

export default guard(async (req) => {
  let link;
  try { link = new URL(new URL(req.url).searchParams.get('url')); } catch { return J({ error: 'That is not a valid link' }, 400); }
  if (!['docs.google.com', 'drive.google.com'].includes(link.hostname)) return J({ error: 'Only Google Drive / Docs links are allowed' }, 400);

  if (/\/folders\//.test(link.pathname)) return J({ error: 'That is a folder link. Open the file itself, click Share > Copy link, and paste that link.' }, 400);
  const pub = link.pathname.match(/\/d\/e\/([\w-]+)/);
  const id = (link.pathname.match(/\/d\/(?!e\/)([\w-]+)/) || [])[1] || link.searchParams.get('id');
  if (!id && !pub) return J({ error: 'No file ID in that link. Use a link to one file, like https://docs.google.com/spreadsheets/d/.../edit or https://drive.google.com/file/d/.../view' }, 400);
  const target = pub
    ? `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=xlsx`
    : link.pathname.includes('/spreadsheets/')
      ? `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
      : `https://drive.google.com/uc?export=download&id=${id}`;

  const r = await fetch(target, { redirect: 'follow' });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || type.includes('text/html')) return J({ error: 'Google refused access. Set the file to "Anyone with the link can view" and try again.' }, 403);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 6e6) return J({ error: 'File is too large for link import (6 MB max). Download it and use the normal import.' }, 413);
  return new Response(buf, { headers: { 'content-type': 'application/octet-stream' } });
});

export const config = { path: '/api/gfetch' };
