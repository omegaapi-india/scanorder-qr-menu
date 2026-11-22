import { isAdmin, json, saveOrder, STATUSES, validOrderId } from '../../../../lib/api.js';

// PATCH /api/admin/orders/:id — update order status. Token required.
export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);

  const id = String(params.id || '').toUpperCase();
  if (!validOrderId(id)) return json({ error: 'Invalid order ID.' }, 400);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON.' }, 400); }

  const status = String(body.status || '');
  if (!STATUSES.includes(status)) return json({ error: 'Unknown status.' }, 400);

  const key = `order:${id}`;
  const raw = await env.ORDERS.get(key);
  if (!raw) return json({ error: 'Order not found.' }, 404);

  let order;
  try { order = JSON.parse(raw); } catch (_) { return json({ error: 'Order record is unreadable.' }, 500); }

  if (order.status !== status) {
    order.status = status;
    order.history = Array.isArray(order.history) ? order.history : [];
    order.history.push({ status, at: new Date().toISOString() });
    await saveOrder(env, order);
  }

  return json({ ok: true, order });
}
