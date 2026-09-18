export const AGNES_IMAGE_MODELS = [
  {
    id: 'agnes-image-2.0-flash',
    label: 'Agnes Image 2.0 Flash',
    docsUrl: 'https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-20-flash',
  },
  {
    id: 'agnes-image-2.1-flash',
    label: 'Agnes Image 2.1 Flash',
    docsUrl: 'https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-21-flash',
  },
  {
    id: 'agnes-image-2.5-flash',
    label: 'Agnes Image 2.5 Flash',
    docsUrl: 'https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-25-flash',
  },
] as const

export type AgnesImageModelId = (typeof AGNES_IMAGE_MODELS)[number]['id']

export const DEFAULT_AGNES_IMAGE_MODEL: AgnesImageModelId =
  'agnes-image-2.5-flash'

export const AGNES_IMAGES_ENDPOINT =
  'https://api.agnes-ai.cn/v1/images/generations'

export interface AgnesSettings {
  apiKey: string
  imageModel: AgnesImageModelId
}

export function isAgnesImageModelId(value: string): value is AgnesImageModelId {
  return AGNES_IMAGE_MODELS.some((m) => m.id === value)
}
