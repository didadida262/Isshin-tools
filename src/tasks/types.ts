export type TaskSource = 'douyin' | 'netease'

export type TaskStatus =
  | 'running'
  | 'waiting'
  | 'stopping'
  | 'success'
  | 'error'
  | 'cancelled'

export interface AppTask {
  id: string
  source: TaskSource
  sourceLabel: string
  title: string
  detail: string
  status: TaskStatus
  successCount?: number
  /** 当前处理项在列表中的 1-based 序号，与表格 # 列一致 */
  itemIndex?: number
  itemTotal?: number
  createdAt: number
  updatedAt: number
}

export const TASK_IDS = {
  douyinBatch: 'douyin-batch-download',
  neteaseBatch: 'netease-batch-download',
  douyinSingle: (awemeId: string) => `douyin-download-${awemeId}`,
  neteaseSingle: (songId: number) => `netease-download-${songId}`,
} as const

export function isActiveTaskStatus(status: TaskStatus) {
  return status === 'running' || status === 'waiting' || status === 'stopping'
}
