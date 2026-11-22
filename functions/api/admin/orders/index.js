import { isAdmin, json, listOrders } from '../../../../lib/api.js';

// GET /api/admin/orders — token-protected list of live orders.
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);

  const orders = await listOrders(env);
  return json({ orders, count: orders.length });
}
