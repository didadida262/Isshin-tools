import type { ComponentType } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faChartLine, faMusic } from '@fortawesome/free-solid-svg-icons'
import { NeteasePlaylistExportTool } from '@/tools/netease-playlist-export'
import { GoldFactorsTool } from '@/tools/gold-factors'

export interface ToolDefinition {
  id: string
  name: string
  description: string
  icon: IconDefinition
  component: ComponentType
}

export const toolsRegistry: ToolDefinition[] = [
  {
    id: 'gold-factors',
    name: '黄金影响因子',
    description: '实际利率 / 美元 / 通胀 / 风险分层监控',
    icon: faChartLine,
    component: GoldFactorsTool,
  },
  {
    id: 'netease-playlist-export',
    name: '网易云歌单导出',
    description: '仅导出歌单元数据，不涉及音频',
    icon: faMusic,
    component: NeteasePlaylistExportTool,
  },
]

export const defaultToolId = toolsRegistry[0]?.id ?? null
