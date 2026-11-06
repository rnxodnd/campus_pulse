import { isLessCrowded } from "./crowd";
import type { CrowdLevel } from "./types";

type SubscriptionRow = {
  push_token: string;
  notify_on_medium: number;
  notify_on_low: number;
};

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

function shouldNotify(subscription: SubscriptionRow, nextLevel: CrowdLevel): boolean {
  if (nextLevel === "MEDIUM") return subscription.notify_on_medium === 1;
  if (nextLevel === "LOW") return subscription.notify_on_low === 1;
  return false;
}

export async function notifySubscribers(
  env: Env,
  facilityId: string,
  previousLevel: CrowdLevel,
  nextLevel: CrowdLevel,
  headCount: number,
  analysisId: string,
): Promise<void> {
  if (!isLessCrowded(previousLevel, nextLevel)) return;

  const subscriptions = await env.DB.prepare(`
    SELECT push_token, notify_on_medium, notify_on_low
      FROM push_subscriptions WHERE facility_id = ?
  `).bind(facilityId).all<SubscriptionRow>();
  const eligible = (subscriptions.results ?? []).filter((item) => shouldNotify(item, nextLevel));
  if (eligible.length === 0) return;

  const title = "5공학관 식당 혼잡도가 낮아졌어요";
  const previousLabel = previousLevel === "HIGH" ? "포화" : "보통";
  const nextLabel = nextLevel === "LOW" ? "여유" : "보통";
  const message = {
    title,
    body: `${previousLabel}에서 ${nextLabel} 상태로 바뀌었어요. 감지 인원 ${headCount}명`,
  };

  for (const subscription of eligible) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: subscription.push_token,
          sound: "default",
          title: message.title,
          body: message.body,
          channelId: "default",
          data: {
            facility_id: facilityId,
            previous_level: previousLevel,
            crowd_level: nextLevel,
            head_count: String(headCount),
            type: "crowd_level_decreased",
          },
          priority: "high",
        }),
      });
      const result = await response.json() as { data?: ExpoTicket | ExpoTicket[] };
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!response.ok || ticket?.status !== "ok") {
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE push_token = ?")
            .bind(subscription.push_token).run();
        }
        console.error(`Expo Push delivery failed (${response.status}, ${ticket?.details?.error ?? "ticket_error"})`);
        continue;
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO notification_history (
          facility_id, push_token, analysis_id, previous_level, crowd_level, head_count
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(facilityId, subscription.push_token, analysisId, previousLevel, nextLevel, headCount).run();
    } catch (error) {
      console.error("Expo Push delivery failed", error);
    }
  }
}
