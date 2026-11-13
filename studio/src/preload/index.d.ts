import { ElectronAPI } from '@electron-toolkit/preload'
import type { StudioAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    studio: StudioAPI
    api: unknown
  }
}

export {}
