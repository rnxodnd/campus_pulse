# AI 담당 작업 안내

**5공학관 식당의 머리 탐지와 인원 추정**을 담당합니다. 최종 범위에서 좌석 점유·빈자리·짐·일시 비움 분석은 제외했습니다. 시연 입력은 **iPhone 17 녹화 영상**, 실행 장비는 **Mac M4**, 결과를 표시하는 서비스는 **Android 앱**입니다.

현재 구현은 데이터 준비·시험 학습·사진 추론·**영상 시간 기준 5초 간격 분석과 상세 JSON 저장**입니다. 백엔드는 상세 결과에서 필요한 필드를 추출하고 혼잡도를 계산합니다. **AI 담당 범위에서 백엔드 코드를 수정하지 않습니다.**

[프로젝트 범위·진행 현황](../README.md) · [Mac 학습 안내](../docs/training_mac.txt) · [사진 JSON](../docs/head_output.md) · [영상 JSON·실행](../docs/head_video_input.md) · [AI Hub 준비 기록](../docs/aihub71368_sample.md)

## 담당 작업

초안상 AI 담당자는 **변민석·구태웅**입니다. 사용자 담당은 머리 탐지이며, 좌석 분석을 제외한 뒤의 두 사람 세부 배분은 팀에서 확정합니다.

| 작업 | 공유할 산출물 |
| --- | --- |
| CVAT 라벨링·외부 실내 자료 변환·장면별 분리 | 머리 박스, 데이터 manifest, train/val/test 분리 근거 |
| YOLOv8n 미세조정·작은 머리 검증 | 가중치, 실행 설정, 누락·오탐과 인원 오차 |
| 녹화 영상 입력·5초 간격 샘플링 | 프레임별 상세 JSON, 디코딩·시각 검사 결과 |
| 백엔드 연동 자료 제공 | 실제 JSON 샘플, 필드 의미, 실패 조건·관측 범위 |

## 현재 데이터와 학습 상태

| 로컬 데이터셋 | train 이미지 / 머리 박스 | val 이미지 / 머리 박스 | 상태 |
| --- | --- | --- | --- |
| `data/head_cafeteria_v1` | 16 / 64 | 4 / 15 | CVAT 자체 촬영 자료, 첫 3 epoch 학습 완료 |
| `data/head_aihub71368_v1` | 83 / 1,882 | 81 / 1,882 | AI Hub 실내 + 식당 자료, 두 번째 3 epoch 학습 완료 |
| `data/head_aihub71368_tiles_v1` | 163 / 2,045 | 81 / 1,882 | 타일 추가 후 5 epoch 학습 완료 |
| `data/head_aihub71368_hardneg_v1` | 180 / 2,045 | 81 / 1,882 | 머리 없는 오탐 배경 17장 추가 후 5 epoch 학습 완료 |
| `data/head_cafeteria_balanced_v1` | 129 / 658 | 81 / 1,882 | 자체 자료 전부·외부 카페 16장 유지, 8 epoch 비교 실험 완료 |

모든 클래스는 `0=head`입니다. 외부 카페 67장은 train, 공연장 77장은 val에 사용했습니다. 타일 80장은 기존 식당 train 사진에서 만들었고 val에는 추가하지 않았습니다. 타일을 독립적인 새 촬영 자료로 세지 않습니다.

모델은 YOLOv8n 사전학습 가중치를 시작점으로 미세조정했습니다. 현재 선택 가중치는 **`runs/head/indoor_hardneg_20261106_01/weights/best.pt`**입니다. 배경 17장은 기존 train에서만 골랐고 정답 머리와 일부라도 겹치는 후보는 제외했습니다. 가중치·데이터·실행 결과는 로컬에 있으며 Git에서 제외됩니다.

### 현장 성능 한계

같은 식당 val 4장·정답 머리 15개에서 비교했습니다. 모두 타일 1280·겹침 0.2·입력 1280·conf 0.25·NMS IoU 0.7이며, 정답 매칭 IoU는 0.5입니다.

| 모델 | 정탐 / 오탐 / 누락 | 재현율 | F1 | 사진당 인원 MAE |
| --- | --- | ---: | ---: | ---: |
| 기존 실내 3 epoch | 3 / 1 / 12 | 20.0% | 0.316 | 2.75명 |
| 타일 추가 5 epoch | 10 / 6 / 5 | 66.7% | 0.645 | 0.25명 |
| **배경 보완 5 epoch의 best** | **11 / 2 / 4** | **73.3%** | **0.786** | **1.00명** |

선택 모델의 인원 출력은 `[3, 2, 4, 4]`, 정답은 `[2, 3, 5, 5]`입니다. 첫 추가 학습의 낮은 MAE에는 오탐·누락 상쇄가 포함돼 있어 인원 오차만으로 모델을 선택하지 않았습니다. 선택 모델도 일부 머리를 놓치며 의자 일부를 머리로 오인합니다. 전체 사진 축소 추론으로는 15개 중 2개만 찾았으므로 **타일 옵션을 함께 사용**합니다.

이 4장은 설정 선택에 사용한 검증 자료이며 독립 테스트가 아닙니다. 외부 실내 자료가 섞인 검증 점수도 식당 정확도가 아닙니다. 세부 결과·재현 명령은 [성능 개선 기록](../docs/head_improvement_20261106.md)을 참고합니다.

이후 10 epoch 추가 학습은 위 고정 설정에서 최고 F1 0.800·재현율 66.7%였고, 식당 비중을 높인 8 epoch 학습도 기존 모델을 넘지 못했습니다. 추론 설정을 비교한 현재 선택은 **기존 2차 best + 타일 2048·conf 0.10**입니다. 같은 식당 4장에서 정탐 11·오탐 1·누락 4, 재현율 73.3%·F1 0.815·인원 MAE 0.75명이었으며 **목표 재현율 90%·F1 0.87에는 미달**했습니다. 입력 1280·겹침 0.2·NMS IoU 0.7은 유지합니다.

별도로 받은 480×270 사진에서는 머리 5개를 탐지했고, 육안상 약 13개가 보여 새 장면에서 누락이 많았습니다. 이 사진은 학습·설정 선택에 쓰지 않았고 정식 라벨이 없어 F1·재현율을 산출하지 않았습니다. 전체 결과는 [후속 실험 기록](../docs/head_extension_20261106.md)을 참고합니다.

## 코드별 역할

| 파일 | 역할 |
| --- | --- |
| [prepare_head_dataset.py](prepare_head_dataset.py) | CVAT 머리 라벨·원본 사진 연결, EXIF와 라벨·중복 검사 |
| [prepare_aihub_head_dataset.py](prepare_aihub_head_dataset.py) | AI Hub 실내 머리 bbox 변환·식당 자료 병합 |
| [add_head_training_tiles.py](add_head_training_tiles.py) | 기존 train 사진에 한해 타일 학습 자료 추가 |
| [add_head_hard_negatives.py](add_head_hard_negatives.py) | train의 배경 오탐에서 머리와 겹치지 않는 음성 타일 추가 |
| [evaluate_head_predictions.py](evaluate_head_predictions.py) | 사진 JSON과 정답 라벨의 위치 매칭·누락·오탐·인원 오차 계산 |
| [train_head_smoke.py](train_head_smoke.py) | 로컬 가중치로 짧은 미세조정·검증·결과 저장 |
| [mps_head_runtime.py](mps_head_runtime.py) | MPS 모델 연산과 이미지별 CPU NMS 처리 |
| [predict_heads.py](predict_heads.py) | 사진·폴더 추론, 상세 JSON, 선택적 타일 분석 |
| [predict_head_video.py](predict_head_video.py) | 로컬 녹화 파일의 5초 간격 분석, 상세 JSON |
| [preview_camera.py](preview_camera.py) | 이전 카메라 입력 확인용 도구. 현재 녹화 시연 경로에는 사용하지 않음 |

카메라 장치 인식과 Python의 실제 영상 입력 성공은 구분합니다. 연속성 카메라를 통한 실시간 Python 입력은 완료된 시연 기능으로 기록하지 않습니다.

## 영상 실행과 출력

저장소 최상위에서 기존 가상환경과 로컬 가중치를 사용합니다. 영상 경로는 실제 파일로 변경합니다.

```bash
source .venv/bin/activate
mkdir -p runs/head/video_demo
python ai/predict_head_video.py \
  --model runs/head/indoor_hardneg_20261106_01/weights/best.pt \
  --source "/실제/영상/경로/cafeteria.mov" \
  --output runs/head/video_demo/heads.json \
  --interval 5 \
  --tile-size 2048 --tile-overlap 0.2 \
  --imgsz 1280 --conf 0.10 --iou 0.7
```

- 기본 장치는 MPS입니다. CPU 실행이 필요하면 `--device cpu`를 명시합니다.
- 위 타일 설정은 식당 검증 사진에서 선택했습니다. 다른 해상도의 실제 영상에서는 정확도와 처리 시간을 다시 확인합니다.
- `--output`은 존재하는 부모 폴더 아래의 새 JSON 파일명이어야 합니다.
- 영상 내 0·5·10초 등의 경계에 도달한 첫 프레임을 분석하며 실제 프레임 시각을 기록합니다.
- 최종 JSON은 전체 처리 완료 후 생성됩니다. 실제 5초 간격 전송·업로드 API·재생 동기화는 구현돼 있지 않습니다.

출력 스키마는 `head-video-v1`입니다. 핵심 값은 **`images[].head_count`**, 영상 기준 시각은 **`images[].video_time_seconds`**이며 `detections`의 좌표·신뢰도 등도 유지합니다. 백엔드가 앱에 필요한 필드를 추출합니다. AI 결과에는 혼잡 단계·시설 ID·실행 ID가 아직 없으며, 별도 연동 메타데이터와 응답 계약으로 관리합니다. 전체 필드는 [영상 출력 명세](../docs/head_video_input.md)를 기준으로 합니다.

한 프레임의 `head_count`는 그 프레임의 탐지 수입니다. 여러 프레임의 값을 합산하거나 사각지대 인원을 임의로 더하지 않습니다. 디코딩 실패를 0명으로 만들지 않습니다. 성공한 프레임의 탐지 0건도 실제 빈 장면인지 모델 누락인지 평가가 필요합니다.

## CVAT 머리 라벨 데이터 준비


[`prepare_head_dataset.py`](prepare_head_dataset.py)는 CVAT YOLO 내보내기의 이미지 목록과 라벨을 원본 사진에 연결하고, 학습용 사본을 만듭니다. 저장소 최상위에서 공통 가상환경을 활성화한 뒤 실행합니다. **먼저 CVAT 박스가 EXIF를 적용해 바로 세운 화면 기준인지 눈으로 확인해야 합니다.** `--label-orientation display`는 이 확인을 명시하며, 사진만 바로 세우고 라벨 좌표는 그대로 유지합니다.

```bash
source .venv/bin/activate
python ai/prepare_head_dataset.py \
  --train-export "$HOME/Downloads/cafeteria-head-002-labels" \
  --val-export "$HOME/Downloads/cafeteria-head-labels" \
  --images-dir "$HOME/Downloads" \
  --label-orientation display \
  --output data/head_cafeteria_v1
```

- 이번 로컬 구성은 새 사진 **train 16장·머리 박스 64개**, 이전 사진 **val 4장·박스 15개**로 완료했습니다. 각 export의 `Train.txt`/`train.txt` 목록 순서를 유지했습니다. Ultralytics 데이터 로더로 20장·79개 박스의 로딩과 배치 구성을 확인했으며, 검사 기록은 로컬 출력의 `audit/validation.json`에 있습니다. 이미 생성된 폴더는 그대로 사용하고, 다시 구성할 때는 새 출력 폴더명을 지정합니다.
- 클래스 `0=head`, 이미지·라벨의 일대일 대응, 5열 YOLO 형식, 유한한 정규화 좌표와 이미지 경계, 중복 박스를 검사합니다. 라벨 누락은 오류이며 빈 라벨 파일은 정상입니다.
- 원본 바이트 해시와 EXIF 적용 후 RGB 픽셀 해시로 중복 이미지를 차단합니다. 해시 검사는 유사 장면이나 연속 프레임까지 판별하지 못하므로 장면·시간 분리의 적절성은 사람이 확인합니다. 이 소규모 검증 결과만으로 현장 정확도를 일반화하지 않습니다.
- 전체 이미지를 긴 변 640픽셀로 축소하면 학습 박스 64개 중 58개의 한 변이 8픽셀보다 작아집니다. 이는 좌표로 계산한 크기이며 탐지 성능 측정값은 아닙니다. 실제 학습에서는 입력 해상도나 구역별 이미지 분할을 별도로 검토해야 합니다.
- 원본은 수정하지 않습니다. EXIF를 적용한 새 JPEG에서 메타데이터를 제거하고 `train_001.jpg`, `val_001.jpg`처럼 공백 없는 이름을 붙입니다. 기존 출력 폴더가 있으면 중단합니다.
- 출력은 `images/train`, `images/val`, `labels/train`, `labels/val`, `data.yaml`, `manifest.json`입니다. YAML에는 절대 데이터 경로와 소문자 `train`/`val`을 기록합니다. 폴더를 옮기면 YAML의 `path`도 갱신합니다.
- `manifest.json`에 원본·출력 매핑, 해시, EXIF 방향·변환 여부, 변환 전후 크기, 이미지·박스 수와 분리 근거를 기록합니다. 원본 절대 경로도 포함하므로 공개 공유 전 확인합니다.
- 이 명령은 데이터 준비만 수행합니다. 모델 다운로드·학습·평가·업로드는 수행하지 않으며, 데이터는 기존 Git 제외 정책을 따릅니다.

## 학습 실행

Mac 환경과 의존성은 루트 [개발 환경 안내](../README.md#개발-환경)를 따릅니다. Ultralytics 8.3.253, PyTorch 2.9.1, torchvision 0.24.1을 사용합니다. `ai/`에 별도 가상환경을 만들지 않습니다.

아래는 완료한 두 번째 추가 학습의 재현 예시입니다. 시작점은 첫 타일 학습 가중치이며, 배경을 보완한 데이터와 낮춘 학습률을 사용합니다. 기존 결과를 보존하도록 새 이름을 지정했습니다. 재학습할 때마다 사용하지 않은 이름을 지정합니다.

```bash
source .venv/bin/activate
python ai/train_head_smoke.py \
  --data data/head_aihub71368_hardneg_v1/data.yaml \
  --model runs/head/indoor_tiles_20261106_01/weights/best.pt \
  --epochs 5 --lr0 0.0003 \
  --device mps \
  --name indoor_hardneg_retry_01
```

기본 입력 크기 1280, batch 2, workers 0, AMP 비활성화입니다. MPS 사용 불가 시 자동으로 CPU로 전환하지 않습니다. 결과는 `runs/head/<실행명>/`의 `weights/best.pt`, `weights/last.pt`, `results.csv`, `args.yaml`, `summary.json`과 검증 예측으로 남습니다. 완료된 학습에 새 미세조정을 수행하는 예시이며 중단 복원 명령은 아닙니다. 5 epoch가 충분한 성능을 보장하지 않습니다.

`summary.json`은 학습 평가 기록이며 서비스 JSON과 다릅니다. 평가 예측 수는 `validation_predictions[].predicted_heads`, 사진·영상 출력 수는 `images[].head_count`입니다. 첫 학습 기록은 [시험 학습 결과](../docs/head_smoke_result.md), 상세 학습 설명은 [training_mac.txt](../docs/training_mac.txt)를 참고합니다.

## 병합된 백엔드와 연동할 때

`develop`의 백엔드 1차 구현이 로컬 `main`에 들어왔습니다. 현재 `POST /api/observations`는 이전 좌석 데이터와 입력 `crowd_level`을 요구하므로 **이 AI의 상세 JSON을 그대로 보내면 거절됩니다.** 머리 수 계약·단계 계산·녹화 시각 처리는 백엔드 담당자가 변경합니다. AI에서 없는 좌석 값을 만들어 맞추거나 녹화 시각을 현재 시각으로 바꾸지 않습니다. 현재 API와 설정은 [백엔드 안내](../backend/README.md)를 참고합니다.

## 다음 작업과 완료 기준

- [ ] 실제 iPhone 영상에서 디코딩·회전·영상 시각과 5초 샘플링 확인
- [x] 타일·배경 보완 추가 학습 후 식당 val의 누락·오탐을 기존 가중치와 비교
- [ ] 11월 6일 오전 8시 이후 혼잡 자료 확보, 학습과 별도 테스트 장면 구분
- [ ] 가까운·먼 머리, 정면·측면·뒷머리, 가림, 사람 없는 장면을 검증
- [ ] 별도 테스트 영상에서 수작업 인원 대비 오차와 처리 시간 측정
- [ ] 카메라 관측 범위와 여러 영상의 중복 집계 정책 공유
- [ ] 실제 JSON 샘플과 오류 조건을 백엔드 담당자에게 제공
- [ ] 백엔드의 인원 임계값·변화 안정화와 Android 5초 갱신 시연을 통합 확인

합성 영상 121프레임의 MPS 시험에서는 0·5·10초 결과 3건을 생성했습니다. 이는 입력·추론·출력 경로 확인이며, 사람이 없는 영상이므로 탐지 정확도 시험은 아닙니다. 실제 식당 영상의 성능 평가가 남아 있습니다.
