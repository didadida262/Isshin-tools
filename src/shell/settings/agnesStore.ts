import { Store } from '@tauri-apps/plugin-store'
import {
  DEFAULT_AGNES_IMAGE_MODEL,
  isAgnesImageModelId,
  type AgnesImageModelId,
  type AgnesSettings,
} from './types'

const STORE_PATH = 'isshin-settings.json'
const AGNES_API_KEY = 'agnes.apiKey'
const AGNES_IMAGE_MODEL = 'agnes.imageModel'

async function getStore() {
  return Store.load(STORE_PATH)
}

export async function loadAgnesSettings(): Promise<AgnesSettings> {
  try {
    const store = await getStore()
    const apiKey = (await store.get<string>(AGNES_API_KEY)) ?? ''
    const rawModel = (await store.get<string>(AGNES_IMAGE_MODEL)) ?? ''
    const imageModel: AgnesImageModelId = isAgnesImageModelId(rawModel)
      ? rawModel
      : DEFAULT_AGNES_IMAGE_MODEL
    return { apiKey, imageModel }
  } catch {
    return { apiKey: '', imageModel: DEFAULT_AGNES_IMAGE_MODEL }
  }
}

export async function saveAgnesSettings(settings: AgnesSettings): Promise<void> {
  try {
    const store = await getStore()
    await store.set(AGNES_API_KEY, settings.apiKey)
    await store.set(AGNES_IMAGE_MODEL, settings.imageModel)
    await store.save()
  } catch {
    // Browser / store unavailable — keep in-memory only.
  }
}
