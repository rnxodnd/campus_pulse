# 캠퍼스 펄스 Android 앱

Expo / React Native로 만든 Android 앱입니다. 기존 Vite 웹 프런트엔드는 그대로 유지합니다.

## 로컬 실행

1. `mobile` 폴더에서 `.env.example`을 복사해 `.env`를 만듭니다.
2. Android 에뮬레이터에서는 기본 주소 `http://10.0.2.2:8787`을 사용합니다. 실제 휴대폰에서는 백엔드가 실행 중인 컴퓨터의 LAN IP와 포트를 입력하고, 휴대폰과 컴퓨터를 같은 네트워크에 연결합니다.
3. 저장소 루트에서 `npm run api:dev`로 백엔드를 실행합니다.
4. `mobile` 폴더에서 `npm start`를 실행해 Expo 개발 서버를 시작합니다.

실서비스 APK는 Cloudflare Worker의 HTTPS 주소(`https://campus-pulse-api.kgr5013.workers.dev`)를 사용하도록 EAS 빌드 프로필에 설정했습니다. `EXPO_PUBLIC_API_BASE_URL`은 앱에 포함되는 공개 설정이며 비밀 토큰을 넣으면 안 됩니다.

## Android 빌드

Expo 계정으로 로그인한 뒤 `mobile` 폴더에서 실행합니다.

- 직접 설치 및 팀 공유용 APK: `npm run build:apk`
- Google Play 업로드용 AAB: `npm run build:aab`

첫 EAS 빌드에서는 프로젝트 연결과 Android 서명 키 설정을 진행해야 합니다.

## 현재 연결 범위

- `GET /api/facilities/eng5_cafeteria`를 5초마다 조회합니다.
- API가 반환하는 최신 분석의 마지막 프레임 `latest_head_count`, 계산된 혼잡도, 분석 시각을 표시합니다. 녹화 분석을 표시하므로 이를 실시간 값으로 간주하지 않습니다.
- 알림 설정은 기기에 저장하고 Expo Push 토큰을 백엔드에 등록합니다. 알림 이력은 서버에서 불러오거나 삭제합니다. Android 실기기 푸시 전송에 필요한 Firebase FCM V1 자격 증명을 Expo/EAS 프로젝트에 설정해야 합니다.
- 백엔드 혼잡도는 프레임의 `head_count`로 계산합니다: 0–21 여유, 22–100 보통, 101 이상 포화.
- 홈 화면은 실제 감지 인원 숫자를 표시하지 않고, 혼잡 단계에 따라 곰두리 3마리(여유)·7마리(보통)·13마리(포화)를 움직이는 장면으로 보여줍니다. 곰 수는 시각 표현이며 실제 인원 수가 아닙니다.
