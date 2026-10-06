export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

export interface PreparedImage {
  file: File
  resized: boolean
  originalBytes: number
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`${file.name} is not a readable image`))
    }
    image.src = url
  })
}

function toJpegBlob(
  image: HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  // JPEG has no alpha: paint white so transparent PNG areas do not turn black
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

/** Shrink an image in the browser until it is 2 MB or less. Smaller files pass through untouched. */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image`)
  }
  if (file.size <= MAX_UPLOAD_BYTES) {
    return { file, resized: false, originalBytes: file.size }
  }

  const image = await loadImage(file)
  let scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
  let quality = 0.85

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const blob = await toJpegBlob(
      image,
      Math.max(1, Math.round(image.naturalWidth * scale)),
      Math.max(1, Math.round(image.naturalHeight * scale)),
      quality
    )
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
      return {
        file: new File([blob], name, { type: 'image/jpeg' }),
        resized: true,
        originalBytes: file.size,
      }
    }
    if (quality > 0.6) {
      quality -= 0.1
    } else {
      scale *= 0.8
    }
  }

  throw new Error(`${file.name} could not be reduced to 2 MB`)
}
