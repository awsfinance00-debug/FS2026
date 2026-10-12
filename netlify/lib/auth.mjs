// Shared auth + audit helpers for Ledger functions (bundled into each function by Netlify).
import { getStore } from '@netlify/blobs';
import { createHmac, createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export const J = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const store = name => getStore({ name, consistency: 'strong' });
export const ledger = () => store('ledger');

const TTL = 3 * 24 * 3600e3; // sessions last 3 days
const b64 = s => Buffer.from(s).toString('base64url');
function secret() {
  const pw = process.env.APP_PASSWORD || '';
  if (!pw) throw Object.assign(new Error('APP_PASSWORD is not set in Netlify environment variables (then redeploy)'), { status: 500 });
  return process.env.SESSION_SECRET || createHash('sha256').update('ledger-session:' + pw).digest('hex');
}
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length == y.length && timingSafeEqual(x, y); };
const sig = p => createHmac('sha256', secret()).update(p).digest('base64url');

export function sign(user) {
  const p = b64(JSON.stringify({ e: user.email, n: user.name, r: user.role, x: Date.now() + TTL }));
  return p + '.' + sig(p);
}
export const hashPw = (pw, salt = randomBytes(16).toString('hex')) => salt + ':' + scryptSync(pw, salt, 32).toString('hex');
export const checkPw = (pw, stored) => { const [salt] = String(stored).split(':'); return !!salt && eq(hashPw(pw, salt), stored); };

export async function users() { return (await ledger().get('users', { type: 'json' })) || []; }
export async function saveUsers(list) { await ledger().setJSON('users', list); }

// Returns {email,name,role} or throws {status}. Owner = APP_PASSWORD holder (also accepts the old raw-password header).
export async function authenticate(req) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const pw = process.env.APP_PASSWORD || '';
  secret();
  if (tok && eq(tok, pw)) return { email: 'owner', name: 'Owner', role: 'owner' };
  const [p, s] = tok.split('.');
  if (p && s && eq(sig(p), s)) {
    const c = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (c.x > Date.now()) {
      if (c.r == 'owner') return { email: c.e, name: c.n, role: 'owner' };
      const u = (await users()).find(u => u.email == c.e && u.active !== false);
      if (u) return { email: u.email, name: u.name, role: u.role || 'finance' };
    }
  }
  throw Object.assign(new Error('unauthorized'), { status: 401 });
}

// Append-only audit trail: one blob per event, key sorts by time.
export async function audit(user, action, detail = '') {
  try {
    const at = new Date().toISOString();
    await store('ledger-audit').setJSON(`a/${at}-${randomBytes(3).toString('hex')}`, { at, by: user.name, email: user.email, action, detail: String(detail).slice(0, 500) });
  } catch (e) { console.error('audit failed', e); }
}

export const guard = fn => async req => {
  try { return await fn(req, await authenticate(req)); }
  catch (e) { return J({ error: e.message || 'error' }, e.status || 500); }
};
