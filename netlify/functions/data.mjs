import { J, ledger, guard, audit } from '../lib/auth.mjs';

// Shared dataset (ledger tables + document registry). Optimistic locking on `rev`.
export default guard(async (req, user) => {
  const store = ledger();
  const cur = (await store.get('state', { type: 'json' })) || { rev: 0, data: null };
  if (req.method === 'GET') return J({ ...cur, me: user });
  if (req.method === 'PUT') {
    const { rev, data, note } = await req.json();
    if (!data || typeof data != 'object' || Array.isArray(data)) return J({ error: 'invalid data' }, 400);
    if (rev !== cur.rev) return J({ error: 'conflict', rev: cur.rev }, 409);
    await store.setJSON('state', { rev: rev + 1, data, at: Date.now(), by: user.name });
    if (note) await audit(user, 'save', note);
    return J({ rev: rev + 1 });
  }
  return J({ error: 'method not allowed' }, 405);
});

export const config = { path: '/api/data' };
