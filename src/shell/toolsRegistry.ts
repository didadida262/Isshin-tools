import type { ComponentType } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faChartLine, faMusic, faScissors } from '@fortawesome/free-solid-svg-icons'
import { NeteasePlaylistExportTool } from '@/tools/netease-playlist-export'
import { GoldFactorsTool } from '@/tools/gold-factors'
import { DouyinTrimEndTool } from '@/tools/douyin-trim-end'

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
    name: '网易B站结合体',
    description: '歌单元数据导出，支持 B 站资源嗅探',
    icon: faMusic,
    component: NeteasePlaylistExportTool,
  },
  {
    id: 'douyin-trim-end',
    name: '抖音结尾切除',
    description: '批量切除视频末尾冗余帧',
    icon: faScissors,
    component: DouyinTrimEndTool,
  },
]

export const defaultToolId = toolsRegistry[0]?.id ?? null
