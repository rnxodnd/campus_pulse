export type CrowdLevel = "LOW" | "MEDIUM" | "HIGH";
export type AnalysisStatus = "OK" | "DELAYED" | "ERROR";

export interface ObservationInput {
  facility_id: string;
  captured_at: string;
  total_seats: number | null;
  available_seats: number | null;
  belongings_seats: number | null;
  occupied_seats: number | null;
  unknown_seats: number | null;
  seated_people: number | null;
  queue_people: number | null;
  crowd_level: CrowdLevel | null;
  analysis_status: AnalysisStatus;
}

export interface SubscriptionInput {
  facility_id: string;
  fcm_token: string;
}
