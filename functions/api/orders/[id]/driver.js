import { isDriverCode, json, publicOrder, validOrderId } from '../../../../lib/api.js';

// GET /api/orders/:id/driver — details the driver needs to complete delivery.
// Uses the order-specific code as a header, never a global browser secret.
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = String(params.id || '').toUpperCase();
  if (!validOrderId(id)) return json({ error: 'Invalid order ID.' }, 400);

  const raw = await env.ORDERS.get(`order:${id}`);
  if (!raw) return json({ error: 'Order not found.' }, 404);

  let order;
  try { order = JSON.parse(raw); } catch (_) { return json({ error: 'Order record is unreadable.' }, 500); }

  const code = request.headers.get('x-driver-code') || '';
  if (!isDriverCode(code, order)) return json({ error: 'Invalid driver code.' }, 401);

  const visible = publicOrder(order);
  return json({
    id: visible.id,
    mode: visible.mode,
    table: visible.table,
    name: order.name,
    phone: order.phone,
    address: order.address,
    items: visible.items,
    total: visible.total,
    status: visible.status,
    note: visible.note
  });
}
