export interface ContactSheet {
  file: string
  group: string
  start: string
  end: string
  title: string
}

export const CONTACT_SHEETS: ContactSheet[] = [
  { file: 'A_001-016.png', group: 'A', start: '001', end: '016', title: '国际社论漫画 / 幽默手绘' },
  { file: 'A_017-032.png', group: 'A', start: '017', end: '032', title: '国际社论漫画 / 幽默手绘' },
  { file: 'A_033-035.png', group: 'A', start: '033', end: '035', title: '国际社论漫画 / 幽默手绘' },
  { file: 'B_036-048.png', group: 'B', start: '036', end: '048', title: '国际绘本 / 叙事型手绘' },
  { file: 'B_049-054.png', group: 'B', start: '049', end: '054', title: '国际绘本 / 叙事型手绘' },
  { file: 'C_055-070.png', group: 'C', start: '055', end: '070', title: '现代平面 / 艺术化人物体系' },
  { file: 'C_071-082.png', group: 'C', start: '071', end: '082', title: '现代平面 / 艺术化人物体系' },
  { file: 'D_083-098.png', group: 'D', start: '083', end: '098', title: '日本作者 / 当代插画体系' },
  { file: 'D_099-114.png', group: 'D', start: '099', end: '114', title: '日本作者 / 当代插画体系' },
  { file: 'D_115-123.png', group: 'D', start: '115', end: '123', title: '日本作者 / 当代插画体系' },
  { file: 'E_124-139.png', group: 'E', start: '124', end: '139', title: '中国作者 / 当代插画体系' },
  { file: 'E_140-154.png', group: 'E', start: '140', end: '154', title: '中国作者 / 当代插画体系' },
  { file: 'F_155-170.png', group: 'F', start: '155', end: '170', title: '通用网感 / 媒介 / 地域手绘' },
  { file: 'F_171-186.png', group: 'F', start: '171', end: '186', title: '通用网感 / 媒介 / 地域手绘' },
  { file: 'F_187-200.png', group: 'F', start: '187', end: '200', title: '通用网感 / 媒介 / 地域手绘' },
  { file: 'G_201-216.png', group: 'G', start: '201', end: '216', title: '当代插画补充' },
  { file: 'G_217-232.png', group: 'G', start: '217', end: '232', title: '当代插画补充' },
  { file: 'G_233-248.png', group: 'G', start: '233', end: '248', title: '当代插画补充' },
  { file: 'G_249-261.png', group: 'G', start: '249', end: '261', title: '当代插画补充' },
]

export function sheetSrc(file: string) {
  return `/handdraw-styles/${file}`
}

export function sheetContains(sheet: ContactSheet, number: string) {
  const n = Number(number)
  return n >= Number(sheet.start) && n <= Number(sheet.end)
}
