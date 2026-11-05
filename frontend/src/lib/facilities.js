import eng5CafeteriaBg from '../assets/backgrounds/eng5-cafeteria.jpg'
import libraryBg from '../assets/backgrounds/library.jpg'
import greenEnergyBg from '../assets/backgrounds/green-energy.jpg'
import studentUnionCafeteriaBg from '../assets/backgrounds/student-union-cafeteria.jpg'

// 시설 목록. ready: 백엔드에 데이터가 있는 시설만 true
// background: 곰이 없는 배경 그림 / walkZone: 곰이 걸어다닐 바닥 구역 (화면 대비 %)
export const FACILITIES = [
  {
    id: 'eng5_cafeteria',
    name: '5공학관 식당',
    type: 'cafeteria',
    ready: true,
    background: eng5CafeteriaBg,
    walkZone: { xMin: 10, xMax: 90, yMin: 66, yMax: 93 },
  },
  // 아래 세 곳은 아직 데이터가 없어 '준비 중' (배경만 보여줌, 곰은 ready가 되면 등장)
  {
    id: 'library',
    name: '도서관',
    type: 'library',
    ready: false,
    background: libraryBg,
    walkZone: { xMin: 12, xMax: 90, yMin: 68, yMax: 94 },
  },
  {
    id: 'green_energy_10f',
    name: '그린에너지공학관 10층',
    type: 'building',
    ready: false,
    background: greenEnergyBg,
    walkZone: { xMin: 15, xMax: 90, yMin: 70, yMax: 94 },
  },
  {
    id: 'student_union_cafeteria',
    name: '학생회관 식당',
    type: 'cafeteria',
    ready: false,
    background: studentUnionCafeteriaBg,
    walkZone: { xMin: 8, xMax: 92, yMin: 64, yMax: 94 },
  },
]

export const DEFAULT_FACILITY_ID = 'eng5_cafeteria'

export function findFacility(id) {
  return FACILITIES.find((f) => f.id === id) ?? FACILITIES[0]
}
