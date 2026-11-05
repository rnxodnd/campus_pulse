import type { ObservationInput, SubscriptionInput } from "./types";

export const STALE_AFTER_MS = 5 * 60 * 1000;

export function isStale(capturedAt: string): boolean {
  const timestamp = Date.parse(capturedAt);
  return !Number.isFinite(timestamp) || Date.now() - timestamp > STALE_AFTER_MS || timestamp > Date.now() + 60_000;
}

export function validateObservation(value: unknown): ObservationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.facility_id !== "string" || !input.facility_id.trim()) return null;
  if (typeof input.captured_at !== "string" || !Number.isFinite(Date.parse(input.captured_at))) return null;
  if (!["OK", "DELAYED", "ERROR"].includes(String(input.analysis_status))) return null;
  const numericFields = ["total_seats", "available_seats", "belongings_seats", "occupied_seats", "unknown_seats", "seated_people"];
  if (input.analysis_status === "ERROR") {
    if (numericFields.some((key) => input[key] !== null) || input.queue_people !== null) return null;
    if (input.crowd_level !== null && !["LOW", "MEDIUM", "HIGH"].includes(String(input.crowd_level))) return null;
  } else {
    if (numericFields.some((key) => !Number.isInteger(input[key]) || (input[key] as number) < 0)) return null;
    if (input.total_seats !== 300) return null;
    if ((input.total_seats as number) !== (input.available_seats as number) +
        (input.belongings_seats as number) + (input.occupied_seats as number) + (input.unknown_seats as number)) return null;
    if (input.queue_people !== null && (!Number.isInteger(input.queue_people) || (input.queue_people as number) < 0)) return null;
    if (!["LOW", "MEDIUM", "HIGH"].includes(String(input.crowd_level))) return null;
  }
  return input as unknown as ObservationInput;
}

export function validateSubscription(value: unknown): SubscriptionInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.facility_id !== "string" || !input.facility_id.trim() ||
      typeof input.fcm_token !== "string" || !input.fcm_token.trim() || input.fcm_token.length > 4096) return null;
  return { facility_id: input.facility_id, fcm_token: input.fcm_token };
}
