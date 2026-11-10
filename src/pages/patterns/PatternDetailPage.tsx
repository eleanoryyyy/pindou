import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useFeedback } from '../../components/Feedback.tsx'
import { Dialog, Drawer } from '../../components/Overlay.tsx'
import { ConfirmDialog } from '../inventory/WarehouseForm.tsx'
import { ColorField } from '../inventory/ColorField.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { findColor } from '../../data/palettes.ts'
import { compareToStock, statusLabel, usageFromPattern, usageTotal } from '../../data/patternMath.ts'
import {
  completePattern,
  deletePattern,
  getPattern,
  getPatternGrid,
  getPatternImage,
  listPatternBuilds,
  recalcUsageFromGrid,
  renamePattern,
  rerecognizePattern,
  setPatternStatus,
  undoPatternBuild,
  updatePatternUsage,
} from '../../data/patternRepo.ts'
import { usageDiffersFromGrid } from '../../data/boardMath.ts'
import { messageOf } from '../../data/repo.ts'
import type { BrandId, Pattern, PatternBuild, PatternGrid, PatternStatus } from '../../data/types.ts'
import { useInventory } from '../../inventory/InventoryContext.tsx'
import { ComparePanel, ScopeSelect } from './ComparePanel.tsx'
import { ProgressPanel } from './ProgressPanel.tsx'
import { useBlobUrl } from './useBlobUrl.ts'

type DraftRow = { key: string; brand: BrandId; code: string; quantity: string }

function toDraft(pattern: Pattern): DraftRow[] {
  return pattern.usage.map((line) => ({
    key: line.id,
    brand: line.brand,
    code: line.code,
    quantity: String(line.quantity),
  }))
}

export function PatternDetailPage() {
  const { patternId = '' } = useParams()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const { ready, warehouses, allStock, allHolds, refresh } = useInventory()
  const [pattern, setPattern] = useState<Pattern | undefined>()
  const [image, setImage] = useState<Blob>()
  const [builds, setBuilds] = useState<PatternBuild[]>([])
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [cols, setCols] = useState('10')
  const [rows, setRows] = useState('10')
  const [scope, setScope] = useState('all')
  const [error, setError] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeWarehouse, setCompleteWarehouse] = useState('')
  const [undoId, setUndoId] = useState<string | null>(null)
  const [gridRecord, setGridRecord] = useState<PatternGrid | undefined>()
  const preview = useBlobUrl(image)

  async function reload() {
    const current = await getPattern(patternId)
    if (!current) {
      setMissing(true)
      setLoaded(true)
      return
    }
    setPattern(current)
    setDraft(toDraft(current))
    setCols(String(current.cols))
    setRows(String(current.rows))
    setImage(await getPatternImage(patternId))
    setBuilds(await listPatternBuilds(patternId))
    const record = await getPatternGrid(patternId)
    setGridRecord(record ? { cols: record.cols, rows: record.rows, cells: record.cells } : undefined)
    setLoaded(true)
    setError('')
  }

  useEffect(() => {
    void reload()
  }, [patternId])

  const scopeLabel = scope === 'all' ? '全部合计' : (warehouses.find((item) => item.id === scope)?.name ?? '豆仓')
  const result = useMemo(
    () => (pattern ? compareToStock(usageFromPattern(pattern), allStock, scope, { holds: allHolds, ignoreHoldPatternIds: [pattern.id] }) : null),
    [pattern, allStock, allHolds, scope],
  )
  const usageMismatch = Boolean(pattern && gridRecord && usageDiffersFromGrid(pattern.usage, gridRecord))

  async function handleRecalcUsage() {
    if (!pattern) return
    try {
      const next = await recalcUsageFromGrid(pattern.id)
      setPattern(next)
      setDraft(toDraft(next))
      toast('已按格子重算用量')
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }


  async function saveUsage() {
    if (!pattern) return
    try {
      const next = await updatePatternUsage(
        pattern.id,
        draft.map((row) => ({ brand: row.brand, code: row.code, quantity: Number(row.quantity) })),
      )
      setPattern(next)
      setDraft(toDraft(next))
      toast('用量已保存')
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function handleStatus(status: PatternStatus) {
    if (!pattern) return
    const next = await setPatternStatus(pattern.id, status)
    setPattern(next)
    toast(`状态已设为${statusLabel(status)}`)
    await refresh()
  }

  async function handleRerecognize() {
    if (!pattern) return
    try {
      const next = await rerecognizePattern(pattern.id, Number(cols), Number(rows))
      setPattern(next)
      setDraft(toDraft(next))
      toast('已按网格重新识别')
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function handleComplete(event: FormEvent) {
    event.preventDefault()
    if (!pattern) return
    try {
      await completePattern(pattern.id, completeWarehouse)
      toast('完工出库已写入流水')
      setCompleting(false)
      await reload()
      await refresh()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function handleUndo() {
    if (!undoId) return
    await undoPatternBuild(undoId)
    toast('已撤销这次完工出库，库存已回写')
    setUndoId(null)
    await reload()
    await refresh()
  }

  if (loaded && missing) return <Navigate to="/patterns" replace />
  if (!ready || !loaded || !pattern) return <p className="pd-muted">正在读取图纸…</p>

  return (
    <section>
      <header className="pd-pagehead">
        <div>
          <p className="pd-muted" style={{ margin: '0 0 4px' }}>
            <Link to="/patterns" className="pd-btn pd-btn-text" style={{ paddingLeft: 0 }}>
              返回图纸册
            </Link>
          </p>
          <h1 className="pd-title">{pattern.name}</h1>
        </div>
        <div className="pd-pagehead-actions">
          <button type="button" className="pd-btn pd-btn-text" onClick={() => { setRenameValue(pattern.name); setRenaming(true) }}>
            改名
          </button>
          <button type="button" className="pd-btn pd-btn-danger-text" onClick={() => setDeleting(true)}>
            删除
          </button>
          <button type="button" className="pd-btn pd-btn-secondary" onClick={() => navigate(`/patterns/${pattern.id}/studio`)}>
            进入制作
          </button>
          <button
            type="button"
            className="pd-btn pd-btn-primary"
            onClick={() => {
              setCompleteWarehouse(warehouses[0]?.id ?? '')
              setError('')
              setCompleting(true)
            }}
          >
            完工出库
          </button>
        </div>
      </header>

      <div className="pd-chips" style={{ marginBottom: 16 }}>
        {(['pending', 'in-progress', 'done'] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={pattern.status === item ? 'pd-chip is-on' : 'pd-chip'}
            onClick={() => void handleStatus(item)}
          >
            {statusLabel(item)}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="pattern-preview">
        <div>
          {preview ? <img src={preview} alt={pattern.name} /> : null}
          <div className="pattern-grid-controls">
            <label className="pd-field">
              <span>列</span>
              <input className="pd-input" value={cols} aria-label="网格列数" onChange={(event) => setCols(event.target.value)} />
            </label>
            <label className="pd-field">
              <span>行</span>
              <input className="pd-input" value={rows} aria-label="网格行数" onChange={(event) => setRows(event.target.value)} />
            </label>
            <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleRerecognize()}>
              重新识别
            </button>
          </div>
          <p className="pd-muted hint">当前网格 {pattern.cols}×{pattern.rows}，合计 {formatQty(usageTotal(pattern.usage))} 粒。识别不准时可改网格或在右侧改正。</p>
        </div>

        <div>
          <ProgressPanel pattern={pattern} onUpdated={() => void reload()} />
          <h2 className="pd-section-title">各色用量</h2>
          {draft.map((row, index) => {
            const color = findColor(row.brand, row.code)
            return (
              <div className="usage-editor-row" key={row.key}>
                <div className="pd-swatch" style={{ background: color?.hex ?? '#CCC' }} />
                <select
                  className="pd-input"
                  aria-label="品牌"
                  value={row.brand}
                  onChange={(event) =>
                    setDraft((rows) => rows.map((item, i) => (i === index ? { ...item, brand: event.target.value as BrandId } : item)))
                  }
                >
                  <option value="MARD">MARD</option>
                  <option value="COCO">COCO</option>
                </select>
                <ColorField
                  brand={row.brand}
                  value={row.code}
                  onChange={(code) => setDraft((rows) => rows.map((item, i) => (i === index ? { ...item, code } : item)))}
                />
                <input
                  className="pd-input"
                  inputMode="numeric"
                  aria-label={`${row.code || '色号'}用量`}
                  value={row.quantity}
                  onChange={(event) =>
                    setDraft((rows) => rows.map((item, i) => (i === index ? { ...item, quantity: event.target.value } : item)))
                  }
                />
                <button
                  type="button"
                  className="pd-btn pd-btn-text"
                  aria-label="删除此行"
                  onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                >
                  删除
                </button>
              </div>
            )
          })}
          <div className="style-row">
            <button
              type="button"
              className="pd-btn pd-btn-secondary"
              onClick={() => setDraft((rows) => [...rows, { key: `new-${rows.length}-${Date.now()}`, brand: 'MARD', code: '', quantity: '1' }])}
            >
              新增一行
            </button>
            <button type="button" className="pd-btn pd-btn-primary" onClick={() => void saveUsage()}>
              保存用量
            </button>
          </div>
          {usageMismatch ? (
            <div className="usage-mismatch-row">
              <p className="usage-mismatch">用量和格子不一致</p>
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleRecalcUsage()}>
                按格子重算用量
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="page-block">
        <div className="pd-pagehead">
          <h2 className="pd-section-title">消耗对比</h2>
          <ScopeSelect warehouses={warehouses} value={scope} onChange={setScope} />
        </div>
        {result ? <ComparePanel title={pattern.name} result={result} scopeLabel={scopeLabel} /> : null}
      </div>

      <div className="page-block">
        <h2 className="pd-section-title">制作记录</h2>
        <p className="pd-muted">同一张图可多次制作。已制作 {pattern.buildCount} 次。</p>
        {builds.length === 0 ? (
          <p className="pd-muted">还没有完工出库。</p>
        ) : (
          <table className="pd-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>豆仓</th>
                <th className="is-num">第几次</th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((build, index) => (
                <tr key={build.id}>
                  <td>{new Date(build.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</td>
                  <td>{warehouses.find((item) => item.id === build.warehouseId)?.name ?? '已删除的豆仓'}</td>
                  <td className="is-num">{builds.length - index}</td>
                  <td className="col-actions">
                    {index === 0 ? (
                      <button type="button" className="pd-btn pd-btn-text" onClick={() => setUndoId(build.id)}>
                        撤销出库
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {renaming ? (
        <Dialog title="改名图纸" onClose={() => setRenaming(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void (async () => {
                try {
                  const next = await renamePattern(pattern.id, renameValue)
                  setPattern(next)
                  setRenaming(false)
                  toast('已改名')
                } catch (err) {
                  setError(messageOf(err))
                }
              })()
            }}
          >
            <label className="pd-field">
              <span>名称</span>
              <input className="pd-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
            </label>
            <div className="pd-dialog-actions">
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => setRenaming(false)}>
                取消
              </button>
              <button type="submit" className="pd-btn pd-btn-primary">
                保存
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="删除图纸"
          message={`确定删除「${pattern.name}」吗？库存和已有流水不会被改动。`}
          confirmLabel="确认删除"
          danger
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await deletePattern(pattern.id)
            await refresh()
            toast('图纸已删除')
            navigate('/patterns')
          }}
        />
      ) : null}

      {completing ? (
        <Drawer title="完工出库" onClose={() => setCompleting(false)}>
          <p className="pd-muted">按当前用量从所选豆仓出库。库存不足时会拦截，不会出现无说明的负库存。同一张图可以多次制作。</p>
          <form onSubmit={(event) => void handleComplete(event)}>
            <label className="pd-field">
              <span>从哪个豆仓出库</span>
              <select
                className="pd-input"
                aria-label="出库豆仓"
                value={completeWarehouse}
                onChange={(event) => setCompleteWarehouse(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            {completeWarehouse ? (
              <p className={compareToStock(usageFromPattern(pattern), allStock, completeWarehouse, { holds: allHolds, ignoreHoldPatternIds: [pattern.id] }).ok ? 'pd-status-ok' : 'pd-status-danger'}>
                {compareToStock(usageFromPattern(pattern), allStock, completeWarehouse, { holds: allHolds, ignoreHoldPatternIds: [pattern.id] }).ok
                  ? '该豆仓够拼，确认后按用量出库。'
                  : compareToStock(usageFromPattern(pattern), allStock, completeWarehouse, { holds: allHolds, ignoreHoldPatternIds: [pattern.id] }).shortages
                      .map((line) => `${line.code} 缺 ${line.short}`)
                      .join('，') + '。无法出库。'}
              </p>
            ) : (
              <p className="form-error">请先建一个豆仓。</p>
            )}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="pd-dialog-actions">
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => setCompleting(false)}>
                取消
              </button>
              <button type="submit" className="pd-btn pd-btn-primary" disabled={!completeWarehouse}>
                确认出库
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {undoId ? (
        <ConfirmDialog
          title="撤销完工出库"
          message="将删除这次出库对应的流水并回写库存，制作次数减 1。若已没有制作记录，图纸会回到待拼。"
          confirmLabel="确认撤销"
          danger
          onCancel={() => setUndoId(null)}
          onConfirm={() => handleUndo()}
        />
      ) : null}
    </section>
  )
}
