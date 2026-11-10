import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFeedback } from '../components/Feedback.tsx'
import { DefaultPriceField } from '../components/PriceCell.tsx'
import { exportBackup, importBackup } from '../data/backup.ts'
import { loadPriceBook, setDefaultPrice } from '../data/priceRepo.ts'
import { getLastWarehouseId, messageOf } from '../data/repo.ts'
import { useInventory } from '../inventory/InventoryContext.tsx'
import { InProgressSection } from './settings/InProgressSection.tsx'
import { WorksSection } from './settings/WorksSection.tsx'

export function SettingsPage() {
  const { toast } = useFeedback()
  const { refresh, warehouses } = useInventory()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const [priceWarehouseId, setPriceWarehouseId] = useState('')
  const [defaultLi, setDefaultLi] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      const last = await getLastWarehouseId()
      const initial = warehouses.find((item) => item.id === last)?.id ?? warehouses[0]?.id ?? ''
      setPriceWarehouseId((current) => current || initial)
    })()
  }, [warehouses, tick])

  useEffect(() => {
    void (async () => {
      if (!priceWarehouseId) {
        setDefaultLi(null)
        return
      }
      const book = await loadPriceBook(priceWarehouseId)
      setDefaultLi(book.defaultLi)
    })()
  }, [priceWarehouseId, tick])

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
    if (!window.confirm('导入将替换当前浏览器里的全部本地数据（含库存、流水、图纸、进行中进度、暂扣、作品集和色号单价）。确定继续？')) {
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
        <h2 className="pd-section-title">补色计价</h2>
        <p className="pd-muted hint">默认单价按粒计算，存在当前豆仓下。每个色号可在补豆清单或开拼前检查里覆盖成自定价。</p>
        {warehouses.length === 0 ? (
          <p className="pd-muted">先建豆仓再设默认单价。</p>
        ) : !priceWarehouseId ? (
          <p className="pd-muted">正在读取豆仓…</p>
        ) : (
          <>
            {warehouses.length > 1 ? (
              <label className="pd-field" style={{ maxWidth: 280 }}>
                <span>豆仓</span>
                <select
                  className="pd-input"
                  aria-label="计价豆仓"
                  value={priceWarehouseId}
                  onChange={(event) => setPriceWarehouseId(event.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="pd-field" style={{ maxWidth: 280 }}>
              <span>默认单价</span>
              <DefaultPriceField
                warehouseId={priceWarehouseId}
                li={defaultLi}
                onCommit={(li) => {
                  if (!priceWarehouseId) return
                  void setDefaultPrice(priceWarehouseId, li).then(async () => {
                    setDefaultLi(li)
                    toast(li === null ? '已清空默认单价' : '已保存默认单价')
                  })
                }}
              />
            </label>
          </>
        )}
      </div>

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
        <p className="pd-muted hint">备份包含豆仓、库存、流水、图纸、进行中进度、暂扣、作品集和色号单价。导入前会请你确认。</p>
        <p className="pd-muted hint">版本 0.0.0 · 第 5 阶段 · 补色计价</p>
      </div>
    </section>
  )
}
