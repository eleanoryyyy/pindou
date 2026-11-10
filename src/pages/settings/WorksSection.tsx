import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Drawer } from '../../components/Overlay.tsx'
import { useFeedback } from '../../components/Feedback.tsx'
import { listPatterns } from '../../data/patternRepo.ts'
import { messageOf } from '../../data/repo.ts'
import { createWork, deleteWork, getWorkImage, listWorks, updateWork } from '../../data/workRepo.ts'
import type { Pattern, WorkItem } from '../../data/types.ts'
import { useBlobUrl } from '../patterns/useBlobUrl.ts'

function formatWorkDate(value: number): string {
  return new Date(value).toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

function toDateInput(value: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
  return parts
}

function WorkCard({
  item,
  patternName,
  onEdit,
}: {
  item: WorkItem
  patternName?: string
  onEdit: () => void
}) {
  const [blob, setBlob] = useState<Blob>()
  useEffect(() => {
    void getWorkImage(item.id).then((image) => setBlob(image?.thumbBlob ?? image?.blob))
  }, [item.id, item.updatedAt])
  const url = useBlobUrl(blob)
  return (
    <li className="work-card">
      <button type="button" className="work-card__photo" onClick={onEdit}>
        {url ? <img src={url} alt="" /> : <span className="work-card__placeholder" />}
      </button>
      <p className="work-card__meta">{formatWorkDate(item.date)}</p>
      {item.note ? <p className="work-card__meta">{item.note}</p> : null}
      {patternName ? <p className="work-card__meta">图纸：{patternName}</p> : null}
    </li>
  )
}

export function WorksSection({ tick = 0, onChanged }: { tick?: number; onChanged?: () => void }) {
  const { toast } = useFeedback()
  const fileRef = useRef<HTMLInputElement>(null)
  const [works, setWorks] = useState<WorkItem[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<WorkItem | 'new' | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [date, setDate] = useState(toDateInput(Date.now()))
  const [note, setNote] = useState('')
  const [patternId, setPatternId] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    const [nextWorks, nextPatterns] = await Promise.all([listWorks(), listPatterns()])
    setWorks(nextWorks)
    setPatterns(nextPatterns)
    setLoaded(true)
  }

  useEffect(() => {
    void reload()
  }, [tick])

  function openNew() {
    setEditing('new')
    setFile(null)
    setDate(toDateInput(Date.now()))
    setNote('')
    setPatternId('')
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function openEdit(item: WorkItem) {
    setEditing(item)
    setFile(null)
    setDate(toDateInput(item.date))
    setNote(item.note)
    setPatternId(item.patternId ?? '')
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const stamp = new Date(`${date}T12:00:00+08:00`).getTime()
    if (!Number.isFinite(stamp)) {
      setError('请填写日期')
      return
    }
    try {
      if (editing === 'new') {
        if (!file) {
          setError('请先选一张成品照片')
          return
        }
        await createWork(file, { date: stamp, note, patternId: patternId || undefined })
        toast('作品已记下')
      } else if (editing) {
        await updateWork(editing.id, { date: stamp, note, patternId: patternId || undefined }, file ?? undefined)
        toast('作品已更新')
      }
      setEditing(null)
      setError('')
      await reload()
      onChanged?.()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function handleDelete() {
    if (!editing || editing === 'new') return
    if (!window.confirm('确定删除这条作品记录？照片也会一起删掉。')) return
    await deleteWork(editing.id)
    toast('作品已删除')
    setEditing(null)
    await reload()
    onChanged?.()
  }

  if (!loaded) return null

  return (
    <div className="page-block">
      <div className="pd-pagehead" style={{ marginBottom: 12 }}>
        <h2 className="pd-section-title" style={{ margin: 0 }}>
          作品记录
        </h2>
        <button type="button" className="pd-btn pd-btn-secondary" onClick={openNew}>
          添加作品
        </button>
      </div>
      {works.length === 0 ? (
        <EmptyState mark="作" description="还没有作品记录。" />
      ) : (
        <ul className="work-grid">
          {works.map((item) => (
            <WorkCard
              key={item.id}
              item={item}
              patternName={item.patternId ? patterns.find((pattern) => pattern.id === item.patternId)?.name : undefined}
              onEdit={() => openEdit(item)}
            />
          ))}
        </ul>
      )}

      {editing ? (
        <Drawer title={editing === 'new' ? '添加作品' : '编辑作品'} onClose={() => setEditing(null)}>
          <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
            {error ? <p className="form-error">{error}</p> : null}
            <label className="pd-field">
              <span>成品照片</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                aria-label="成品照片"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="pd-field">
              <span>日期</span>
              <input className="pd-input" type="date" aria-label="作品日期" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="pd-field">
              <span>备注</span>
              <input className="pd-input" aria-label="作品备注" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            <label className="pd-field">
              <span>关联图纸</span>
              <select className="pd-input" aria-label="关联图纸" value={patternId} onChange={(event) => setPatternId(event.target.value)}>
                <option value="">不关联</option>
                {patterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="style-row">
              <button type="submit" className="pd-btn pd-btn-primary">
                保存
              </button>
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => setEditing(null)}>
                取消
              </button>
              {editing !== 'new' ? (
                <button type="button" className="pd-btn pd-btn-danger-text" onClick={() => void handleDelete()}>
                  删除
                </button>
              ) : null}
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  )
}
