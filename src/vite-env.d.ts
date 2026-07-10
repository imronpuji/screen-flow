/// <reference types="vite/client" />

import type { ScreenFlowApi } from '../shared/ipc'

declare global {
  interface Window {
    screenFlow?: ScreenFlowApi
  }
}

export {}
