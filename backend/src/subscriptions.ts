import { json, readJson } from "./http";
import { validateAlertHistory, validateSubscription } from "./validation";

export async function subscription(request: Request, env: Env, remove = false): Promise<Response> {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  if (remove) {
    if (!body || typeof body !== "object") return json({ error: "invalid_subscription" }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.facility_id !== "string" || !input.facility_id.trim() ||
        typeof input.push_token !== "string" || !input.push_token.trim() || input.push_token.length > 4096) {
      return json({ error: "invalid_subscription" }, 400);
    }
    const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
      .bind(input.facility_id).first<{ id: string }>();
    if (!facility) return json({ error: "facility_not_found" }, 404);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE facility_id = ? AND push_token = ?")
      .bind(input.facility_id, input.push_token).run();
    return json({ removed: true });
  }
  const input = validateSubscription(body);
  if (!input) return json({ error: "invalid_subscription" }, 400);
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(input.facility_id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  await env.DB.prepare(`
    INSERT INTO push_subscriptions (facility_id, push_token, notify_on_medium, notify_on_low)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (facility_id, push_token) DO UPDATE SET
      notify_on_medium = excluded.notify_on_medium,
      notify_on_low = excluded.notify_on_low,
      created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(
    input.facility_id,
    input.push_token,
    input.notify_on_medium ? 1 : 0,
    input.notify_on_low ? 1 : 0,
  ).run();
  return json({ subscribed: true }, 201);
}

export async function alertHistory(request: Request, env: Env, remove = false): Promise<Response> {
  const body = await request.json().catch(() => null);
  const input = validateAlertHistory(body);
  if (!input) return json({ error: "invalid_alert_history_request" }, 400);

  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(input.facility_id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);

  if (remove) {
    await env.DB.prepare("DELETE FROM notification_history WHERE facility_id = ? AND push_token = ?")
      .bind(input.facility_id, input.push_token).run();
    return json({ cleared: true });
  }

  const alerts = await env.DB.prepare(`
    SELECT analysis_id AS id, previous_level, crowd_level, head_count, created_at
      FROM notification_history
     WHERE facility_id = ? AND push_token = ?
     ORDER BY created_at DESC LIMIT 100
  `).bind(input.facility_id, input.push_token).all<Record<string, unknown>>();
  return json({ alerts: alerts.results ?? [] });
}
