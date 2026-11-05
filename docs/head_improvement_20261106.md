# 머리 탐지 개선 기록 — 2026-11-06

이 문서는 첫 타일·배경 보완 실험 당시의 기록입니다. 이후 10 epoch·균형 자료 8 epoch 추가 실험, 추론 설정 비교와 새 사진 테스트는 [후속 기록](head_extension_20261106.md)을 참고합니다. 현재 실험 선택 설정은 타일 2048·conf 0.10이며, 목표 재현율 90%·F1 0.87에는 미달했습니다.

식당의 작은 머리를 놓치는 문제를 줄이기 위해 실내 데이터, 훈련 타일, 타일 추론을 적용했습니다. 같은 식당 검증 사진 4장에서 맞게 찾은 머리는 비교 기준 3개 → 1차 10개 → 2차 11개로 늘었습니다. 1차에서 6개까지 늘었던 오탐은 2차에서 2개로 줄었습니다. 이번 실험에서는 **2차 `best.pt`와 1280 타일 추론을 선택**했습니다. 식당 검증 4장에 대한 선택이며 서비스 전체 성능을 보장하는 결과는 아닙니다.

이 문서는 머리 탐지 모델과 로컬 평가 기록입니다. 좌석 점유나 백엔드 기능 변경을 포함하지 않습니다. 기존 첫 시험 학습은 [별도 기록](head_smoke_result.md)을 참고합니다.

## 데이터 구성

모든 라벨은 `0=head` 단일 클래스의 YOLO 박스입니다. 자체 촬영 원본은 EXIF 방향을 반영한 사본으로 준비했고, CVAT에서 표시된 방향의 좌표를 유지했습니다. 원본 이미지와 라벨을 수정하지 않았습니다.

| 구성 | train 이미지 / 박스 | val 이미지 / 박스 |
| --- | ---: | ---: |
| 자체 촬영 식당 `head_cafeteria_v1` | 16 / 64 | 4 / 15 |
| AIHub 71368 실내 선택분 | 카페 67 / 1818 | 공연장 77 / 1867 |
| 합친 실내셋 `head_aihub71368_v1` | 83 / 1882 | 81 / 1882 |
| 훈련 타일 추가 `head_aihub71368_tiles_v1` | 163 / 2045 | 81 / 1882 |
| 오탐 배경 추가 `head_aihub71368_hardneg_v1` | 180 / 2045 | 81 / 1882 |

AIHub 샘플의 상세 구조와 사용 범위는 [데이터 확인 기록](aihub71368_sample.md)에 있습니다. 실내 카페를 train, 다른 공연장 장면을 val에 배치해 같은 연속 장면의 프레임을 양쪽에 섞지 않았습니다. 자체 식당 사진도 기존 train 16장과 val 4장 구분을 유지했습니다. 촬영 시간·시점의 충분한 독립성까지 증명한 분리는 아닙니다.

검증 81장의 정답 박스 중 1867개가 공연장이므로 전체 검증 평균만으로 식당 성능을 판단하지 않습니다. 아래 비교는 **식당 val 4장, 정답 머리 15개만** 사용했습니다. 15개는 사진별 정답의 합이며 고유 방문객 수가 아닙니다.

## 작은 머리와 훈련 타일

식당 검증 사진은 5712×4284입니다. 긴 변을 1280으로 줄이면 머리 박스의 중앙 크기는 약 11×11픽셀이고, 15개 중 6개는 짧은 변이 8픽셀 미만입니다. 좌표와 EXIF 방향을 확인한 결과, 잘못된 회전보다는 축소 후 작은 객체 크기를 우선 개선할 근거가 있었습니다. 이것만으로 모든 누락 원인을 확정한 것은 아닙니다.

[타일 생성 도구](../ai/add_head_training_tiles.py)는 기존 실내셋을 복사한 뒤 **자체 식당 train 16장만** 자릅니다.

- 1280×1280, 격자 중첩 20%이며 머리 중심의 추가 후보도 검사합니다.
- 정답 머리가 일부만 걸치는 타일은 통째로 제외합니다.
- 원본당 양성 타일 최대 4장을 선택하며, 모든 원본 정답이 최소 한 타일에 완전히 포함되는지 확인합니다.
- 원본당 음성 타일 1장을 추가합니다. 안전한 최하단 후보에서 바닥·좌석 무늬가 있는 구역을 우선합니다.
- crop 원점을 빼고 타일 너비·높이로 정규화하여 새 YOLO 라벨을 만듭니다.

실제로 양성 64장·음성 16장을 추가했고, 부분 머리를 포함한 후보 20개를 제외했습니다. 원본 64개 정답을 모두 포함했으며, 타일에 반복 등장한 박스는 163개입니다. 타일은 같은 사진에서 나온 파생 이미지이므로 독립된 새 촬영 장면으로 세지 않습니다. val 이미지·라벨은 바이트 단위로 동일하게 복사했습니다.

## 학습 및 평가 방법

| 단계 | 초기 가중치 | 데이터 | 학습 |
| --- | --- | --- | --- |
| 비교 기준 `indoor_20261105_01` | 로컬 YOLOv8n 사전학습 가중치 | 실내셋 | MPS, 3 epoch, lr0=0.001 |
| 1차 `indoor_tiles_20261106_01` | 비교 기준의 `best.pt` | 훈련 타일 추가셋 | MPS, 5 epoch, lr0=0.001 |
| 2차 `indoor_hardneg_20261106_01` | 1차의 `best.pt` | 오탐 배경 추가셋 | MPS, 5 epoch, lr0=0.0003 |

입력 크기 1280, batch 2, AdamW를 사용합니다. 실제 실행 인자는 각 실행 폴더의 `args.yaml`에 보존합니다. 1차의 `best.pt`와 `last.pt` 모델 가중치는 동일함을 확인했으므로 서로 다른 후보로 세지 않았습니다. 2차는 두 가중치가 달라 각각 평가했습니다. 2차 학습·검증 시간은 약 339.55초이며 별도 식당 비교 추론 시간은 포함하지 않습니다.

### 실제 데이터 증강 적용 확인

두 추가 학습의 `args.yaml`과 설치된 Ultralytics 8.3.253의 detect 데이터 로더·변환 코드를 함께 확인했습니다. 다음 증강은 학습 중 무작위로 적용하며 별도 이미지 파일을 늘려 저장하는 방식이 아닙니다.

| 증강 | 실제 설정 | 적용 여부 |
| --- | --- | --- |
| 색상·채도·밝기 변화 | `hsv_h=0.015`, `hsv_s=0.7`, `hsv_v=0.4` | 적용 |
| 좌우 반전 | `fliplr=0.5` | 50% 확률 |
| 크기 변화 | `scale=0.1` | 0.9~1.1 배율 |
| 위치 이동 | `translate=0.05` | 가로·세로 최대 약 5% |
| 회전·수직 반전·원근 왜곡 | `degrees=0`, `flipud=0`, `perspective=0` | 미적용 |
| Mosaic·MixUp·CutMix·Copy-Paste | 모두 0 | 미적용 |

설정 파일의 `augment: false`는 **추론 시 TTA 설정**입니다. detect 학습 데이터 로더는 `mode == "train"`일 때 자체 증강을 활성화하므로, 이 값이 학습 증강을 끈다는 뜻은 아닙니다. `auto_augment: randaugment`, `erasing: 0.4`도 공통 설정 파일에 있지만 분류 전용이라 이번 머리 탐지 학습에는 적용되지 않았습니다. 이 구분은 [Ultralytics 공식 증강 안내](https://docs.ultralytics.com/guides/yolo-data-augmentation/)와 설치 코드에서 확인했습니다.

현재 가상환경에는 Albumentations가 설치되지 않아 해당 선택적 경로의 Blur·MedianBlur·ToGray·CLAHE도 적용되지 않았습니다. 반면 앞 절의 타일 80장은 사전에 파일로 만든 학습 자료이며, 배경 17장은 오탐 보완용 음성 사례입니다. 증강·타일 수 증가가 독립 촬영 장면 증가를 뜻하지는 않습니다.

비교 기준, 1차, 2차 모두 다음 조건으로 다시 추론했습니다.

- 같은 식당 val 4장과 같은 정답 라벨 사용.
- confidence=0.25, 입력 크기 1280, 타일 크기 1280, 중첩 20%.
- 타일별 예측 좌표를 원본 좌표로 되돌린 뒤 전체 NMS로 중복 억제. NMS IoU=0.7.
- 출력은 `head-image-v1` JSON의 `head_count`와 개별 머리 박스·confidence.
- 평가는 신뢰도 내림차순으로 아직 대응하지 않은 정답 중 IoU가 가장 높은 박스와 1:1 매칭. **매칭 IoU≥0.5**일 때 TP로 판정합니다. 동률은 저장 순서를 사용합니다.

NMS의 0.7과 정답 매칭의 0.5는 서로 다른 기준입니다. TP는 맞게 찾은 머리, FP는 대응 정답 없는 예측, FN은 놓친 정답입니다. Precision=TP/(TP+FP), Recall=TP/(TP+FN), F1은 두 값의 조화평균입니다. Count MAE는 사진별 `|예측 개수−정답 개수|`의 평균입니다. 여기의 고정 임계값 지표는 AP/mAP와 다릅니다.

원본 전체 축소 추론(`*_full.json`)도 별도로 저장했으며, 아래 표는 동일한 **타일 추론끼리** 비교합니다.

## 단계별 결과

| 모델·추론 | TP | FP | FN | Precision | Recall | F1 | Count MAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 비교 기준 + 타일 | 3 | 1 | 12 | 0.7500 | 0.2000 | 0.3158 | 2.75 |
| 1차 + 타일 | 10 | 6 | 5 | 0.6250 | 0.6667 | 0.6452 | 0.25 |
| **2차 best + 타일 — 선택** | **11** | **2** | **4** | **0.8462** | **0.7333** | **0.7857** | **1.00** |
| 2차 last + 타일 | 9 | 0 | 6 | 1.0000 | 0.6000 | 0.7500 | 1.50 |

1차에서 누락이 줄었지만 오탐이 늘어 Precision은 낮아졌습니다. Count MAE 감소만으로 정확한 머리 탐지가 완성됐다고 판단할 수 없습니다.

| 식당 검증 사진 | 정답 | 비교 기준 예측 수 | 1차 예측 수 | 1차 TP / FP / FN | 2차 best 예측 수 | 2차 best TP / FP / FN |
| --- | ---: | ---: | ---: | --- | ---: | --- |
| val_001.jpg | 2 | 0 | 3 | 2 / 1 / 0 | 3 | 2 / 1 / 0 |
| val_002.jpg | 3 | 0 | 3 | **0 / 3 / 3** | 2 | **2 / 0 / 1** |
| val_003.jpg | 5 | 2 | 5 | 4 / 1 / 1 | 4 | 4 / 0 / 1 |
| val_004.jpg | 5 | 2 | 5 | 4 / 1 / 1 | 4 | 3 / 1 / 2 |

특히 `val_002.jpg`는 정답과 예측 수가 모두 3이지만 실제 머리를 하나도 맞히지 못했습니다. 육안으로 확인한 1차 FP 6개는 의자 등받이·끝, 의자에 걸린 물체, 휴지함 위 휴지 등 배경 오탐입니다. 정답 머리 누락 라벨로 판단한 사례는 없었습니다.

2차 best에서는 TP 10→11, FP 6→2, FN 5→4로 위치 매칭 성능이 좋아졌습니다. 반면 Count MAE는 0.25→1.00으로 커졌습니다. 이는 1차의 작은 개수 오차에 **오탐과 누락의 상쇄**가 포함됐기 때문입니다. `val_002.jpg`는 1차의 잘못된 3개 예측 대신 실제 머리 2개를 찾았으므로 위치 정확도는 좋아졌지만 개수 오차는 0→1이 됐습니다. 모든 사진이 개선된 것도 아닙니다. `val_004.jpg`에서는 TP가 4→3으로 줄었습니다.

## 오탐 배경 추가

[음성 타일 생성 도구](../ai/add_head_hard_negatives.py)는 1차 모델이 **식당 train 16장**에서 출력한 예측만 사용합니다. 검증 사진에서 잘라낸 오탐은 학습에 넣지 않습니다.

1. 이미지별 예측을 신뢰도순으로 검사하고 예측 중심의 1280 정사각형을 원본 경계 안으로 맞춥니다.
2. crop에 정답 머리가 조금이라도 겹치면 제외합니다. 원본 GT가 완전하다는 가정이 필요합니다.
3. 같은 crop 원점과 같은 JPEG 바이트를 중복 제거하며 원본당 최대 2장만 추가합니다.
4. 선택한 배경은 빈 YOLO 라벨을 저장합니다. 기존 이미지·라벨·부모 manifest를 보존하며 기존 출력 경로는 덮어쓰지 않습니다.

103개 예측 후보 중 정답과 교차한 79개, 이미지당 제한으로 7개를 제외하고 **음성 17장**을 추가했습니다. 17장 모두 육안 확인했으며 의자·안내지·천장 무늬·바닥·문 지지대 등의 배경이고 머리는 보이지 않았습니다. 기존 train/val 파일 바이트 동일, 새 crop의 GT 교차 0, 새 라벨이 빈 파일, train/val 이미지 바이트 중복 0을 확인했습니다.

## 이번 실험의 모델 선택

선택한 가중치는 `runs/head/indoor_hardneg_20261106_01/weights/best.pt`입니다. 설정은 `imgsz=1280`, `tile_size=1280`, `tile_overlap=0.2`, `conf=0.25`, `iou=0.7`입니다. 가중치만 바꾸고 타일 추론을 끄면 같은 결과가 나오지 않습니다. 2차 best의 전체 사진 축소 추론은 `[0, 0, 1, 1]`, TP 2·FP 0·FN 13, Count MAE 3.25였습니다.

2차 last의 타일 예측 수는 `[1, 1, 4, 3]`입니다. FP는 0이지만 머리 6개를 놓쳐, TP 11·FN 4인 best보다 Recall과 F1이 낮았습니다. 따라서 오탐과 누락을 함께 고려하여 이번 식당 실험에서는 best를 선택했습니다. 기존 비교 기준·1차·2차 last 가중치도 비교 기록으로 유지합니다.

2차 best의 오류를 확대해 확인했습니다. 오탐 2개는 검은 의자 등받이와 나무 의자 등받이 끝이며 실제 머리 라벨 누락이 아닙니다. 누락 4개는 작은 머리 1개와 비교적 큰 머리·옆얼굴 3개입니다. 현재 confidence 0.25 출력에서 이 네 정답과 예측 박스의 최대 IoU는 모두 0으로, 박스가 조금 어긋나서 매칭만 실패한 경우는 아닙니다.

다음 개선은 train 사진에서 배경 오탐과 머리 누락을 함께 검수하고, 비슷한 조건의 머리 양성 사례도 보완하는 방향입니다. 검증 사진 자체나 그 crop을 학습으로 옮기지 않습니다. 증강 강도를 바꾸는 실험은 현재 모델을 보존하고 한 조건씩 비교하며, 작은 머리를 더 알아보기 어렵게 만드는 강한 축소·블러를 무조건 추가하지 않습니다. 이러한 추가 증강 실험은 아직 실행하지 않았습니다.

## 실행 기록과 재현

아래는 저장소 루트에서 실행한 데이터 준비 방식입니다. 기존 데이터가 있는 경우 도구가 중단하므로 다시 준비할 때는 새로운 출력 이름을 사용합니다. 원본 사진·초기 모델은 별도 로컬 준비가 필요합니다.

```bash
.venv/bin/python ai/add_head_training_tiles.py \
  --data data/head_aihub71368_v1 \
  --output data/head_aihub71368_tiles_v1

.venv/bin/python ai/add_head_hard_negatives.py \
  --base-dataset data/head_aihub71368_tiles_v1 \
  --source-dataset data/head_cafeteria_v1 \
  --predictions runs/head/benchmarks/cafeteria_tiles_20261106_01/train_mining_predictions.json \
  --output data/head_aihub71368_hardneg_v1
```

선택 모델을 같은 조건으로 다시 추론하려면 아래 명령을 사용합니다. 출력 파일은 새 경로여야 하며 부모 폴더는 먼저 존재해야 합니다.

```bash
.venv/bin/python ai/predict_heads.py \
  --model runs/head/indoor_hardneg_20261106_01/weights/best.pt \
  --source data/head_cafeteria_v1/images/val \
  --output runs/head/benchmarks/cafeteria_tiles_20261106_01/chosen_tiled_recheck.json \
  --device mps --imgsz 1280 --conf 0.25 --iou 0.7 \
  --tile-size 1280 --tile-overlap 0.2
```

평가는 [CPU 평가 도구](../ai/evaluate_head_predictions.py)로 이미 저장된 예측 JSON과 라벨을 비교합니다. 평가 명령 자체는 모델 추론을 다시 수행하지 않습니다. 다음 출력 파일도 새 경로여야 합니다.

```bash
.venv/bin/python ai/evaluate_head_predictions.py \
  --predictions runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_best_tiled.json \
  --labels data/head_cafeteria_v1/labels/val \
  --output runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_best_tiled_metrics_recheck.json
```

추론 명령, 가중치 SHA-256, 검증 이미지·라벨 해시는 비교 실험 manifest에 기록했습니다.

- [비교 실험 manifest](../runs/head/benchmarks/cafeteria_tiles_20261106_01/manifest.json)
- [2차 비교 manifest](../runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_manifest.json)
- [비교 기준 예측](../runs/head/benchmarks/cafeteria_tiles_20261106_01/baseline_tiled.json) · [평가 수치](../runs/head/benchmarks/cafeteria_tiles_20261106_01/baseline_tiled_metrics.json)
- [1차 예측](../runs/head/benchmarks/cafeteria_tiles_20261106_01/candidate_tiled.json) · [평가 수치](../runs/head/benchmarks/cafeteria_tiles_20261106_01/candidate_tiled_metrics.json)
- [2차 best 예측](../runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_best_tiled.json) · [평가 수치](../runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_best_tiled_metrics.json)
- [2차 last 예측](../runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_last_tiled.json) · [평가 수치](../runs/head/benchmarks/cafeteria_tiles_20261106_01/hardneg_last_tiled_metrics.json)
- [음성 수집에 사용한 train 예측](../runs/head/benchmarks/cafeteria_tiles_20261106_01/train_mining_predictions.json)
- [실내셋 manifest](../data/head_aihub71368_v1/manifest.json) · [타일셋 manifest](../data/head_aihub71368_tiles_v1/manifest.json) · [음성 추가셋 manifest](../data/head_aihub71368_hardneg_v1/manifest.json)
- [비교 기준 학습 요약](../runs/head/indoor_20261105_01/summary.json) · [1차 학습 요약](../runs/head/indoor_tiles_20261106_01/summary.json)
- [2차 학습 요약](../runs/head/indoor_hardneg_20261106_01/summary.json) · [선택한 best.pt](../runs/head/indoor_hardneg_20261106_01/weights/best.pt)

데이터와 실행 산출물은 Git 제외 대상인 로컬 파일입니다. 저장소를 새로 받는 것만으로 위 파일들이 제공되지는 않습니다.

## 해석 범위

식당 검증 4장은 이미 개선 방향과 모델 선택에 사용한 **튜닝용 검증셋**입니다. 독립 테스트 성능으로 보고하지 않습니다. 같은 원본에서 만든 타일이 많아도 장면 다양성이 늘어난 것은 아니며, 정확한 바이트 중복이 없다는 사실만으로 비슷한 장면의 상관성까지 사라지지는 않습니다.

별도 시점·혼잡 수준·조명의 식당 영상으로 머리 위치와 개수를 추가 확인해야 일반화 성능을 판단할 수 있습니다. 현재 결과만으로 300명 밀집 상황, 영상 처리 지연, 백엔드·앱 연동 정확도를 검증한 것으로 간주하지 않습니다.
