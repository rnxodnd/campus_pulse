# 머리 탐지 사진 분석 JSON

[사진 분석 CLI](../ai/predict_heads.py)는 상세 `head-image-v1` JSON을 기본으로 저장합니다. AI 출력 구조를 유지하고, 백엔드 담당자가 필요한 이미지의 `images[].head_count`를 추출합니다. 별도 상세 출력 옵션은 필요하지 않습니다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `schema_version` | string | `head-image-v1` |
| `model_file` | string | 사용한 로컬 체크포인트 경로 |
| `analyzed_at` | string | 결과 생성 시각, UTC ISO 8601. 사진 촬영 시각이 아님 |
| `coordinate_format` | string | `xyxy_pixels` |
| `confidence_threshold` | number | 탐지 신뢰도 필터 기준 |
| `images` | array | 이미지별 분석 결과 |
| `images[].image_name` | string | 입력 이미지 파일명 |
| `images[].image_width`, `image_height` | integer | 분석한 원본 이미지의 너비와 높이, 픽셀 |
| `images[].head_count` | integer, 0 이상 | 신뢰도 필터와 중복 박스 정리 후 남은 머리 탐지 개수 |
| `images[].detections` | array | 머리별 클래스·신뢰도·좌표 |
| `detections[].name`, `class` | string, integer | 각각 `head`, `0` |
| `detections[].confidence` | number | 해당 탐지의 신뢰도. 모델 전체 정확도를 뜻하지 않음 |
| `detections[].box.x1`, `y1` | number | 머리 박스 왼쪽 위 픽셀 좌표 |
| `detections[].box.x2`, `y2` | number | 머리 박스 오른쪽 아래 픽셀 좌표 |

사진 한 장을 입력해도 `images`는 원소 하나인 배열입니다. 폴더 입력은 지원되는 이미지 파일을 파일명으로 정렬한 순서대로 `images`에 담으며, 하위 폴더는 탐색하지 않습니다. 머리 개수는 각 이미지의 `len(detections)`입니다.

좌표 원점은 원본 이미지의 왼쪽 위이며 x는 오른쪽, y는 아래로 증가합니다. 서로 다른 사진·프레임·카메라의 개수를 자동으로 합산하지 않습니다. 이 결과는 고유 방문자 수, 착석 인원 또는 빈자리 수를 의미하지 않습니다.

정상 분석에서 머리를 탐지하지 못하면 `head_count=0`, `detections=[]`입니다. 모델이 사람을 놓칠 수 있으므로 실제로 사람이 없는 공간임을 보장하지 않습니다. 파일 오류나 분석 실패는 `0`으로 바꾸지 않고 오류로 중단합니다.

## 실행 예시

저장소 루트에서 실행합니다. 출력 파일은 새 경로여야 하며 기존 파일을 덮어쓰지 않습니다.

```bash
source .venv/bin/activate
python ai/predict_heads.py \
  --model runs/head/indoor_20261105_01/weights/best.pt \
  --source data/head_cafeteria_v1/images/val/val_003.jpg \
  --output runs/head/indoor_20261105_01/val_003_heads_next.json \
  --tile-size 1280 --tile-overlap 0.2
```

타일 옵션은 사진을 나눠 분석한 뒤 원본 이미지 좌표에서 중복을 제거합니다. 타일 경계에서 누락이나 중복이 남을 수 있으므로 결과 확인이 필요합니다. 옵션을 생략하면 사진 전체를 한 번에 분석합니다. 기본 장치는 MPS이며 CPU 사용은 `--device cpu`로 명시합니다.

## 현재 지원 범위

이 문서의 `predict_heads.py`는 로컬 사진 한 장 또는 사진 폴더만 입력받습니다. 녹화 영상 파일은 별도의 `predict_head_video.py`로 **5초 간격** 분석합니다. [영상 실행 안내](head_video_input.md)를 참고합니다. 실시간 영상 추론, 업로드 API와 백엔드 전송은 아직 구현하지 않았습니다.

영상 결과는 기존 이미지별 상세 필드를 유지하며 `frame_index`와 `video_time_seconds`로 프레임을 구분합니다. 실제 촬영 시각, 카메라 식별자, 좌석 상태를 임의로 추가하지 않습니다. 이 문서는 AI 출력 형식 설명이며 백엔드 수신 API의 구현이나 확정을 뜻하지 않습니다.
