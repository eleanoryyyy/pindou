import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Drawer } from '../../components/Overlay.tsx'
import { messageOf } from '../../data/repo.ts'
import { createPatternFromFile } from '../../data/patternRepo.ts'
import {
  compareLegend,
  detectGridRegion,
  detectLegendRegion,
  parseLegendText,
  rasterFromBlob,
  recognizeUsage,
  type GridBox,
  type LegendCompareRow,
  type RecognizeOptions,
  type RecognizeResult,
} from '../../data/recognizePattern.ts'
import { usageTotal } from '../../data/patternMath.ts'
import { findColor } from '../../data/palettes.ts'
import type { BrandId, Pattern } from '../../data/types.ts'
import { useBlobUrl } from './useBlobUrl.ts'

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]
type BoxMode = 'grid' | 'legend'

function clampBox(box: GridBox, width: number, height: number): GridBox {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.round(box.width))),
    height: Math.max(1, Math.min(height - y, Math.round(box.height))),
  }
}

function applyHandle(start: GridBox, handle: Handle | 'move' | 'draw', dx: number, dy: number, from: GridBox): GridBox {
  if (handle === 'move') return { ...start, x: start.x + dx, y: start.y + dy }
  if (handle === 'draw') {
    const x = Math.min(from.x, from.x + dx)
    const y = Math.min(from.y, from.y + dy)
    return { x, y, width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) }
  }
  let { x, y, width, height } = start
  if (handle.includes('w')) {
    const nextX = x + dx
    width = width - (nextX - x)
    x = nextX
  }
  if (handle.includes('e')) width += dx
  if (handle.includes('n')) {
    const nextY = y + dy
    height = height - (nextY - y)
    y = nextY
  }
  if (handle.includes('s')) height += dy
  if (width < 1) {
    x += width - 1
    width = 1
  }
  if (height < 1) {
    y += height - 1
    height = 1
  }
  return { x, y, width, height }
}

function RegionBox({
  box,
  scaleX,
  scaleY,
  variant,
  onPointerDown,
}: {
  box: GridBox
  scaleX: number
  scaleY: number
  variant: BoxMode
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, handle: Handle | 'move', variant: BoxMode) => void
}) {
  return (
    <div
      className={variant === 'legend' ? 'recognize-box recognize-box--legend' : 'recognize-box'}
      style={{
        left: box.x * scaleX,
        top: box.y * scaleY,
        width: box.width * scaleX,
        height: box.height * scaleY,
      }}
      onPointerDown={(event) => onPointerDown(event, 'move', variant)}
    >
      {HANDLES.map((handle) => (
        <span
          key={handle}
          className="recognize-handle"
          data-handle={handle}
          onPointerDown={(event) => onPointerDown(event, handle, variant)}
        />
      ))}
    </div>
  )
}

export function UploadDrawer({
  file,
  onClose,
  onCreated,
}: {
  file: File
  onClose: () => void
  onCreated: (pattern: Pattern) => void
}) {
  const [name, setName] = useState(file.name.replace(/\.(png|jpe?g)$/i, ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('正在定位网格…')
  const [brand, setBrand] = useState<BrandId>('MARD')
  const [blankWhite, setBlankWhite] = useState(true)
  const [cols, setCols] = useState(0)
  const [rows, setRows] = useState(0)
  const [gridBox, setGridBox] = useState<GridBox | null>(null)
  const [legendBox, setLegendBox] = useState<GridBox | null>(null)
  const [legendText, setLegendText] = useState('')
  const [comparison, setComparison] = useState<LegendCompareRow[]>([])
  const [boxMode, setBoxMode] = useState<BoxMode>('grid')
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [display, setDisplay] = useState({ width: 0, height: 0 })
  const preview = useBlobUrl(file)
  const rasterRef = useRef<Awaited<ReturnType<typeof rasterFromBlob>> | null>(null)
  const nameRef = useRef(name)
  const brandRef = useRef(brand)
  const blankWhiteRef = useRef(blankWhite)
  const colsRef = useRef(cols)
  const rowsRef = useRef(rows)
  const gridBoxRef = useRef(gridBox)
  const legendTextRef = useRef(legendText)
  nameRef.current = name
  brandRef.current = brand
  blankWhiteRef.current = blankWhite
  colsRef.current = cols
  rowsRef.current = rows
  gridBoxRef.current = gridBox
  legendTextRef.current = legendText
  const imgRef = useRef<HTMLImageElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    mode: BoxMode
    handle: Handle | 'move' | 'draw'
    start: GridBox
    origin: { x: number; y: number }
  } | null>(null)

  function currentOptions(): RecognizeOptions {
    const legend = parseLegendText(legendTextRef.current)
    const box = gridBoxRef.current
    const nextCols = colsRef.current
    const nextRows = rowsRef.current
    return {
      preferBrand: brandRef.current,
      cols: nextCols > 0 ? nextCols : undefined,
      rows: nextRows > 0 ? nextRows : undefined,
      region: box ?? undefined,
      blankWhite: blankWhiteRef.current,
      legendCodes: legend.length ? legend.map((line) => line.code) : undefined,
    }
  }

  function formatSummary(recognized: RecognizeResult) {
    const empty = recognized.emptyCount ? ` · 空格 ${recognized.emptyCount}` : ''
    return `${recognized.cols}×${recognized.rows} 格 · ${usageTotal(recognized.usage)} 粒${empty}`
  }

  function applyResult(recognized: RecognizeResult) {
    setCols(recognized.cols)
    setRows(recognized.rows)
    setSummary(formatSummary(recognized))
    const legend = parseLegendText(legendTextRef.current)
    setComparison(legend.length ? compareLegend(legend, recognized.usage) : [])
  }

  async function runRecognize(next?: RecognizeOptions) {
    const raster = rasterRef.current
    if (!raster) return
    const recognized = recognizeUsage(raster, next ?? currentOptions())
    applyResult(recognized)
    return recognized
  }

  function measureImage() {
    const image = imgRef.current
    if (!image) return
    setNatural({ width: image.naturalWidth, height: image.naturalHeight })
    setDisplay({ width: image.clientWidth, height: image.clientHeight })
  }

  useEffect(() => {
    const image = imgRef.current
    if (!image) return
    const observer = new ResizeObserver(() => measureImage())
    observer.observe(image)
    return () => observer.disconnect()
  }, [preview])

  useEffect(() => {
    void (async () => {
      try {
        const raster = await rasterFromBlob(file)
        rasterRef.current = raster
        const detected = detectGridRegion(raster)
        const legend = detectLegendRegion(raster, detected)
        if (detected) {
          setGridBox({ x: detected.x, y: detected.y, width: detected.width, height: detected.height })
          setCols(detected.cols)
          setRows(detected.rows)
        }
        if (legend) setLegendBox(legend)
        const recognized = recognizeUsage(raster, {
          preferBrand: 'MARD',
          cols: detected?.cols,
          rows: detected?.rows,
          region: detected ? { x: detected.x, y: detected.y, width: detected.width, height: detected.height } : undefined,
          blankWhite: Boolean(detected) && blankWhite,
        })
        if (!detected) {
          setCols(recognized.cols)
          setRows(recognized.rows)
        }
        applyResult(recognized)
      } catch {
        setSummary('图片已选中，保存后可再识别和改正用量。')
      }
    })()
    // 初次按默认开关识别一次即可，用户改开关后再点「识别」。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  function toImagePoint(event: { clientX: number; clientY: number }) {
    const image = imgRef.current
    if (!image || !image.clientWidth || !image.clientHeight) return { x: 0, y: 0 }
    const rect = image.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / image.clientWidth) * image.naturalWidth
    const y = ((event.clientY - rect.top) / image.clientHeight) * image.naturalHeight
    return { x, y }
  }

  function beginDrag(mode: BoxMode, handle: Handle | 'move' | 'draw', start: GridBox, origin: { x: number; y: number }) {
    dragRef.current = { mode, handle, start, origin }
    const move = (event: PointerEvent) => {
      const drag = dragRef.current
      const raster = rasterRef.current
      if (!drag || !raster) return
      const point = toImagePoint(event)
      const next = clampBox(
        applyHandle(drag.start, drag.handle, point.x - drag.origin.x, point.y - drag.origin.y, drag.start),
        raster.width,
        raster.height,
      )
      if (drag.mode === 'legend') setLegendBox(next)
      else setGridBox(next)
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  function onOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const raster = rasterRef.current
    if (!raster) return
    const point = toImagePoint(event)
    beginDrag(boxMode, 'draw', { x: point.x, y: point.y, width: 1, height: 1 }, point)
  }

  function onBoxPointerDown(event: ReactPointerEvent<HTMLElement>, handle: Handle | 'move', variant: BoxMode) {
    event.stopPropagation()
    const current = variant === 'legend' ? legendBox : gridBox
    if (!current) return
    beginDrag(variant, handle, current, toImagePoint(event))
  }

  function autoLocate() {
    const raster = rasterRef.current
    if (!raster) return
    const detected = detectGridRegion(raster)
    if (!detected) {
      setError('没有找到稳定的网格线，请手动框选格子区域。')
      return
    }
    setError('')
    setGridBox({ x: detected.x, y: detected.y, width: detected.width, height: detected.height })
    setCols(detected.cols)
    setRows(detected.rows)
    const legend = detectLegendRegion(raster, detected)
    if (legend) setLegendBox(legend)
    void runRecognize({
      preferBrand: brand,
      cols: detected.cols,
      rows: detected.rows,
      region: { x: detected.x, y: detected.y, width: detected.width, height: detected.height },
      blankWhite,
      legendCodes: parseLegendText(legendText).map((line) => line.code),
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await createPatternFromFile(file, nameRef.current, brandRef.current, currentOptions())
      onCreated(created)
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  const scaleX = natural.width && display.width ? display.width / natural.width : 1
  const scaleY = natural.height && display.height ? display.height / natural.height : 1

  return (
    <Drawer title="上传图纸" onClose={onClose} className="pd-drawer--recognize">
      <div className="recognize-layout">
        <div className="recognize-preview">
          <div className="recognize-box-mode">
            <button
              type="button"
              className={boxMode === 'grid' ? 'pd-btn pd-btn-primary' : 'pd-btn pd-btn-secondary'}
              onClick={() => setBoxMode('grid')}
            >
              框选网格
            </button>
            <button
              type="button"
              className={boxMode === 'legend' ? 'pd-btn pd-btn-primary' : 'pd-btn pd-btn-secondary'}
              onClick={() => setBoxMode('legend')}
            >
              框选图例
            </button>
          </div>
          {preview ? (
            <div className="recognize-stage" ref={stageRef}>
              <img ref={imgRef} src={preview} alt="待识别图纸" onLoad={measureImage} />
              <div className="recognize-overlay" onPointerDown={onOverlayPointerDown}>
                {gridBox ? (
                  <RegionBox box={gridBox} scaleX={scaleX} scaleY={scaleY} variant="grid" onPointerDown={onBoxPointerDown} />
                ) : null}
                {legendBox ? (
                  <RegionBox box={legendBox} scaleX={scaleX} scaleY={scaleY} variant="legend" onPointerDown={onBoxPointerDown} />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="recognize-side">
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label className="pd-field">
              <span>名称</span>
              <input className="pd-input" value={name} onChange={(event) => { nameRef.current = event.target.value; setName(event.target.value) }} autoFocus />
            </label>
            <div className="recognize-grid-fields">
              <label className="pd-field">
                <span>列</span>
                <input
                  className="pd-input"
                  type="number"
                  min={1}
                  aria-label="网格列"
                  value={cols || ''}
                  onChange={(event) => setCols(Number(event.target.value) || 0)}
                />
              </label>
              <label className="pd-field">
                <span>行</span>
                <input
                  className="pd-input"
                  type="number"
                  min={1}
                  aria-label="网格行"
                  value={rows || ''}
                  onChange={(event) => setRows(Number(event.target.value) || 0)}
                />
              </label>
            </div>
            <label className="pd-field">
              <span>品牌</span>
              <select className="pd-input" aria-label="识别品牌" value={brand} onChange={(event) => setBrand(event.target.value as BrandId)}>
                <option value="MARD">MARD</option>
                <option value="COCO">COCO</option>
              </select>
            </label>
            <label className="pd-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={blankWhite}
                onChange={(event) => setBlankWhite(event.target.checked)}
                aria-label="白底算空格"
              />
              <span>白底算空格</span>
            </label>
            <p className="pd-muted recognize-note">
              打开时，均匀的近白格当空格，不计数也不生成豆子。H2 靠格内文字和底色的反差区分。
            </p>
            <details className="recognize-tune">
              <summary>手动微调</summary>
              <div className="recognize-box-fields">
              <label className="pd-field">
                <span>左</span>
                <input
                  className="pd-input"
                  type="number"
                  aria-label="网格左"
                  value={gridBox?.x ?? ''}
                  onChange={(event) =>
                    setGridBox((current) =>
                      current ? { ...current, x: Number(event.target.value) || 0 } : { x: Number(event.target.value) || 0, y: 0, width: 1, height: 1 },
                    )
                  }
                />
              </label>
              <label className="pd-field">
                <span>上</span>
                <input
                  className="pd-input"
                  type="number"
                  aria-label="网格上"
                  value={gridBox?.y ?? ''}
                  onChange={(event) =>
                    setGridBox((current) =>
                      current ? { ...current, y: Number(event.target.value) || 0 } : { x: 0, y: Number(event.target.value) || 0, width: 1, height: 1 },
                    )
                  }
                />
              </label>
              <label className="pd-field">
                <span>宽</span>
                <input
                  className="pd-input"
                  type="number"
                  aria-label="网格宽"
                  value={gridBox?.width ?? ''}
                  onChange={(event) =>
                    setGridBox((current) =>
                      current ? { ...current, width: Number(event.target.value) || 1 } : { x: 0, y: 0, width: Number(event.target.value) || 1, height: 1 },
                    )
                  }
                />
              </label>
              <label className="pd-field">
                <span>高</span>
                <input
                  className="pd-input"
                  type="number"
                  aria-label="网格高"
                  value={gridBox?.height ?? ''}
                  onChange={(event) =>
                    setGridBox((current) =>
                      current ? { ...current, height: Number(event.target.value) || 1 } : { x: 0, y: 0, width: 1, height: Number(event.target.value) || 1 },
                    )
                  }
                />
              </label>
              </div>
            </details>
            <button type="button" className="pd-btn pd-btn-text recognize-locate" onClick={autoLocate}>
              自动定位
            </button>
            <label className="pd-field">
              <span>
                图例校对
                <span className="recognize-optional">可选</span>
              </span>
              <textarea
                className="pd-input"
                rows={4}
                aria-label="图例校对"
                placeholder="A16 11、H7 140"
                value={legendText}
                onChange={(event) => {
                  legendTextRef.current = event.target.value
                  setLegendText(event.target.value)
                }}
              />
            </label>
            <p className="pd-muted recognize-note">
              用顿号、逗号或换行分隔，例如每行一个「A16 11」。有图例时只在这些色号里匹配。
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void runRecognize()}>
                识别
              </button>
            </div>
            {summary ? <p className="recognize-summary">{summary}</p> : null}
            {comparison.length ? (
              <table className="recognize-legend-table" aria-label="图例对照">
                <thead>
                  <tr>
                    <th>色号</th>
                    <th className="is-num">图例</th>
                    <th className="is-num">识别</th>
                    <th className="is-num">差额</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => {
                    const color = findColor(brand, row.code)
                    const diffClass = row.delta === 0 ? 'is-diff-ok' : row.delta === null ? '' : 'is-diff-bad'
                    return (
                      <tr key={row.code}>
                        <td>
                          {color ? (
                            <span className="pd-swatch" style={{ background: color.hex, marginRight: 6 }} aria-hidden />
                          ) : null}
                          {row.code}
                        </td>
                        <td className="is-num">{row.legend ?? '—'}</td>
                        <td className="is-num">{row.recognized}</td>
                        <td className={`is-num ${diffClass}`}>{row.delta === null ? '—' : row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="pd-dialog-actions">
              <button type="button" className="pd-btn pd-btn-secondary" onClick={onClose} disabled={busy}>
                取消
              </button>
              <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
                保存
              </button>
            </div>
          </form>
        </div>
      </div>
    </Drawer>
  )
}
