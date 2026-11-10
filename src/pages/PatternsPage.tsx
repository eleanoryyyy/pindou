import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState.tsx'
import { useFeedback } from '../components/Feedback.tsx'
import { messageOf } from '../data/repo.ts'
import { resolvePriceWarehouseId } from '../data/priceRepo.ts'
import { compareToStock, mergeUsage, nextPendingPattern, statusLabel, usageFromPattern } from '../data/patternMath.ts'
import { assertImageFile, getPatternThumb, listPatterns } from '../data/patternRepo.ts'
import type { Pattern, PatternStatus } from '../data/types.ts'
import { useInventory } from '../inventory/InventoryContext.tsx'
import { statusClass } from '../inventory/stockView.ts'
import { ComparePanel, ScopeSelect } from './patterns/ComparePanel.tsx'
import { UploadDrawer } from './patterns/UploadDrawer.tsx'
import { useBlobUrl } from './patterns/useBlobUrl.ts'

const STATUS_FILTERS: { id: PatternStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'pending', label: '待拼' },
  { id: 'in-progress', label: '进行中' },
  { id: 'done', label: '已完成' },
]

function PatternCard({
  pattern,
  resultLabel,
  selected,
  onToggle,
}: {
  pattern: Pattern
  resultLabel: string
  selected: boolean
  onToggle: () => void
}) {
  const [thumb, setThumb] = useState<Blob>()
  useEffect(() => {
    void getPatternThumb(pattern.id).then(setThumb)
  }, [pattern.id])
  const url = useBlobUrl(thumb)
  const statusKind = resultLabel === '够拼' ? 'ok' : resultLabel === '缺料' ? 'danger' : null

  return (
    <li className="pd-card pattern-card">
      <label className="pattern-card__check">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`选择 ${pattern.name}`} />
        选入对比
      </label>
      <Link to={`/patterns/${pattern.id}`}>
        {url ? <img className="pattern-card__thumb" src={url} alt="" /> : <div className="pattern-card__thumb" />}
      </Link>
      <Link to={`/patterns/${pattern.id}`} className="pattern-card__name">
        {pattern.name}
      </Link>
      <div className="pattern-card__meta">
        <span className="pd-muted">{statusLabel(pattern.status)}</span>
        <span className={statusClass(statusKind)}>{resultLabel}</span>
      </div>
    </li>
  )
}

export function PatternsPage() {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const { ready, warehouses, allStock, allHolds, refresh } = useInventory()
  const fileRef = useRef<HTMLInputElement>(null)
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<PatternStatus | 'all'>('all')
  const [scope, setScope] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  async function reload() {
    await refresh()
    setPatterns(await listPatterns())
    setLoaded(true)
  }

  useEffect(() => {
    void reload()
  }, [refresh])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return patterns.filter((item) => {
      if (status !== 'all' && item.status !== status) return false
      if (needle && !item.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [patterns, query, status])

  const scopeLabel = scope === 'all' ? '全部合计' : (warehouses.find((item) => item.id === scope)?.name ?? '豆仓')
  const priceWarehouseId = resolvePriceWarehouseId(scope, warehouses, warehouses[0]?.id)
  const priceWarehouseLabel = warehouses.find((item) => item.id === priceWarehouseId)?.name

  function cardResult(pattern: Pattern) {
    const result = compareToStock(usageFromPattern(pattern), allStock, scope, { holds: allHolds, ignoreHoldPatternIds: [pattern.id] })
    return result.lines.length === 0 ? '未统计' : result.label
  }

  const next = useMemo(() => nextPendingPattern(patterns), [patterns])
  const nextResult = next ? compareToStock(usageFromPattern(next), allStock, scope, { holds: allHolds, ignoreHoldPatternIds: [next.id] }) : null

  const selectedPatterns = patterns.filter((item) => selected.includes(item.id))
  const selectedResult =
    selectedPatterns.length > 0
      ? compareToStock(mergeUsage(selectedPatterns.map(usageFromPattern)), allStock, scope, { holds: allHolds, ignoreHoldPatternIds: selectedPatterns.map((item) => item.id) })
      : null

  function pickFile(file: File | undefined) {
    if (!file) return
    try {
      assertImageFile(file)
      setUploadFile(file)
    } catch (err) {
      toast(messageOf(err))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  if (!ready || !loaded) {
    return <p className="pd-muted">正在读取图纸册…</p>
  }

  return (
    <section>
      <header className="pd-pagehead">
        <h1 className="pd-title">图纸</h1>
        <div className="pd-pagehead-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            hidden
            aria-label="选择图纸文件"
            onChange={(event) => pickFile(event.target.files?.[0])}
          />
          <button type="button" className="pd-btn pd-btn-primary" onClick={() => fileRef.current?.click()}>
            上传图纸
          </button>
        </div>
      </header>

      {patterns.length === 0 ? (
        <EmptyState
          mark="图"
          description="还没有图纸。上传一张 JPG 或 PNG 即可。"
          actionLabel="上传图纸"
          onAction={() => fileRef.current?.click()}
        />
      ) : (
        <>
          <div className="pd-toolbar">
            <input
              className="pd-input"
              value={query}
              placeholder="搜索图纸"
              aria-label="搜索图纸"
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="pd-chips">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={status === item.id ? 'pd-chip is-on' : 'pd-chip'}
                  onClick={() => setStatus(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <ScopeSelect warehouses={warehouses} value={scope} onChange={setScope} />
          </div>

          {next && nextResult ? (
            <div className="pd-card pattern-next">
              <p style={{ margin: 0 }}>
                下一张待拼（按创建时间最早）：
                <Link to={`/patterns/${next.id}`}> {next.name}</Link>
                <span className={statusClass(nextResult.ok ? 'ok' : 'danger')}> {nextResult.label}</span>
                {nextResult.ok
                  ? '，对照当前范围够拼。'
                  : `，缺 ${nextResult.shortages.map((line) => `${line.code} ${line.short}`).join('、')}。`}
              </p>
              <p className="pd-muted" style={{ margin: '4px 0 0' }}>
                预览结果与单独对比这张图一致。
              </p>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <p className="pd-muted">没有符合条件的图纸。</p>
          ) : (
            <ul className="pattern-grid">
              {visible.map((pattern) => (
                <PatternCard
                  key={pattern.id}
                  pattern={pattern}
                  resultLabel={cardResult(pattern)}
                  selected={selected.includes(pattern.id)}
                  onToggle={() =>
                    setSelected((current) =>
                      current.includes(pattern.id) ? current.filter((id) => id !== pattern.id) : [...current, pattern.id],
                    )
                  }
                />
              ))}
            </ul>
          )}

          {selectedResult ? (
            <div className="page-block">
              <h2 className="pd-section-title">已选 {selectedPatterns.length} 张图的消耗对比</h2>
              <ComparePanel title="多图对比" result={selectedResult} scopeLabel={scopeLabel} priceWarehouseId={priceWarehouseId} priceWarehouseLabel={priceWarehouseLabel} />
            </div>
          ) : (
            <p className="pd-muted hint">勾选一张或多张图纸，可在下方对比指定豆仓或全部合计。</p>
          )}
        </>
      )}

      {uploadFile ? (
        <UploadDrawer
          file={uploadFile}
          onClose={() => setUploadFile(null)}
          onCreated={(pattern) => {
            setUploadFile(null)
            toast('图纸已保存')
            navigate(`/patterns/${pattern.id}`)
          }}
        />
      ) : null}
    </section>
  )
}
