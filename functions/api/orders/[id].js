import { json, publicOrder, validOrderId } from '../../../lib/api.js';

// GET /api/orders/:id — public tracking. Never returns phone or address.
export async function onRequestGet(context) {
  const { env, params } = context;
  const id = String(params.id || '').toUpperCase();
  if (!validOrderId(id)) return json({ error: 'Invalid order ID.' }, 400);

  const raw = await env.ORDERS.get(`order:${id}`);
  if (!raw) return json({ error: 'Order not found. It may have expired after 24 hours.' }, 404);

  try {
    return json(publicOrder(JSON.parse(raw)));
  } catch (_) {
    return json({ error: 'Order record is unreadable.' }, 500);
  }
}
