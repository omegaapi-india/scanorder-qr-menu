/*
 * Shared server-side helpers for the ScanOrder API.
 * This file is never served to the browser.
 */

// Authoritative prices. Keep this map in sync with assets/menu.js.
// The server never trusts prices or totals sent by the client.
export const PRICES = Object.freeze({
  m1: 120, m2: 90, m3: 60, m4: 180, m5: 210, m6: 320, m7: 280,
  m8: 260, m9: 220, m10: 50, m11: 80, m12: 40, m13: 90, m14: 60
});

export const NAMES = Object.freeze({
  m1: 'Masala Dosa', m2: 'Idli Sambar', m3: 'Vada Pav', m4: 'Paneer Tikka',
  m5: 'Chicken 65', m6: 'Butter Chicken', m7: 'Paneer Butter Masala',
  m8: 'Biryani', m9: 'Veg Thali', m10: 'Garlic Naan', m11: 'Gulab Jamun',
  m12: 'Masala Chai', m13: 'Mango Lassi', m14: 'Fresh Lime Soda'
});

export const STATUSES = Object.freeze([
  'Pending', 'Preparing', 'Ready', 'Out for delivery', 'Delivered'
]);

const ORDER_TTL_SECONDS = 60 * 60 * 24; // 24 hours, then KV deletes the record

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY'
    }
  });
}

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function isAdmin(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = env.ADMIN_TOKEN;
  if (!expected || !token || token.length !== expected.length) return false;

  // Length-checked comparison to avoid trivial timing leaks.
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function allowRequest(env, request, bucket, limit, windowSeconds) {
  const ip = request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'local';
  const key = `rate:${bucket}:${ip}`;
  const raw = await env.ORDERS.get(key);
  let record = { count: 0 };
  try { if (raw) record = JSON.parse(raw); } catch (_) { /* reset broken record */ }
  if (record.count >= limit) return false;
  record.count += 1;
  await env.ORDERS.put(key, JSON.stringify(record), { expirationTtl: windowSeconds });
  return true;
}

export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'SO-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('').toUpperCase().slice(0, 8);
}

export function validOrderId(id) {
  return /^SO-[A-F0-9]{8}$/.test(id || '');
}

export function validateOrder(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body.' };

  const mode = body.mode === 'delivery' ? 'delivery' : 'table';
  const name = cleanText(body.name, 40);
  const phone = cleanText(body.phone, 16);
  const address = cleanText(body.address, 160);
  const note = cleanText(body.note, 120);
  const table = /^[A-Za-z0-9_-]{1,8}$/.test(body.table || '') ? body.table.toUpperCase() : '04';

  if (mode === 'delivery') {
    if (!/^\+?[0-9]{7,15}$/.test(phone)) return { error: 'A valid phone number is required for delivery.' };
    if (address.length < 6) return { error: 'A delivery address is required.' };
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
    return { error: 'Cart must contain between 1 and 30 items.' };
  }

  const seen = new Set();
  let total = 0;
  const items = [];
  for (const entry of body.items) {
    if (!entry || typeof entry !== 'object') return { error: 'Invalid cart item.' };
    const id = cleanText(entry.id, 10);
    const qty = Number(entry.qty);
    if (!PRICES[id] || seen.has(id)) return { error: 'Unknown or duplicate item in cart.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { error: 'Invalid item quantity.' };
    seen.add(id);
    total += PRICES[id] * qty;
    items.push({ id, name: NAMES[id], qty, price: PRICES[id] });
  }

  return {
    value: {
      id: newOrderId(),
      createdAt: new Date().toISOString(),
      mode,
      table: mode === 'delivery' ? null : table,
      name,
      phone: mode === 'delivery' ? phone : '',
      address: mode === 'delivery' ? address : '',
      note,
      items,
      total,
      driverCode: String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)),
      location: null,
      trail: [],
      status: 'Pending',
      etaMinutes: mode === 'delivery' ? 35 : 15,
      history: [{ status: 'Pending', at: new Date().toISOString() }]
    }
  };
}

export function publicOrder(order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    mode: order.mode,
    table: order.table,
    items: order.items,
    total: order.total,
    note: order.note,
    status: order.status,
    etaMinutes: order.etaMinutes,
    location: order.location || null,
    trail: order.trail || [],
    history: order.history
  };
}

export function isDriverCode(code, order) {
  return typeof code === 'string' && /^[0-9]{6}$/.test(code) && code === order.driverCode;
}

export function saveOrder(env, order) {
  return env.ORDERS.put(`order:${order.id}`, JSON.stringify(order), {
    expirationTtl: ORDER_TTL_SECONDS
  });
}

export async function listOrders(env) {
  const list = await env.ORDERS.list({ prefix: 'order:', limit: 100 });
  const results = await Promise.all(
    list.keys.map(async (key) => {
      const raw = await env.ORDERS.get(key.name);
      try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
    })
  );
  return results.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
