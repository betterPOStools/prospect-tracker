import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const isAndroid = Capacitor.getPlatform() === 'android'

/**
 * Apply .native class to body when running inside Capacitor.
 * Call once at app startup (main.tsx).
 */
export function applyPlatformClass() {
  if (isNative) {
    document.body.classList.add('native')
  }
}

/**
 * Get online/offline status.
 * Uses @capacitor/network on native (more reliable), navigator.onLine on web.
 */
export async function getNetworkStatus(): Promise<boolean> {
  if (isNative) {
    const { Network } = await import('@capacitor/network')
    const status = await Network.getStatus()
    return status.connected
  }
  return navigator.onLine
}

/**
 * Export a file to the user's device.
 * Uses @capacitor/filesystem on native, blob URL download on web.
 */
export async function exportFile(data: string, filename: string, mimeType: string): Promise<void> {
  if (isNative) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    })
  } else {
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

/**
 * Open a URL in the native maps app or browser.
 * On native, _system target tells Capacitor WebView to open in the OS browser/maps app.
 */
export function openUrl(url: string): void {
  if (isNative) {
    window.open(url, '_system')
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
