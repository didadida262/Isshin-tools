import type { DouyinListKind } from '../types'

export function kindLabel(kind: DouyinListKind): string {
  switch (kind) {
    case 'favorite':
      return '喜欢'
    case 'collect_music':
      return '收藏音乐'
    default:
      return '作品'
  }
}

export function kindBatchDownloadLabel(kind: DouyinListKind): string {
  switch (kind) {
    case 'favorite':
      return '一键下载喜欢'
    case 'collect_music':
      return '一键下载收藏音乐'
    default:
      return '一键下载作品'
  }
}

export function isMusicKind(kind: DouyinListKind): boolean {
  return kind === 'collect_music'
}
