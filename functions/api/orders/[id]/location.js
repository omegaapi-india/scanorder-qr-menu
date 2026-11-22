import { isDriverCode, json, saveOrder, validOrderId } from '../../../../lib/api.js';

// POST /api/orders/:id/location — delivery boy shares live GPS coordinates.
// Authenticated with the order-specific 6-digit driver code, not a global secret.
export async function onRequestPost(context) {
  const { request, env, params } = context;
  const id = String(params.id || '').toUpperCase();
  if (!validOrderId(id)) return json({ error: 'Invalid order ID.' }, 400);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON.' }, 400); }

  const key = `order:${id}`;
  const raw = await env.ORDERS.get(key);
  if (!raw) return json({ error: 'Order not found.' }, 404);

  let order;
  try { order = JSON.parse(raw); } catch (_) { return json({ error: 'Order record is unreadable.' }, 500); }

  const code = request.headers.get('x-driver-code') || '';
  if (!isDriverCode(code, order)) return json({ error: 'Invalid driver code.' }, 401);

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return json({ error: 'Invalid latitude.' }, 400);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return json({ error: 'Invalid longitude.' }, 400);

  // Throttle writes: the free KV tier allows 1,000 writes/day.
  const stampKey = `lastloc:${id}`;
  const last = Number(await env.ORDERS.get(stampKey) || 0);
  if (Date.now() - last < 12000) {
    return json({ error: 'Location updated too recently. Try again in a few seconds.' }, 429);
  }
  await env.ORDERS.put(stampKey, String(Date.now()), { expirationTtl: 120 });

  const point = {
    lat: Math.round(lat * 100000) / 100000,
    lng: Math.round(lng * 100000) / 100000,
    at: new Date().toISOString(),
    accuracy: Number.isFinite(Number(body.accuracy)) ? Math.round(Number(body.accuracy)) : null
  };

  order.location = point;
  order.trail = Array.isArray(order.trail) ? order.trail : [];
  order.trail.push({ lat: point.lat, lng: point.lng, at: point.at });
  if (order.trail.length > 40) order.trail = order.trail.slice(-40);
  await saveOrder(env, order);

  return json({ ok: true, at: point.at, status: order.status, etaMinutes: order.etaMinutes });
}
