import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFeedback } from '../components/Feedback.tsx'
import { exportBackup, importBackup } from '../data/backup.ts'
import { messageOf } from '../data/repo.ts'
import { useInventory } from '../inventory/InventoryContext.tsx'
import { InProgressSection } from './settings/InProgressSection.tsx'
import { WorksSection } from './settings/WorksSection.tsx'

export function SettingsPage() {
  const { toast } = useFeedback()
  const { refresh } = useInventory()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  async function handleExport() {
    const json = await exportBackup()
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `拼豆系统备份-${stamp}.json`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('已导出备份')
  }

  async function handleImport(file: File | undefined) {
    if (!file) return
    if (!window.confirm('导入将替换当前浏览器里的全部本地数据（含库存、流水、图纸、进行中进度、暂扣和作品集）。确定继续？')) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    try {
      const text = await file.text()
      await importBackup(text)
      await refresh()
      setTick((value) => value + 1)
      toast('备份已导入')
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <section>
      <header className="pd-pagehead">
        <h1 className="pd-title">设置</h1>
      </header>
      <p className="pd-muted">
        个人豆仓，本地优先。数据保存在本机浏览器，无需登录，也不做云同步。
      </p>

      <InProgressSection tick={tick} />
      <WorksSection tick={tick} />

      <div className="page-block settings-list">
        <h2 className="pd-section-title">数据与外观</h2>
        <div className="style-row">
          <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleExport()}>
            导出备份
          </button>
          <button type="button" className="pd-btn pd-btn-secondary" onClick={() => fileRef.current?.click()}>
            导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="选择备份文件"
            onChange={(event) => void handleImport(event.target.files?.[0])}
          />
          <Link to="/style" className="pd-btn pd-btn-text">
            样式示例
          </Link>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="pd-muted hint">备份包含豆仓、库存、流水、图纸、进行中进度、暂扣和作品集。导入前会请你确认。</p>
        <p className="pd-muted hint">版本 0.0.0 · 第 4 阶段 · 进行中、作品集与干净导出</p>
      </div>
    </section>
  )
}
