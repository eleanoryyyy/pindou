import { db } from './db.ts'
import { isAcceptedImageFile } from './recognizePattern.ts'
import { InventoryError, type WorkImage, type WorkItem } from './types.ts'

function now(): number {
  return Date.now()
}

function newId(): string {
  return crypto.randomUUID()
}

async function makeThumb(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const max = 480
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return blob
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
}

export async function listWorks(): Promise<WorkItem[]> {
  const rows = await db.workItems.toArray()
  return rows.sort((a, b) => b.date - a.date || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}

export async function getWork(id: string): Promise<WorkItem | undefined> {
  return db.workItems.get(id)
}

export async function getWorkImage(id: string): Promise<WorkImage | undefined> {
  return db.workImages.get(id)
}

export async function createWork(file: File, fields: { date?: number; note?: string; patternId?: string } = {}): Promise<WorkItem> {
  if (!isAcceptedImageFile(file)) {
    throw new InventoryError('只支持 JPG 或 PNG 图片')
  }
  const stamp = now()
  const id = newId()
  const blob = file.slice(0, file.size, file.type || 'image/jpeg')
  const thumbBlob = await makeThumb(blob)
  const item: WorkItem = {
    id,
    date: fields.date ?? stamp,
    note: (fields.note ?? '').trim(),
    patternId: fields.patternId,
    mimeType: blob.type,
    fileName: file.name || '作品.jpg',
    createdAt: stamp,
    updatedAt: stamp,
  }
  await db.transaction('rw', [db.workItems, db.workImages], async () => {
    await db.workItems.add(item)
    await db.workImages.add({ id, blob, thumbBlob })
  })
  return item
}

export async function updateWork(
  id: string,
  patch: Partial<Pick<WorkItem, 'date' | 'note' | 'patternId'>>,
  file?: File,
): Promise<WorkItem> {
  const current = await db.workItems.get(id)
  if (!current) throw new InventoryError('找不到该作品')
  if (file && !isAcceptedImageFile(file)) {
    throw new InventoryError('只支持 JPG 或 PNG 图片')
  }
  const next: WorkItem = {
    ...current,
    date: patch.date ?? current.date,
    note: patch.note !== undefined ? patch.note.trim() : current.note,
    patternId: patch.patternId !== undefined ? patch.patternId || undefined : current.patternId,
    updatedAt: now(),
  }
  if (file) {
    const blob = file.slice(0, file.size, file.type || current.mimeType)
    const thumbBlob = await makeThumb(blob)
    next.mimeType = blob.type
    next.fileName = file.name || current.fileName
    await db.transaction('rw', [db.workItems, db.workImages], async () => {
      await db.workItems.put(next)
      await db.workImages.put({ id, blob, thumbBlob })
    })
  } else {
    await db.workItems.put(next)
  }
  return next
}

export async function deleteWork(id: string): Promise<void> {
  await db.transaction('rw', [db.workItems, db.workImages], async () => {
    await db.workItems.delete(id)
    await db.workImages.delete(id)
  })
}
