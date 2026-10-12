import { J, store, sign, users, saveUsers, hashPw, checkPw, authenticate, guard, audit } from '../lib/auth.mjs';

const clean = s => String(s || '').trim().toLowerCase();
const fails = new Map(); // per-instance brute-force throttle

// POST {action:'login', email, password}  — owner signs in with email "owner" (or blank) + APP_PASSWORD
// POST {action:'users'|'add'|'remove'|'reset'|'audit', ...} — signed-in actions
export default async req => {
  if (req.method !== 'POST') return J({ error: 'method not allowed' }, 405);
  let b; try { b = await req.json(); } catch { return J({ error: 'bad request' }, 400); }
  if (b.action === 'login') {
    try {
      const email = clean(b.email) || 'owner', ip = req.headers.get('x-nf-client-connection-ip') || '', k = email + '|' + ip, f = fails.get(k) || { n: 0, t: 0 };
      if (f.n >= 5 && Date.now() - f.t < 10 * 60e3) return J({ error: 'Too many attempts. Wait 10 minutes.' }, 429);
      let u = null;
      if (email === 'owner' && b.password === process.env.APP_PASSWORD && process.env.APP_PASSWORD) u = { email: 'owner', name: 'Owner', role: 'owner' };
      else { const x = (await users()).find(x => x.email === email && x.active !== false); if (x && checkPw(String(b.password || ''), x.pw)) u = x; }
      if (!u) { fails.set(k, { n: f.n + 1, t: Date.now() }); return J({ error: 'Wrong email or password' }, 401); }
      fails.delete(k);
      await audit(u, 'login');
      return J({ token: sign(u), me: { email: u.email, name: u.name, role: u.role || 'finance' } });
    } catch (e) { return J({ error: e.message }, e.status || 500); }
  }
  return guard(async (_req, me) => {
    if (b.action === 'audit') {
      const s = store('ledger-audit'), { blobs } = await s.list({ prefix: 'a/' });
      const keys = blobs.map(x => x.key).sort().reverse().slice(0, 150);
      return J({ items: (await Promise.all(keys.map(k => s.get(k, { type: 'json' })))).filter(Boolean) });
    }
    if (me.role !== 'owner') return J({ error: 'Only the owner can manage users' }, 403);
    let list = await users();
    const pub = () => list.map(({ pw, ...u }) => u);
    if (b.action === 'users') return J({ users: pub() });
    const email = clean(b.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return J({ error: 'Enter a valid email' }, 400);
    if (b.action === 'add' || b.action === 'reset') {
      if (String(b.password || '').length < 10) return J({ error: 'Password must be at least 10 characters' }, 400);
      const ex = list.find(u => u.email === email);
      if (b.action === 'add' && ex) return J({ error: 'That user already exists' }, 409);
      if (b.action === 'reset' && !ex) return J({ error: 'No such user' }, 404);
      if (ex) ex.pw = hashPw(b.password), ex.active = true;
      else list.push({ email, name: String(b.name || email).slice(0, 60), role: 'finance', active: true, pw: hashPw(b.password), added: new Date().toISOString() });
    } else if (b.action === 'remove') list = list.filter(u => u.email !== email);
    else return J({ error: 'unknown action' }, 400);
    await saveUsers(list);
    await audit(me, 'user.' + b.action, email);
    return J({ users: pub() });
  })(req);
};

export const config = { path: '/api/auth' };
