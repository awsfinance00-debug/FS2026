import { createHash } from 'node:crypto';
import { J, store, guard, audit } from '../lib/auth.mjs';

const MAX = 5.5e6; // Netlify synchronous function payload limit is 6 MB
const ALLOWED = /\.(xlsx|xls|csv|pdf|docx?|pptx?|png|jpe?g|webp|heic|txt|zip)$/i;

// File vault. POST raw body (x-file-name header) -> {id}; GET ?id= -> file; DELETE ?id= (owner only).
export default guard(async (req, user) => {
  const files = store('ledger-files'), url = new URL(req.url), id = url.searchParams.get('id') || '';
  if (req.method === 'POST') {
    const name = decodeURIComponent(req.headers.get('x-file-name') || 'file').slice(0, 200);
    if (!ALLOWED.test(name)) return J({ error: 'File type not allowed: ' + name }, 415);
    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) return J({ error: 'Empty file' }, 400);
    if (buf.length > MAX) return J({ error: 'File is larger than 5.5 MB. Split or compress it.' }, 413);
    const hash = createHash('sha256').update(buf).digest('hex'), key = 'f/' + hash;
    const exists = await files.getMetadata(key);
    if (!exists) {
      await files.set(key, buf, { metadata: { name, type: req.headers.get('content-type') || 'application/octet-stream', size: buf.length, by: user.name, at: new Date().toISOString() } });
      await audit(user, 'file.upload', `${name} (${Math.round(buf.length / 1024)} KB) ${hash.slice(0, 12)}`);
    }
    return J({ id: hash, size: buf.length, existed: !!exists });
  }
  if (!/^[0-9a-f]{64}$/.test(id)) return J({ error: 'bad id' }, 400);
  if (req.method === 'GET') {
    const r = await files.getWithMetadata('f/' + id, { type: 'arrayBuffer' });
    if (!r) return J({ error: 'not found' }, 404);
    return new Response(r.data, { headers: { 'content-type': r.metadata.type || 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(r.metadata.name || id)}`, 'cache-control': 'private, no-store' } });
  }
  if (req.method === 'DELETE') {
    if (user.role != 'owner') return J({ error: 'Only the owner can permanently delete stored files' }, 403);
    await files.delete('f/' + id);
    await audit(user, 'file.delete', id.slice(0, 12));
    return J({ ok: true });
  }
  return J({ error: 'method not allowed' }, 405);
});

export const config = { path: '/api/files' };
