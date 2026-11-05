# Backend 담당 업무

**담당 초안: 김경렬**

목표는 5공학관 식당의 **영상에서 탐지한 머리 수를 받아 혼잡도를 계산하고, Android 앱 조회와 혼잡도 변화 알림을 연결**하는 것입니다. `develop`에서 병합된 **Cloudflare Worker·D1·FCM 백엔드 초안 코드가 있습니다.** 다만 현재 코드는 이전 좌석 계약을 요구하므로 최신 머리 분석 JSON과 직접 연결되지 않습니다. 이 문서는 현행 구현과 앞으로 맞출 목표를 구분합니다.

- [프로젝트 전체 안내](../README.md)
- [AI 담당 업무](../ai/README.md)
- [실제 영상 입력·JSON 계약](../docs/head_video_input.md)
- [Android 앱 담당 업무](../frontend/README.md)

## 현재 흐름과 구현 상태

```text
아이폰 17 녹화 영상 → Mac M4의 로컬 AI 분석
                    → 영상 내 5초 간격 프레임의 head_count + detections
                    → 분석 완료 후 상세 JSON 파일 하나

이후 구현할 연결:
JSON 수신 → 필드 추출·검증 → 머리 수 기반 혼잡 등급 → Android 조회·변화 알림
```

AI CLI는 로컬 영상을 읽어 완료 후 JSON 파일을 생성합니다. 별도로 Worker에는 JSON POST 수신·D1 저장·조회·구독·제한된 FCM 발송 코드가 있습니다. **영상 업로드, AI 결과 전송, 머리 수 기반 혼잡도 계산, Android 연결과 실제 5초 재생 동기화는 미구현**입니다. Worker는 로컬 JSON 파일을 자동 감시하지 않습니다.

현재 확인한 것은 **Worker 번들 dry-run 성공**까지입니다. DB 마이그레이션·API 통합·실제 푸시 전달은 아직 검증하지 않았습니다. D1 바인딩과 마이그레이션 파일은 있지만 [wrangler.toml](wrangler.toml)의 `database_id`는 `REPLACE_WITH_D1_DATABASE_ID`입니다. R2는 파일 저장 후보, MinIO는 미확정이며 둘 다 현재 코드에 연결되지 않았습니다.

| 항목 | 병합된 현행 코드 | 최신 목표와의 차이 |
| --- | --- | --- |
| 입력 | 시설·촬영 시각과 좌석 수를 요구하는 구형 JSON | `head-video-v1` 수신·추출 및 메타데이터 연결 필요 |
| 혼잡도 | 전달받은 `crowd_level`을 검증·저장 | 머리 수 기준 등급 계산·임계값 합의 필요 |
| 저장 | 구좌석 필드의 D1 스키마 | 머리 관측 중심 스키마 정합화 필요 |
| 알림 | 직전·현재 상태가 `OK`이고 `HIGH → MEDIUM/LOW`일 때만 발송 | 상승·다른 하락·방향 설정·양방향 기능 필요 |
| 클라이언트 | 시설 조회·FCM 토큰 구독 endpoint | Android 앱과 머리 수 응답 계약 연결 필요 |

## 현행 API — 이전 좌석 계약용 구현

아래는 [현재 라우터](src/index.ts)의 실제 endpoint입니다. 최신 기능을 제안하는 예시가 아니라 병합된 코드의 사용 명세입니다.

| 요청 | 현재 동작 |
| --- | --- |
| `GET /api/facilities` | 활성 시설 목록과 각 시설의 최신 관측 반환 |
| `GET /api/facilities/:facility_id` | 시설과 최신 관측 반환. 현재 등록 ID는 `eng5_cafeteria` |
| `POST /api/observations` | 구형 관측 JSON 검증·저장. `Authorization: Bearer <INGEST_TOKEN>` 필요 |
| `POST /api/subscriptions` | 시설별 FCM 기기 토큰 등록 |
| `DELETE /api/subscriptions` | 같은 요청 본문으로 해당 구독 삭제 |

로컬 Worker 주소는 기본 `http://127.0.0.1:8787`입니다. AI 송신 측이 합의된 주기에 JSON 객체를 HTTP POST해야 하며 자동 파일 감시·파일 업로드는 없습니다. 조회·구독 라우트에는 현재 별도 인증 검사가 없으므로 운영 인증 정책은 추가 점검 대상입니다.

### 현행 관측 JSON 예시 — 최신 머리 분석 계약으로 사용하지 않음

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

이 값은 **구형 API 설명용 예시**입니다. `head_count`를 좌석 값으로 채워 보내지 않습니다. 현행 API를 수동 시험한다면 `captured_at`을 시험 시각에 맞춰야 합니다.

- `OK`·`DELAYED`는 좌석 관련 수치와 `seated_people`이 0 이상의 정수이고, 전체 300석과 네 좌석 범주의 합이 같아야 합니다. `queue_people`은 0 이상의 정수 또는 `null`입니다.
- `ERROR`는 위 수치와 `queue_people`이 모두 `null`이어야 합니다. `crowd_level`은 `null` 또는 허용 단계입니다.
- `crowd_level`은 `LOW`·`MEDIUM`·`HIGH`, `analysis_status`는 `OK`·`DELAYED`·`ERROR`입니다. **Worker는 혼잡 단계를 계산하거나 변환하지 않습니다.**
- `OK` 관측은 현재보다 5분 넘게 오래됐거나 60초 넘게 미래이면 거부합니다. 최신 저장 관측보다 같거나 이른 시각도 거부합니다. 이 규칙은 녹화 영상의 상대시각 처리와 별개입니다.
- 잘못된 JSON·필드·시각은 `400`, 수신 인증 실패는 `401`, 없는 시설은 `404`, 최신보다 새롭지 않은 관측은 `409`, 수신 성공은 `201`입니다.
- 조회의 `data_status`는 상태와 관측 경과 시간에 따라 `current`, `delayed`, `error`, `unknown`입니다. 관측이 없는 시설 상세 응답은 `observation: null`입니다.

구독 등록·삭제는 다음 본문을 공통으로 사용합니다. 현재 방향별 설정 필드는 없습니다.

```json
{ "facility_id": "eng5_cafeteria", "fcm_token": "<device-fcm-token>" }
```

현행 FCM은 직전 저장 관측과 새 관측이 모두 `OK`이고 `HIGH → MEDIUM/LOW`일 때만 발송합니다. 이어지는 `MEDIUM/LOW` 보고는 같은 전환을 다시 발송하지 않습니다. **상승 알림, `MEDIUM → LOW`, 수신 방향 선택은 미구현**입니다. 알림 문구와 `type: seats_available`도 구좌석 기준이므로 최신 머리 수 범위에 맞추는 작업이 필요합니다.

## 담당 범위와 작업 순서

1. [영상 JSON 계약](../docs/head_video_input.md)에 따라 결과 파일을 읽고 프레임별 머리 수·상대시각·유효성을 검증합니다.
2. 시설·영상·분석 실행을 연결할 메타데이터와 수신 방식을 AI 담당자와 합의합니다.
3. 관측 범위에 맞는 머리 수 임계값과 단계 안정화 규칙을 합의한 뒤 혼잡도를 계산합니다.
4. 앱에 필요한 정보, 데이터 없음·지연·녹화 결과 표시 규칙을 김민정 담당자와 맞춥니다.
5. 저장소와 인증·조회·중복 처리 방식을 정하고 연결합니다.
6. 혼잡도 상승·하락 알림을 앱 설정과 연결하고 통합 검증합니다.

현행 endpoint·D1·FCM 코드를 바탕으로 **최신 머리 수 계약에 필요한 변경 내용**을 합의합니다. 기존 좌석 필드와 새 머리 수 필드를 임의로 대응시키지 않습니다.

## 실제 AI 결과에서 읽을 정보

아래는 현재 `head-video-v1`에 존재하는 필드입니다. 전체 정의는 [영상 입력 문서](../docs/head_video_input.md)를 기준으로 합니다.

| 필드 | Backend에서 확인할 의미 |
| --- | --- |
| `schema_version`, `input_type` | `head-video-v1`, `recorded_video`인지 확인 |
| `video_name` | 입력 파일명. 고유 영상 ID로 간주하지 않음 |
| `sample_interval_seconds` | 영상 내 분석 간격. 기본 5초 |
| `images[].frame_index` | 성공적으로 디코딩한 프레임의 0부터 시작하는 순번 |
| `images[].video_time_seconds` | 영상 시작 기준 상대시각. 촬영 날짜·시각이 아님 |
| `images[].head_count` | 해당 프레임의 탐지 머리 수 |
| `images[].detections` | `name`, `class`, `confidence`, `box`를 담은 탐지 상세 |
| `images[].image_width`, `image_height` | 읽은 프레임의 실제 크기 |
| `analyzed_at` | 결과 생성 시각. 촬영 시각과 구분 |
| `decode_check`, 프레임 수 관련 필드 | 디코딩 확인 범위와 분석 프레임 수 검증에 사용 |

- `head_count`는 0 이상의 정수이며 `len(detections)`와 같아야 합니다.
- 여러 프레임의 `head_count`를 합산해 총 방문자 수를 만들지 않습니다. 같은 사람이 반복 관측될 수 있습니다.
- 머리 수를 300으로 나누어 좌석 점유율로 변환하지 않습니다. 혼잡도는 합의한 **머리 수 기준**으로 계산합니다.
- 영상에 잡힌 구역의 수치를 식당 전체 인원으로 단정하지 않습니다. 적용 구도와 관측 범위를 함께 관리해야 합니다.
- JSON 생성 완료와 디코딩 확인은 탐지 정확도 보증이 아닙니다. 실패·미수신을 0명으로 바꾸지 않습니다.

## Backend에서 별도로 관리할 정보 — 설계안

`head-video-v1`에는 **시설 ID, `run_id`, 혼잡 단계가 없습니다.** 이 값들이 AI 결과에 이미 포함됐다고 가정하지 않습니다.

| 관리할 정보 | 합의할 내용 |
| --- | --- |
| 시설과 관측 범위 | 결과가 어느 식당·구도를 나타내는지 연결 |
| 고유 영상 식별자 | 같은 파일명인 서로 다른 영상을 구분 |
| 분석 실행 식별자 | 동일 영상을 다른 모델·설정으로 재분석한 실행을 구분 |
| 프레임 관측 식별 | 영상·실행·프레임의 조합으로 중복 수신을 구분하는 방안 |
| 수신 시각·상태 | 영상 상대시각, 결과 생성시각과 별도로 기록 |
| 혼잡 단계·적용 기준 | 계산에 사용한 임계값과 판정 결과 관리 |
| 시연·최신성 구분 | 녹화 결과를 현재 식당의 실시간 상태로 오해하지 않도록 표시 |

위 식별자의 필드명과 생성 주체는 미정입니다. 재전송과 재분석을 같은 것으로 처리하지 않고, 늦게 도착한 옛 실행이 최신 결과를 덮어쓰지 않도록 설계합니다. 새 데이터가 없으면 마지막 결과와 시각을 유지하고 지연·미수신 상태를 표시합니다.

## 목표 혼잡도와 양방향 알림 — 현행 코드에 추가할 내용

단계 표현은 **원활·보통·혼잡·확인 불가**를 기준으로 협의합니다. 임계값, 짧은 변동을 거르는 지속 시간과 정보 만료 시간은 미정이며, Backend 담당자가 임의 수치로 확정하지 않습니다.

- 수신 설정은 **끄기 / 원활해질 때 / 혼잡해질 때 / 양방향**을 지원하는 방향입니다. 기본값과 저장 방식은 협의합니다.
- 서버가 유효한 단계 변화를 판단합니다. 앱이 켜져 있을 때만 수치를 비교하는 구조로 제한하지 않습니다.
- 최초 관측, 확인 불가, 오래된 정보에서는 변화 알림을 만들지 않습니다. 복구 후 첫 유효 값을 새 비교 기준으로 삼는 방안을 협의합니다.
- 혼잡에서 원활 또는 원활에서 혼잡으로 직접 바뀌면 하나의 변화로 다룹니다. 중간 단계를 만들어 알림을 두 번 보내지 않습니다.
- 같은 관측의 재전송, 같은 알림의 재시도, 기기에 중복 도착한 알림을 각각 구분합니다. 이벤트 식별 방식은 미정입니다.
- 녹화 JSON을 한꺼번에 수신했다고 과거 변화를 현재 실시간 알림으로 발송하지 않습니다. 시연용 재생·알림의 실행 기준은 별도로 합의하며 아직 미구현입니다.
- 알림에는 식당, 변경 전후 단계와 해당 시각을 전달하는 방안을 협의합니다. 앱은 알림을 탭하면 최신 조회를 다시 수행합니다.

[FCM](https://firebase.google.com/docs/cloud-messaging) 발송과 토큰 등록·삭제 코드는 있습니다. Android 수신 연동·토큰 갱신 흐름·방향 설정은 추가 작업이며, 설정과 실기기 전달 검증도 필요합니다. Android 시스템 권한과 서버 수신 설정은 별도이고, 푸시의 즉시 전달·모든 기기 도착을 보장하지 않습니다.

## 인증과 저장 원칙

AI 결과 수신 인증값, Cloudflare 토큰과 푸시 발송 자격증명은 서버에서 관리합니다. Android 앱·공개 저장소·조회 응답에 비밀값이나 로컬 모델 경로를 그대로 노출하지 않습니다.

D1 코드와 [초기 마이그레이션](migrations/0001_initial.sql)은 현재 좌석 계약 기준입니다. 새 머리 관측·영상·실행 메타데이터에 맞춘 변경이 필요합니다. R2의 파일 저장, 원본 영상 보관 여부·기간·접근 범위는 미정입니다. 저장소 선택만으로 AI Hub 원본이나 사용자 영상을 공개 공유할 수 있다고 가정하지 않습니다.

## 현행 개발 환경·실행·배포 명령

다음은 병합된 개발자 설정 방법입니다. **저장소 최상위**, Node.js 24.x 기준이며 아래 명령을 이 문서 작업에서 실행한 것은 아닙니다. 백엔드 설정과 서비스 실행이 준비돼도 머리 JSON 계약 연결은 별도 작업입니다.

1. 의존성을 설치하고 로컬 환경변수 파일을 준비합니다. 기존 `.dev.vars`는 덮어쓰지 않습니다.

   ```bash
   npm ci
   cp -n backend/.dev.vars.example backend/.dev.vars
   ```

   `.dev.vars`의 `INGEST_TOKEN`을 로컬 값으로 정합니다. FCM 세 값은 비워 두면 로컬에서 발송을 건너뜁니다. `.dev.vars`는 Git 제외 대상입니다.
2. Cloudflare에 로그인하고 D1 DB를 만든 뒤 반환된 ID를 `backend/wrangler.toml`의 `database_id`에 넣습니다.

   ```bash
   npm run cf:login
   npx wrangler d1 create campus-pulse --config backend/wrangler.toml
   ```

3. `wrangler.toml`을 변경한 뒤 타입을 갱신합니다. `backend/worker-configuration.d.ts`를 생성하는 명령입니다.

   ```bash
   npm run cf:types
   ```

4. 로컬 D1 스키마를 적용하고 Worker를 실행합니다. 이는 현재의 구좌석 스키마입니다.

   ```bash
   npm run api:db:local
   npm run api:dev
   ```

5. 푸시를 시험하려면 Firebase 프로젝트·Android 앱을 등록하고 FCM을 설정합니다. Android 앱 모듈의 `google-services.json`, 필요한 알림 권한과 알림 채널을 구성해야 합니다. 앱 자체는 아직 없습니다.
6. 실제 배포에서는 FCM 발송 권한이 있는 서비스 계정의 값과 수신 토큰을 Worker secret으로 설정합니다. 명령의 프롬프트로 입력하고 저장소에 커밋하지 않습니다.

   ```bash
   npx wrangler secret put INGEST_TOKEN --config backend/wrangler.toml
   npx wrangler secret put FCM_PROJECT_ID --config backend/wrangler.toml
   npx wrangler secret put FCM_CLIENT_EMAIL --config backend/wrangler.toml
   npx wrangler secret put FCM_PRIVATE_KEY --config backend/wrangler.toml
   ```

7. 원격 DB 적용·배포 명령은 아래와 같습니다. **실제 Cloudflare 자원을 변경**하며 현재 배포 완료 상태를 의미하지 않습니다. `wrangler.toml`은 위 네 secret을 필수로 선언합니다.

   ```bash
   npm run api:db:remote
   npm run api:deploy
   ```

## 최신 목표의 완료 기준

- [ ] 현행 입력 검증·D1 스키마·조회·알림 문구를 머리 수 계약에 맞춘다.
- [ ] 실제 JSON 파일의 스키마·머리 수·프레임 시각을 검증한다.
- [ ] 시설·영상·실행·프레임의 관계와 중복·순서 역전 처리 기준을 합의한다.
- [ ] 관측 범위에 맞는 혼잡도 임계값과 확인 불가·오래된 정보 처리 기준을 합의한다.
- [ ] 결과 전달·저장·조회와 Android 표시를 실제로 연결한다.
- [ ] 녹화 상대시각·분석 완료시각·현재 상태를 구분한다.
- [ ] 양방향 알림, 중복·지연·권한 거부와 알림 탭 후 조회를 검증한다.
- [ ] 구현된 기능의 설정·실행·배포 방법을 문서에 추가한다.
