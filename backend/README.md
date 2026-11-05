# Campus Pulse API

## 현재 처리 흐름

AI는 녹화 영상을 분석한 뒤 `head-video-v1` JSON 파일 하나를 생성합니다. Worker는 그 JSON 전체를 HTTP POST로 받고, 각 `images[]`의 `head_count`와 영상 상대 시각을 D1에 저장합니다. `model_file`에 들어 있는 로컬 파일 경로와 탐지 박스 상세는 저장하지 않습니다.

AI JSON에는 시설 ID가 없으므로 현재 단일 MVP 시설인 `eng5_cafeteria`에 연결합니다. 영상이 녹화 분석 결과이므로 `video_time_seconds`는 실제 촬영 시각이 아니며, 응답을 실시간 현황으로 해석하면 안 됩니다. Worker는 현재 혼잡 단계나 분석 상태를 계산하지 않습니다.

## API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/facilities` | 활성 시설과 최신 완료 분석의 마지막 프레임 머리 수 |
| `GET` | `/api/facilities/:facility_id` | 시설과 최신 완료 분석 메타데이터 |
| `GET` | `/api/facilities/:facility_id/observations` | 최신 분석의 프레임 관측. `?analysis_id=...`로 분석 실행 선택 가능 |
| `POST` | `/api/observations` | `head-video-v1` JSON 전체를 검증·저장 |
| `POST` | `/api/subscriptions` | FCM 토큰 등록 |
| `DELETE` | `/api/subscriptions` | FCM 토큰 구독 해제 |

로컬 Worker 주소는 `http://127.0.0.1:8787`입니다. AI 송신 코드는 다음 주소로 JSON 파일의 객체를 요청 본문에 담아 전송해야 합니다.

```text
POST http://127.0.0.1:8787/api/observations
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json
```

Worker는 파일을 자동 감시하지 않습니다. 현재 AI CLI는 영상 분석 완료 후 JSON을 생성하므로, **5초마다 실시간으로 POST하는 흐름은 아직 구현되지 않았습니다.**

## AI 입력 계약

`POST /api/observations`는 [head-video-v1 명세](../docs/head_video_input.md)의 전체 JSON을 받습니다. 핵심 형태는 다음과 같습니다.

```json
{
  "schema_version": "head-video-v1",
  "input_type": "recorded_video",
  "video_name": "cafeteria.mov",
  "model_file": "local/path/to/best.pt",
  "coordinate_format": "xyxy_pixels",
  "confidence_threshold": 0.1,
  "sample_interval_seconds": 5.0,
  "timestamp_source": "decoder_relative_to_first_frame",
  "reported_fps": 30.0,
  "reported_frame_count": 1,
  "decoded_frame_count": 1,
  "analyzed_frame_count": 1,
  "last_decoded_video_time_seconds": 0.0,
  "decode_check": "frame_count_matched",
  "analyzed_at": "2026-11-06T03:10:00+00:00",
  "images": [
    {
      "frame_index": 0,
      "video_time_seconds": 0.0,
      "image_name": "cafeteria.mov#frame=0",
      "image_width": 1920,
      "image_height": 1080,
      "head_count": 0,
      "detections": []
    }
  ]
}
```

위는 주요 필드 형태를 보여주는 축약 예시입니다. 실제 요청에는 영상 출력 명세의 전체 메타데이터와 모든 분석 프레임이 필요합니다.

- `images[].head_count`는 0 이상의 정수이며 `detections.length`와 같아야 합니다.
- 프레임 인덱스와 `video_time_seconds`는 증가해야 합니다. 프레임 수는 `analyzed_frame_count`와 일치해야 합니다.
- `head_count`를 여러 프레임에 걸쳐 합산해 총 방문자 수로 만들지 않습니다.
- 혼잡 단계는 입력에 없고 아직 계산하지 않습니다. 앱은 프레임별 수와 영상 상대시각을 조회할 수 있습니다.
- 재전송은 JSON 본문 SHA-256을 `analysis_id`로 사용해 중복 저장을 막습니다. 서로 다른 입력 파일은 각각 별도 분석 실행으로 저장됩니다.

## 저장 구조

- `analysis_runs`: 시설, 영상·모델 결과 메타데이터, 분석 시각, 수신 완료 상태
- `head_observations`: `analysis_id`, `frame_index`, 영상 상대시각, 크기, `head_count`
- 입력의 `detections`는 검증에만 사용하고 DB에는 저장하지 않습니다.
- 프레임을 50개씩 D1 batch로 기록하고, 전체 개수가 맞을 때 분석을 `complete`로 표시합니다. 완전하지 않은 분석은 조회 API에 노출하지 않습니다.

마이그레이션 `0001_initial.sql`은 초기 시설·좌석 스키마이고, `0002_head_video_observations.sql`이 머리 관측 저장 테이블을 추가합니다.

## 혼잡도와 푸시 상태

혼잡도 임계값과 안정화 정책은 아직 합의되지 않아 백엔드에서 `LOW/MEDIUM/HIGH`를 계산하지 않습니다. 기존 FCM 구독 API는 남아 있지만, 머리 수 관측 변화와 푸시 발송은 연결되어 있지 않습니다. 정책을 확정한 뒤 계산·변화 감지·알림 발송을 추가해야 합니다.

## 로컬 실행

저장소 루트에서 Node.js 24와 잠금된 패키지를 사용합니다.

```cmd
npm ci
copy backend\.dev.vars.example backend\.dev.vars
npm run cf:types
npm run api:db:local
npm run api:dev
```

`.dev.vars`의 `INGEST_TOKEN`을 로컬에서 사용할 값으로 설정합니다. `.dev.vars`는 Git 제외 대상입니다. Worker는 D1을 로컬 모드로 사용하며, Cloudflare에 배포하려면 `backend/wrangler.toml`의 실제 D1 `database_id`와 Cloudflare secret 설정이 필요합니다. `.dev.vars.example`과 Wrangler 타입 생성 결과에는 실제 자격증명을 넣지 않습니다.

현재 확인 상태는 Worker 번들 dry-run까지입니다. 새 D1 마이그레이션과 AI JSON 통합 요청은 아직 검증하지 않았습니다.

## Cloudflare 원격 배포

Cloudflare 계정에 로그인한 다음 저장소 루트에서 순서대로 진행합니다.

```cmd
npm run cf:login
npm run api:db:create
```

`api:db:create` 출력에 나온 실제 D1 데이터베이스 ID를 `backend/wrangler.toml`의 `database_id`에 넣습니다. 그다음 수집 토큰을 Worker secret으로 등록하고 원격 마이그레이션을 적용한 뒤 배포합니다.

```cmd
npx wrangler secret put INGEST_TOKEN --config backend/wrangler.toml
npm run api:db:remote
npm run api:deploy
```

배포가 끝나면 Wrangler가 출력한 `workers.dev` HTTPS 주소에 `/api/facilities/eng5_cafeteria`를 붙여 조회를 확인합니다. 그 주소를 `mobile/.env`의 `EXPO_PUBLIC_API_BASE_URL`에 설정하고 Android APK를 빌드합니다. Cloudflare 로그인, D1 ID 입력, secret 설정은 계정 소유자의 터미널에서 완료해야 합니다.
