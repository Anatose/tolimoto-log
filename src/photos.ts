/** Shrinks a photo to at most 2000 px on the long side as JPEG; other files go as they are. */
export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85))
    return out && out.size < file.size ? out : file
  } catch {
    return file
  }
}
