import { Browser } from '@capacitor/browser'

// Must match build.gradle versionCode — bump on every release
export const CURRENT_VERSION_CODE = 1

const VERSION_URL = 'https://betterpostools.github.io/prospect-tracker/version.json'

export async function checkForUpdate() {
  const res = await fetch(VERSION_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return {
    hasUpdate: data.versionCode > CURRENT_VERSION_CODE,
    versionName: data.versionName,
    changelog: data.changelog,
    downloadUrl: data.downloadUrl,
  }
}

export async function openDownload(url) {
  await Browser.open({ url })
}
