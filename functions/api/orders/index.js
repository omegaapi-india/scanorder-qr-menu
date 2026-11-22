import { allowRequest, json, saveOrder, validateOrder } from '../../../lib/api.js';

// POST /api/orders — public order creation.
export async function onRequestPost(context) {
  const { request, env } = context;

  // Simple anti-abuse limit: 5 orders per IP per 10 minutes.
  const allowed = await allowRequest(env, request, 'order', 5, 600);
  if (!allowed) return json({ error: 'Too many orders. Please try again in a few minutes.' }, 429);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Invalid JSON.' }, 400); }

  const result = validateOrder(body);
  if (result.error) return json({ error: result.error }, 400);

  await saveOrder(env, result.value);

  return json({
    id: result.value.id,
    status: result.value.status,
    total: result.value.total,
    etaMinutes: result.value.etaMinutes,
    trackPath: `/track.html?id=${result.value.id}`
  }, 201);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { allow: 'POST, OPTIONS' }
  });
}
