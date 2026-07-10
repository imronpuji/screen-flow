import type { AppInfo } from '../../shared/ipc'

const browserFallback: AppInfo = {
  name: 'Screen Flow',
  version: '0.1.0',
  runtime: 'browser',
  platform: 'web',
}

/** Prefer preload bridge; fall back so Vite preview still works without Electron. */
export async function fetchAppInfo(): Promise<AppInfo> {
  if (window.screenFlow?.getAppInfo) {
    return window.screenFlow.getAppInfo()
  }
  return browserFallback
}
