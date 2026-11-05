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

- `GET /api/facilities/eng5_cafeteria`를 15초마다 조회합니다.
- API가 반환하는 최신 분석의 마지막 프레임 `latest_head_count`와 분석 시각을 표시합니다.
- 혼잡도 단계는 백엔드에서 계산하지 않으므로 앱에서 임의로 여유·보통·포화 상태를 만들지 않습니다.
- 알림 화면은 네이티브 UI로 옮겼습니다. 실제 Android 푸시 전송은 백엔드의 혼잡도 전환 판정 및 FCM 송신 구현 후 연결해야 합니다.
