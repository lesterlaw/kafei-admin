export const KIOSK_APK_VERSION = '1.0.14'
export const KIOSK_APK_FILE_NAME = 'kafei-kiosk.apk'
export const KIOSK_APK_SIZE_LABEL = '30 MB'
export const KIOSK_APK_PATH = `/${KIOSK_APK_FILE_NAME}`
export const KIOSK_APK_PAGE_PATH = '/kiosk'
export const KIOSK_SERVER_URL = 'https://kafei-admin.vercel.app'

export function formatKioskToken(token: string) {
  const digits = token.replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`
  }
  return token
}

export function getKioskApkStorageUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return KIOSK_APK_PATH
  }

  return `${supabaseUrl}/storage/v1/object/public/kiosk-releases/${KIOSK_APK_FILE_NAME}`
}
