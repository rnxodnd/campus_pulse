import { json, readJson } from "./http";
import { validateSubscription } from "./validation";

export async function subscription(request: Request, env: Env, remove = false): Promise<Response> {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const input = validateSubscription(body);
  if (!input) return json({ error: "invalid_subscription" }, 400);
  const facility = await env.DB.prepare("SELECT id FROM facilities WHERE id = ? AND is_active = 1")
    .bind(input.facility_id).first<{ id: string }>();
  if (!facility) return json({ error: "facility_not_found" }, 404);
  if (remove) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE facility_id = ? AND fcm_token = ?")
      .bind(input.facility_id, input.fcm_token).run();
    return json({ removed: true });
  }
  await env.DB.prepare(`
    INSERT INTO push_subscriptions (facility_id, fcm_token)
    VALUES (?, ?)
    ON CONFLICT (facility_id, fcm_token) DO UPDATE SET created_at = excluded.created_at
  `).bind(input.facility_id, input.fcm_token).run();
  return json({ subscribed: true }, 201);
}
