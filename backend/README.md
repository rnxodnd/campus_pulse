# Campus Pulse API

## 현재 처리 흐름

Worker는 기존 `head-video-v1` 입력과 간단한 `observations[]` 입력을 모두 받습니다. 간단한 입력은 각 관측의 `video_time_seconds`와 `head_count`만 저장하며, 이미지 크기나 탐지 박스 같은 제공되지 않은 값을 만들어 넣지 않습니다.

AI JSON에는 시설 ID가 없으므로 현재 단일 MVP 시설인 `eng5_cafeteria`에 연결합니다. 영상이 녹화 분석 결과이므로 `video_time_seconds`는 실제 촬영 시각이 아닙니다. Worker는 가장 마지막 분석 프레임의 `head_count`를 기준으로 혼잡 단계를 계산하지만, 녹화 영상의 결과는 실시간 현황이 아닙니다.

## API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/facilities` | 활성 시설과 최신 완료 분석의 마지막 프레임 머리 수 |
| `GET` | `/api/facilities/:facility_id` | 시설과 최신 완료 분석 메타데이터 |
| `GET` | `/api/facilities/:facility_id/observations` | 최신 분석의 프레임 관측. `?analysis_id=...`로 분석 실행 선택 가능 |
| `POST` | `/api/observations` | `head-video-v1` 또는 `observations[]` JSON을 검증·저장 |
| `POST` | `/api/subscriptions` | Expo Push 토큰과 알림 선호 등록 |
| `DELETE` | `/api/subscriptions` | Expo Push 구독 해제 |
| `POST` | `/api/alerts/history` | 기기의 최근 알림 이력 조회 |
| `DELETE` | `/api/alerts/history` | 기기의 알림 이력 삭제 |

로컬 Worker 주소는 `http://127.0.0.1:8787`입니다. AI 송신 코드는 다음 주소로 JSON 파일의 객체를 요청 본문에 담아 전송해야 합니다.

```text
POST http://127.0.0.1:8787/api/observations
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json
```

Worker는 파일을 자동 감시하지 않습니다. 현재 AI CLI는 영상 분석 완료 후 JSON을 생성하므로, **5초마다 실시간으로 POST하는 흐름은 아직 구현되지 않았습니다.**

## AI 입력 계약

현재 AI에서 보낼 간단한 형식은 다음과 같습니다.

```json
{
  "observations": [
    { "video_time_seconds": 0, "head_count": 11 },
    { "video_time_seconds": 5, "head_count": 13 },
    { "video_time_seconds": 10, "head_count": 13 }
  ]
}
```

`observations`는 비어 있지 않은 배열이어야 합니다. `video_time_seconds`는 0 이상이며 순서대로 증가해야 하고, `head_count`는 0 이상의 정수여야 합니다. 각 항목에 `frame_index`가 있으면 증가하는 원본 프레임 인덱스를 보존하고, 생략하면 배열 순서로 생성합니다. 단일 시설 MVP이므로 `facility_id`는 생략할 수 있으며, 지정한다면 `eng5_cafeteria`여야 합니다. 시각은 최상위 `analyzed_at` 또는 `analysis.analyzed_at`을 사용하며, 둘 다 없으면 서버 수신 시각을 기록합니다. `analysis.analysis_id`도 있으면 중복 전송 식별에 사용합니다. 이 시각은 실제 촬영 시각이 아니라 분석·수신 기준 시각입니다.

관측 항목에 이미지 메타데이터나 `crowd_level`이 더 들어 있어도 허용하지만 저장하지 않습니다. 혼잡도는 입력값을 신뢰하지 않고 `head_count`에서 다시 계산합니다.

간단한 입력에서 API는 배열 순서로 관측 인덱스를 부여합니다. 응답의 최신 `latest_head_count`와 `crowd_level`은 배열의 마지막 항목 기준입니다.

이전 AI 실행기와의 호환을 위해 다음 `head-video-v1` 입력도 계속 받습니다.

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
- 혼잡 단계는 각 프레임의 `head_count`로 계산합니다: 0–21 `LOW`(여유), 22–100 `MEDIUM`(보통), 101 이상 `HIGH`(포화). 이는 검출된 머리 수 기준이며 실제 식당 전체 인원과 같다고 보장하지 않습니다.
- 알림은 완성된 분석의 마지막 인원 수가 이전 완성 분석보다 낮은 혼잡 단계로 바뀔 때 보냅니다. 임계값을 여러 단계 내려가도 한 번 알립니다. 최초 분석과 같은 단계 또는 혼잡 증가에는 발송하지 않습니다.
- 앱은 프레임별 수와 영상 상대시각을 조회할 수 있습니다.
- 재전송은 JSON 본문 SHA-256을 `analysis_id`로 사용해 중복 저장을 막습니다. 서로 다른 입력 파일은 각각 별도 분석 실행으로 저장됩니다.

## 저장 구조

- `analysis_runs`, `head_observations`: 기존 `head-video-v1` 상세 영상 입력
- `head_count_runs`, `head_count_observations`: 간단한 `observations[]` 입력과 영상 상대시각·인원수
- 입력의 `detections`는 검증에만 사용하고 DB에는 저장하지 않습니다.
- 프레임을 50개씩 D1 batch로 기록하고, 전체 개수가 맞을 때 분석을 `complete`로 표시합니다. 완전하지 않은 분석은 조회 API에 노출하지 않습니다.

마이그레이션 `0001_initial.sql`은 초기 시설·좌석 스키마, `0002_head_video_observations.sql`은 상세 영상 입력, `0003_crowd_push_history.sql`은 푸시 설정·이력, `0004_compact_head_observations.sql`은 간단한 `observations[]` 입력 저장과 두 입력 방식의 알림 이력 연결을 추가합니다.

## 혼잡도와 푸시 상태

Expo Push API로 Android 푸시를 전송합니다. 앱은 알림 권한을 받고 Expo Push 토큰을 등록합니다. 실제 Android 기기에서 알림을 받으려면 Expo/EAS 프로젝트에 Firebase FCM V1 자격 증명이 설정되어 있어야 합니다. 앱의 로컬 알림 선호도는 AsyncStorage에 저장하고, 구독과 발송된 알림 내역은 D1에 저장합니다. 이력 API는 기기의 푸시 토큰을 조회 키로 사용합니다.

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

마이그레이션 `0003_crowd_push_history.sql`은 구독 토큰을 Expo Push 토큰으로 바꾸고 알림 선호도와 알림 이력 테이블을 추가합니다. 원격 운영 Worker에는 새 마이그레이션과 배포를 적용해야 합니다.

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
