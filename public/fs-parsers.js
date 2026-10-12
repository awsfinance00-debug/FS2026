// Platform report readers. Each detector returns {kind,label,platform,start,end,rows,summary} or null.
// Works in the browser (window.FSP) and in Node tests (module.exports). Needs SheetJS (XLSX).
(function (root) {
  const nz = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const pad = n => String(n).padStart(2, '0');
  const num = v => {
    if (typeof v == 'number') return v;
    const s = String(v ?? '').replace(/[₱,\s]/g, '');
    if (!s) return 0;
    if (s.endsWith('%')) return (parseFloat(s) || 0) / 100;
    return parseFloat(s) || 0;
  };
  const r2 = v => Math.round(v * 100) / 100;
  const ymd = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

  // "[Date Range]: 2026-09-01 ~ 2026-09-30", "...T00:00:00 ~ 2026-10-01T00:00:00" (end exclusive), "Analysis date: 01/09/2026~30/09/2026"
  function range(text) {
    const s = String(text || '');
    let m = s.match(/(\d{4}-\d\d-\d\d)(T[\d:]+)?\s*~\s*(\d{4}-\d\d-\d\d)(T([\d:]+))?/);
    if (m) {
      let end = m[3];
      if (m[5] && /^00:00(:00)?$/.test(m[5]) && end > m[1]) { const d = new Date(end + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); end = ymd(d); }
      return { start: m[1], end };
    }
    m = s.match(/(\d\d)\/(\d\d)\/(\d{4})\s*~\s*(\d\d)\/(\d\d)\/(\d{4})/);
    if (m) {
      const mdy = +m[2] > 12 || +m[5] > 12; // TikTok PH exports are DD/MM unless that is impossible
      const f = (a, b, y) => mdy ? `${y}-${a}-${b}` : `${y}-${b}-${a}`;
      return { start: f(m[1], m[2], m[3]), end: f(m[4], m[5], m[6]) };
    }
    return null;
  }

  const grid = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  function findHeader(g, need) {
    for (let i = 0; i < Math.min(g.length, 15); i++) {
      const h = g[i].map(nz);
      if (need.every(n => h.includes(nz(n)))) return i;
    }
    return -1;
  }
  function rangeIn(g, hi) { for (let i = 0; i < hi; i++) for (const c of g[i]) { const r = range(c); if (r) return r; } return null; }
  const top = (a, k, n = 5) => [...a].sort((x, y) => y[k] - x[k]).slice(0, n);
  const short = s => String(s).replace(/^Discounted Best Selling Official Brand\s*/i, '').slice(0, 70);

  // TikTok Shop › Analytics › Product list (multi-section export: All / Seller LIVE / Seller video / Affiliate / Product card)
  function productList(g) {
    const hi = findHeader(g, ['Product Name', 'Product ID', 'GMV range']);
    if (hi < 0) return null;
    const H = g[hi].map(nz), col = name => H.indexOf(nz(name)); // first occurrence = "All" section
    const F = { name: 'Product Name', id: 'Product ID', gmv: 'GMV', live: 'Seller LIVE-attributed GMV', video: 'Seller video-attributed GMV', creator: 'Creator-attributed GMV', card: 'Seller product card GMV', orders: 'Orders', skuOrders: 'SKU orders', items: 'Items sold', customers: 'Est. customers', impressions: 'Product impressions', clicks: 'Product clicks', atc: 'Add-to-cart count', cofund: 'Gross merchandise value (with TikTok co-funding)', shipping: 'Shipping fees', refunds: 'Refunds', itemsRefunded: 'Items refunded' };
    const ix = Object.fromEntries(Object.entries(F).map(([k, n]) => [k, col(n)]));
    const rows = g.slice(hi + 1).filter(r => r[ix.id] || r[ix.name]).map(r => {
      const o = {};
      for (const k in ix) o[k] = ix[k] < 0 ? (k == 'name' || k == 'id' ? '' : 0) : (k == 'name' || k == 'id' ? String(r[ix[k]]).trim() : num(r[ix[k]]));
      return o;
    });
    const t = k => r2(rows.reduce((s, r) => s + r[k], 0));
    const T = Object.fromEntries(Object.keys(F).filter(k => k != 'name' && k != 'id').map(k => [k, t(k)]));
    const per = rangeIn(g, hi);
    return {
      kind: 'tt_products', label: 'TikTok product list', platform: 'TikTok', ...per, rows,
      summary: {
        products: rows.length, selling: rows.filter(r => r.gmv > 0).length, ...T,
        aov: T.orders ? r2(T.gmv / T.orders) : 0, ctr: T.impressions ? T.clicks / T.impressions : 0, conv: T.clicks ? T.orders / T.clicks : 0,
        refundRate: T.gmv ? T.refunds / T.gmv : 0,
        channels: { 'Seller LIVE': T.live, 'Creator / Affiliate': T.creator, 'Product card': T.card, 'Seller video': T.video },
        top: top(rows, 'gmv').filter(r => r.gmv > 0).map(r => ({ name: short(r.name), id: r.id, gmv: r.gmv, items: r.items, refunds: r.refunds }))
      }
    };
  }

  // TikTok Shop › Analytics › Product card traffic (daily)
  function traffic(g) {
    const hi = findHeader(g, ['Time', 'Views', 'Viewers', 'Clicks']);
    if (hi < 0) return null;
    const H = g[hi].map(nz), c = n => H.indexOf(nz(n));
    const ix = { date: c('Time'), views: c('Views'), viewers: c('Viewers'), uclicks: c('Unique Clicks'), clicks: c('Clicks'), atc: c('Clicks Add to Cart'), atcUsers: c('Add To Cart User'), customers: c('Customers'), orders: c('Attributed SKU orders'), cardGmv: c('Product card-attributed GMV (₱)'), contentGmv: c('Content attributed GMV (₱)') };
    const rows = g.slice(hi + 1).filter(r => /^\d{4}-\d\d-\d\d/.test(String(r[ix.date]))).map(r => {
      const o = { date: String(r[ix.date]).slice(0, 10) };
      for (const k in ix) if (k != 'date') o[k] = ix[k] < 0 ? 0 : num(r[ix[k]]);
      return o;
    });
    if (!rows.length) return null;
    const t = k => r2(rows.reduce((s, r) => s + r[k], 0));
    const T = Object.fromEntries(Object.keys(ix).filter(k => k != 'date').map(k => [k, t(k)]));
    const per = rangeIn(g, hi) || { start: rows[0].date, end: rows.at(-1).date };
    return {
      kind: 'tt_traffic', label: 'TikTok product card traffic', platform: 'TikTok', ...per, rows,
      summary: { days: rows.length, ...T, ctr: T.views ? T.clicks / T.views : 0, viewToPaid: T.viewers ? T.customers / T.viewers : 0, cartToPaid: T.atcUsers ? T.customers / T.atcUsers : 0, daily: rows.map(r => [r.date, r.views, r.cardGmv + r.contentGmv]) }
    };
  }

  // TikTok Shop › Marketing › Promotions list
  function promotions(g) {
    const hi = findHeader(g, ['ID', 'Promotion name', 'Discount amount (₱)']);
    if (hi < 0) return null;
    const H = g[hi].map(nz), c = n => H.indexOf(nz(n));
    const ix = { id: c('ID'), name: c('Promotion name'), status: c('Status'), period: c('Promotion period'), type: c('Type'), gmv: c('GMV (₱)'), orders: c('Orders'), discount: c('Discount amount (₱)'), roi: c('ROI'), items: c('Items sold') };
    const txt = new Set(['id', 'name', 'status', 'period', 'type']);
    const rows = g.slice(hi + 1).filter(r => r[ix.id]).map(r => { const o = {}; for (const k in ix) o[k] = ix[k] < 0 ? (txt.has(k) ? '' : 0) : (txt.has(k) ? String(r[ix[k]]).trim() : num(r[ix[k]])); return o; });
    const used = rows.filter(r => r.gmv > 0 || r.discount > 0);
    const gmv = r2(used.reduce((s, r) => s + r.gmv, 0)), disc = r2(used.reduce((s, r) => s + r.discount, 0));
    return {
      kind: 'tt_promotions', label: 'TikTok promotions list', platform: 'TikTok', ...rangeIn(g, hi), rows,
      summary: {
        promos: rows.length, withSales: used.length, ongoing: rows.filter(r => r.status == 'ongoing').length, gmv, discount: disc,
        orders: used.reduce((s, r) => s + r.orders, 0), roi: disc ? r2(gmv / disc) : 0, discountRate: gmv + disc ? disc / (gmv + disc) : 0,
        top: top(used, 'gmv').map(r => ({ name: r.name, status: r.status, gmv: r.gmv, discount: r.discount, roi: r.roi })),
        lowRoi: used.filter(r => r.discount >= 1000 && r.roi > 0 && r.roi < 2).sort((a, b) => a.roi - b.roi).slice(0, 5).map(r => ({ name: r.name, gmv: r.gmv, discount: r.discount, roi: r.roi }))
      }
    };
  }

  const DETECTORS = [productList, traffic, promotions];
  function detect(wb) {
    for (const n of wb.SheetNames) { const g = grid(wb.Sheets[n]); for (const d of DETECTORS) { const r = d(g); if (r) return { ...r, sheet: n }; } }
    return null;
  }
  // "Basic_City_product_list_20260901.xlsx" -> "Basic City"
  function brandFromName(file, brands) {
    const base = String(file).replace(/^[0-9a-f]{8}-/i, '').replace(/\.[^.]+$/, '');
    const n = nz(base);
    const hit = (brands || []).filter(b => nz(b) && n.includes(nz(b))).sort((a, b) => nz(b).length - nz(a).length)[0];
    if (hit) return hit;
    const m = base.match(/^(.+?)[_\s-]+(product|shop|promotion|traffic|order|settlement|income|ads?|live)/i);
    return m ? m[1].replace(/[_-]+/g, ' ').trim() : '';
  }
  const api = { detect, range, brandFromName, num };
  if (typeof module != 'undefined' && module.exports) module.exports = api; else root.FSP = api;
})(typeof window != 'undefined' ? window : globalThis);
