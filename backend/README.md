# Campus Pulse API

Cloudflare Worker API with Cloudflare D1 storage. The initial scope contains only the 5공학관 식당. One AI model sends its JSON analysis result by HTTP POST; the Worker validates and stores it. It does not calculate or translate the model's crowd level.

`data_status` is `current`, `delayed`, `error`, or `unknown`, based on the analysis status and observation age.

## Endpoints

### `GET /api/facilities`

Returns the facility list and each facility's latest observation.

### `GET /api/facilities/:facility_id`

Returns one facility and its latest observation. Returns `404` when the ID is unknown.

### `POST /api/observations`

Accepts AI results. Requires `Authorization: Bearer <INGEST_TOKEN>`.
While the Worker runs locally, the model can POST to `http://127.0.0.1:8787/api/observations`. Send the JSON object as the request body every agreed interval; the Worker does not watch a JSON file on disk. The reporting interval is still to be agreed with the AI owner.

```json
{
  "facility_id": "eng5_cafeteria",
  "captured_at": "2026-11-05T12:10:00+09:00",
  "total_seats": 300,
  "available_seats": 140,
  "belongings_seats": 25,
  "occupied_seats": 115,
  "unknown_seats": 20,
  "seated_people": 115,
  "queue_people": null,
  "crowd_level": "MEDIUM",
  "analysis_status": "OK"
}
```

For `OK` and `DELAYED`, seat counts must be non-negative integers, the four seat categories must sum to 300, and `queue_people` may be an integer or `null`. For `ERROR`, numeric fields and `queue_people` must be `null`; `crowd_level` may be `null` or one of its allowed values. `crowd_level` accepts `LOW`, `MEDIUM`, `HIGH`; `analysis_status` accepts `OK`, `DELAYED`, `ERROR`. Invalid bodies return `400`, missing/invalid credentials return `401`, and unknown facility IDs return `404`.

When the previous `OK` observation was `HIGH` and a new `OK` observation is `MEDIUM` or `LOW`, the Worker sends an FCM push to subscribed devices. Repeated reports of `MEDIUM`/`LOW` do not resend the same transition alert. The Android UI can label `LOW`/`MEDIUM`/`HIGH` as 여유/보통/포화.

### `POST /api/subscriptions`

Register an Android Firebase Cloud Messaging device token for the cafeteria:

```json
{ "facility_id": "eng5_cafeteria", "fcm_token": "<device-fcm-token>" }
```

### `DELETE /api/subscriptions`

Unsubscribe the device using the same JSON body. The Android app should call this when the user turns off the alert or signs out.

## Local setup

1. Run `npm ci`, then copy `backend/.dev.vars.example` to `backend/.dev.vars`. Set a local `INGEST_TOKEN`; leave the FCM values empty to run the API without push delivery. `.dev.vars` is git-ignored.
2. Run `npm run cf:types` after changing `wrangler.toml`. It generates `backend/worker-configuration.d.ts` with the D1 binding, secret bindings, and Cloudflare runtime types used by the editor and TypeScript checker.
3. Create a D1 database with `npx wrangler d1 create campus-pulse --config backend/wrangler.toml` and put the returned ID in `database_id` in `wrangler.toml`.
4. Create a Firebase project, register the Android app, and enable Firebase Cloud Messaging. Set the Android app's `google-services.json` in its app module, request notification permission on Android 13+, and create a notification channel in the app.
5. For deployed push delivery, create a Firebase service account with permission to send FCM messages, then set the Worker secrets. Wrangler prompts for each value; never commit them:

   ```sh
   npx wrangler secret put INGEST_TOKEN --config backend/wrangler.toml
   npx wrangler secret put FCM_PROJECT_ID --config backend/wrangler.toml
   npx wrangler secret put FCM_CLIENT_EMAIL --config backend/wrangler.toml
   npx wrangler secret put FCM_PRIVATE_KEY --config backend/wrangler.toml
   ```
6. Apply the local schema with `npm run api:db:local`.
7. Start the Worker with `npm run api:dev`.

Apply the schema to the deployed D1 database with `npm run api:db:remote`. Required secrets are validated by Wrangler on deploy. Do not commit credentials.

The first AI model's schema is implemented. The second model's schema has not been provided, so no assumptions have been added for it.
