import plain1 from '../assets/bears/plain-1.png'
import plain2 from '../assets/bears/plain-2.png'
import tray1 from '../assets/bears/tray-1.png'
import tray2 from '../assets/bears/tray-2.png'
import chef1 from '../assets/bears/chef-1.png'
import chef2 from '../assets/bears/chef-2.png'
import drink1 from '../assets/bears/drink-1.png'
import drink2 from '../assets/bears/drink-2.png'
import book1 from '../assets/bears/book-1.png'
import book2 from '../assets/bears/book-2.png'
import music1 from '../assets/bears/music-1.png'
import music2 from '../assets/bears/music-2.png'
import angry1 from '../assets/bears/angry-1.png'
import angry2 from '../assets/bears/angry-2.png'

// 곰두리 캐릭터: 걷는 동작 2장씩
const SPRITES = {
  plain: [plain1, plain2],
  tray: [tray1, tray2],
  chef: [chef1, chef2],
  drink: [drink1, drink2],
  book: [book1, book2],
  music: [music1, music2],
}

// 곰이 나오는 순서 (요리사 곰은 한 마리만)
const ORDER = ['tray', 'plain', 'drink', 'music', 'book', 'tray', 'plain', 'chef', 'drink', 'tray', 'music', 'book', 'plain', 'drink']

export function spriteFor(index) {
  return SPRITES[ORDER[index % ORDER.length]]
}

// 혼잡도별 곰 수 (설계도 ①②③ 느낌)
export const BEARS_BY_LEVEL = { LOW: 3, MEDIUM: 7, HIGH: 13, NONE: 0 }

// 혼잡할 때 들어왔다가 화나서 나가는 곰의 화난 모습
export const ANGRY_FRAMES = [angry1, angry2]

// 들렀다 가는 손님 곰 (요리사 곰 제외)
const VISITOR_KINDS = ['plain', 'tray', 'drink', 'book', 'music']
export function randomVisitorSprite() {
  return SPRITES[VISITOR_KINDS[Math.floor(Math.random() * VISITOR_KINDS.length)]]
}
