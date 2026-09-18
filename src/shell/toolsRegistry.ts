import type { ComponentType } from 'react'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChartLine,
  faClapperboard,
  faHelicopter,
  faCar,
  faMusic,
  faDownload,
  faPalette,
  faHospital,
} from '@fortawesome/free-solid-svg-icons'
import { NeteasePlaylistExportTool } from '@/tools/netease-playlist-export'
import { GoldFactorsTool } from '@/tools/gold-factors'
import { DouyinDownloaderTool } from '@/tools/douyin-downloader'
import { BilibiliDownloaderTool } from '@/tools/bilibili-downloader'
import { DroneTrainingTool } from '@/tools/drone-training'
import { RcCarTrainingTool } from '@/tools/rc-car-training'
import { HanddrawStyleTool } from '@/tools/handdraw-style'
import { HospitalRankingTool } from '@/tools/hospital-ranking'

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
    name: '网易云音乐下载器',
    description: '歌单元数据导出，支持 B 站资源嗅探',
    icon: faMusic,
    component: NeteasePlaylistExportTool,
  },
  {
    id: 'douyin-downloader',
    name: '抖音下载器',
    description: '作品 / 喜欢列表 · 预览与下载',
    icon: faDownload,
    component: DouyinDownloaderTool,
  },
  {
    id: 'bilibili-downloader',
    name: 'B站资源下载器',
    description: '关键词嗅探 · 预览播放 · 下载到本地',
    icon: faClapperboard,
    component: BilibiliDownloaderTool,
  },
  {
    id: 'drone-training',
    name: '无人机培训方案',
    description: '从 0 焊到悬停 · 分阶段实操',
    icon: faHelicopter,
    component: DroneTrainingTool,
  },
  {
    id: 'rc-car-training',
    name: '遥控小车培训',
    description: '树莓派无线遥控 · 从原理到动手',
    icon: faCar,
    component: RcCarTrainingTool,
  },
  {
    id: 'handdraw-style',
    name: '手绘风格提示词',
    description: '编号 + 主题，生成中英生图提示词',
    icon: faPalette,
    component: HanddrawStyleTool,
  },
  {
    id: 'hospital-ranking',
    name: '中国大陆医院靠谱榜',
    description: '复旦大学中国医院排行榜 · 最新年度',
    icon: faHospital,
    component: HospitalRankingTool,
  },
]

export const defaultToolId = toolsRegistry[0]?.id ?? null
