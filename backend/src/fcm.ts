import type { CrowdLevel } from "./types";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let cachedFcmToken: { token: string; expiresAt: number } | undefined;

function base64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFcmAccessToken(env: Env): Promise<string> {
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) return cachedFcmToken.token;
  if (!env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) throw new Error("FCM credentials are not configured");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: env.FCM_CLIENT_EMAIL,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))}`;
  const pem = env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(pem);
  const keyBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth failed (${response.status})`);
  const result = await response.json() as { access_token: string; expires_in: number };
  cachedFcmToken = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

export async function notifySubscribers(env: Env, facilityId: string, crowdLevel: CrowdLevel): Promise<void> {
  try {
    if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
      console.warn("FCM is not configured; skipping push delivery");
      return;
    }
    const subscriptions = await env.DB.prepare(
      "SELECT fcm_token FROM push_subscriptions WHERE facility_id = ?",
    ).bind(facilityId).all<{ fcm_token: string }>();
    if (!subscriptions.results?.length) return;
    const accessToken = await getFcmAccessToken(env);
    const title = "5공학관 식당 자리가 났어요";
    const body = crowdLevel === "LOW" ? "현재 혼잡도가 여유 상태예요." : "현재 혼잡도가 보통으로 낮아졌어요.";
    for (const subscription of subscriptions.results) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ message: {
          token: subscription.fcm_token,
          notification: { title, body },
          data: { facility_id: facilityId, crowd_level: crowdLevel, type: "seats_available" },
          android: { priority: "high" },
        } }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.includes("UNREGISTERED")) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE fcm_token = ?")
            .bind(subscription.fcm_token).run();
        }
        console.error(`FCM send failed (${response.status})`);
      }
    }
  } catch (error) {
    console.error("Push notification delivery failed", error);
  }
}
