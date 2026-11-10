import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useFeedback } from '../../components/Feedback.tsx'
import {
  applyDisplayMirrors,
  cellAt,
  cellsWithCode,
  countsFromGrid,
  skuKey,
  usageDiffersFromGrid,
} from '../../data/boardMath.ts'
import { AXIS_MARGIN, CLEAN_EXPORT_OPTIONS, downloadBlob, drawAxes, drawGrid, gridToPngBlob } from '../../data/renderGrid.ts'
import { findColor } from '../../data/palettes.ts'
import { formatQty } from '../../data/inventoryMath.ts'
import {
  createPatternFromGrid,
  ensurePatternGrid,
  getPattern,
  getPatternImage,
  setCompletedColors,
} from '../../data/patternRepo.ts'
import { messageOf } from '../../data/repo.ts'
import type { Pattern, PatternGrid, PatternGridRecord } from '../../data/types.ts'
import { ProgressPanel } from './ProgressPanel.tsx'
import { useFocusMode } from '../../layout/AppShell.tsx'

const CELL = 16
const MAX_SCALE = 8

export type StudioDebug = {
  highlightKey: string | null
  highlightCount: number
  highlightCells: { col: number; row: number }[]
  cellPx: number
  axisMargin: number
  zoom: number
  minZoom: number
  maxZoom: number
  panX: number
  panY: number
  showGrid: boolean
  focus: boolean
  completed: string[]
  cols: number
  rows: number
  usage: Record<string, number>
  firstRowH7Cols: number[]
  lastRowH7Cols: number[]
  h7Layout: 'diagonal' | 'anti-diagonal' | 'other'
  flipH: boolean
  flipV: boolean
  storedFirstRowH7Cols: number[]
  storedH7Layout: 'diagonal' | 'anti-diagonal' | 'other'
  mismatch: boolean
  storedImageHash?: number
  getStoredImageHash: () => Promise<number | undefined>
  hitTest: (clientX: number, clientY: number) => { col: number; row: number; code: string } | null
  cellAt: (col: number, row: number) => { brand: string; code: string } | null
}

declare global {
  interface Window {
    __pindouStudio?: StudioDebug
  }
}

function h7LayoutOf(grid: PatternGrid): StudioDebug['h7Layout'] {
  const cells = cellsWithCode(grid, 'H7')
  if (cells.length === 0) return 'other'
  if (cells.filter((cell) => cell.col === cell.row).length >= Math.min(grid.cols, grid.rows)) return 'diagonal'
  if (cells.filter((cell) => cell.col + cell.row === grid.cols - 1).length >= Math.min(grid.cols, grid.rows)) {
    return 'anti-diagonal'
  }
  return 'other'
}

function h7ColsOnRow(grid: PatternGrid, row: number): number[] {
  return cellsWithCode(grid, 'H7')
    .filter((cell) => cell.row === row)
    .map((cell) => cell.col)
    .sort((a, b) => a - b)
}

async function hashBlob(blob: Blob): Promise<number> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let hash = 2166136261
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619)
  return hash >>> 0
}

export function StudioPage() {
  const { patternId = '' } = useParams()
  const { toast } = useFeedback()
  const { focus, setFocus } = useFocusMode()
  const [pattern, setPattern] = useState<Pattern>()
  const [record, setRecord] = useState<PatternGridRecord>()
  const [missing, setMissing] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [showCodes, setShowCodes] = useState(false)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const [imageHash, setImageHash] = useState<number>()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spaceRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [view, setView] = useState({ w: 0, h: 0 })

  const sourceGrid: PatternGrid | undefined = useMemo(
    () => (record ? { cols: record.cols, rows: record.rows, cells: record.cells } : undefined),
    [record],
  )
  const grid = useMemo(
    () => (sourceGrid ? applyDisplayMirrors(sourceGrid, flipH, flipV) : undefined),
    [sourceGrid, flipH, flipV],
  )

  const usage = useMemo(() => (grid ? countsFromGrid(grid) : {}), [grid])
  const usageLines = useMemo(() => {
    if (!grid) return []
    const map = new Map<string, { key: string; brand: string; code: string; quantity: number }>()
    for (const cell of grid.cells) {
      if (!cell.code) continue
      const key = skuKey(cell.brand, cell.code)
      const current = map.get(key)
      if (current) current.quantity += 1
      else map.set(key, { key, brand: cell.brand, code: cell.code, quantity: 1 })
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, 'en', { numeric: true }))
  }, [grid])

  const completed = record?.completed ?? []
  const mismatch = Boolean(pattern && sourceGrid && usageDiffersFromGrid(pattern.usage, sourceGrid))

  const stateRef = useRef({
    scale: 1,
    pan: { x: 0, y: 0 },
    highlight,
    showGrid,
    showCodes,
    grid,
    focus,
    flipH,
    flipV,
  })

  async function reload() {
    try {
      const current = await getPattern(patternId)
      if (!current) {
        setMissing(true)
        return
      }
      const next = await ensurePatternGrid(patternId)
      setPattern(current)
      setRecord(next)
      const image = await getPatternImage(patternId)
      if (image) setImageHash(await hashBlob(image))
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    void reload()
  }, [patternId])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const canvas = canvasRef.current
      const width = canvas?.clientWidth || wrap.clientWidth
      const height = canvas?.clientHeight || wrap.clientHeight
      setView({ w: width, h: height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [record, focus])

  const applyFit = useCallback(() => {
    if (!grid) return
    const canvasBox = canvasRef.current
    const viewW = canvasBox?.clientWidth || view.w
    const viewH = canvasBox?.clientHeight || view.h
    if (viewW < 40 || viewH < 40) return
    const next = Math.min((viewW - AXIS_MARGIN * 2) / (grid.cols * CELL), (viewH - AXIS_MARGIN * 2) / (grid.rows * CELL)) * 0.96
    const minScale = Math.max(0.1, Math.min(next, 0.25))
    const clamped = Math.min(MAX_SCALE, Math.max(minScale, next))
    const gw = grid.cols * CELL * clamped + AXIS_MARGIN * 2
    const gh = grid.rows * CELL * clamped + AXIS_MARGIN * 2
    setScale(clamped)
    setPan({ x: (viewW - gw) / 2, y: (viewH - gh) / 2 })
  }, [grid])

  const minScale = useMemo(() => {
    if (!grid || view.w < 40 || view.h < 40) return 0.25
    const fit = Math.min((view.w - AXIS_MARGIN * 2) / (grid.cols * CELL), (view.h - AXIS_MARGIN * 2) / (grid.rows * CELL)) * 0.96
    return Math.max(0.1, Math.min(fit, 0.25))
  }, [grid, view])

  const fittedRef = useRef(false)
  useEffect(() => {
    if (!grid || view.w < 40 || fittedRef.current) return
    applyFit()
    fittedRef.current = true
  }, [grid, view, applyFit])

  useEffect(() => {
    if (!grid) return
    let cancelled = false
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) applyFit()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [focus, grid, applyFit])

  stateRef.current = { scale, pan, highlight, showGrid, showCodes, grid, focus, flipH, flipV }

  function clampPan(nextScale: number, nextPan: { x: number; y: number }, viewW = view.w, viewH = view.h) {
    if (!grid) return nextPan
    const gw = grid.cols * CELL * nextScale + AXIS_MARGIN * 2
    const gh = grid.rows * CELL * nextScale + AXIS_MARGIN * 2
    const margin = 48
    const minX = Math.min(margin, viewW - margin) - gw
    const maxX = Math.max(margin, viewW - margin)
    const minY = Math.min(margin, viewH - margin) - gh
    const maxY = Math.max(margin, viewH - margin)
    return {
      x: Math.min(maxX, Math.max(minX, nextPan.x)),
      y: Math.min(maxY, Math.max(minY, nextPan.y)),
    }
  }

  function changeScale(next: number, around?: { x: number; y: number }) {
    const current = stateRef.current
    const clamped = Math.min(MAX_SCALE, Math.max(minScale, next))
    const origin = around ?? { x: view.w / 2, y: view.h / 2 }
    const ratio = clamped / current.scale
    const panNext = clampPan(clamped, {
      x: origin.x - (origin.x - current.pan.x) * ratio,
      y: origin.y - (origin.y - current.pan.y) * ratio,
    })
    setScale(clamped)
    setPan(panNext)
  }

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const current = stateRef.current
    const recGrid = current.grid
    if (!canvas || !recGrid) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (cssW < 2 || cssH < 2) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.fillStyle = '#FAF7F5'
    ctx.fillRect(0, 0, cssW, cssH)
    ctx.save()
    ctx.translate(current.pan.x, current.pan.y)
    ctx.scale(current.scale, current.scale)
    ctx.imageSmoothingEnabled = false
    const origin = AXIS_MARGIN / current.scale
    drawGrid(ctx, recGrid, origin, origin, CELL, {
      highlight: current.highlight,
      completed,
      showGrid: current.showGrid,
      showCodes: current.showCodes,
      lineWidthScale: 1 / current.scale,
    })
    ctx.restore()
    ctx.save()
    ctx.translate(current.pan.x, current.pan.y)
    drawAxes(ctx, recGrid.cols, recGrid.rows, AXIS_MARGIN, AXIS_MARGIN, CELL * current.scale)
    ctx.restore()
  }, [completed])

  useEffect(() => {
    paint()
  }, [paint, scale, pan, highlight, showGrid, showCodes, grid, view, focus, flipH, flipV, completed])

  function clientToCell(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    const recGrid = stateRef.current.grid
    if (!canvas || !recGrid) return null
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - stateRef.current.pan.x - AXIS_MARGIN) / stateRef.current.scale
    const y = (clientY - rect.top - stateRef.current.pan.y - AXIS_MARGIN) / stateRef.current.scale
    const col = Math.floor(x / CELL)
    const row = Math.floor(y / CELL)
    if (col < 0 || row < 0 || col >= recGrid.cols || row >= recGrid.rows) return null
    const cell = cellAt(recGrid, col, row)
    return { col, row, brand: cell.brand, code: cell.code }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const current = stateRef.current
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      changeScale(current.scale * factor, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [record, view, minScale])

  useEffect(() => {
    if (!grid || !record || !sourceGrid) {
      delete window.__pindouStudio
      return
    }
    const key = highlight
    const cells = key
      ? grid.cells
          .map((cell, index) => ({ cell, col: index % grid.cols, row: Math.floor(index / grid.cols) }))
          .filter((item) => skuKey(item.cell.brand, item.cell.code) === key && !completed.includes(key))
          .map((item) => ({ col: item.col, row: item.row }))
      : []
    window.__pindouStudio = {
      highlightKey: highlight,
      highlightCount: cells.length,
      highlightCells: cells,
      cellPx: CELL,
      axisMargin: AXIS_MARGIN,
      zoom: scale,
      minZoom: minScale,
      maxZoom: MAX_SCALE,
      panX: pan.x,
      panY: pan.y,
      showGrid,
      focus,
      completed: [...completed],
      cols: grid.cols,
      rows: grid.rows,
      usage,
      firstRowH7Cols: h7ColsOnRow(grid, 0),
      lastRowH7Cols: h7ColsOnRow(grid, grid.rows - 1),
      h7Layout: h7LayoutOf(grid),
      flipH,
      flipV,
      storedFirstRowH7Cols: h7ColsOnRow(sourceGrid, 0),
      storedH7Layout: h7LayoutOf(sourceGrid),
      mismatch,
      storedImageHash: imageHash,
      getStoredImageHash: async () => {
        const blob = await getPatternImage(record.id)
        return blob ? hashBlob(blob) : undefined
      },
      hitTest: (clientX, clientY) => {
        const hit = clientToCell(clientX, clientY)
        return hit ? { col: hit.col, row: hit.row, code: hit.code } : null
      },
      cellAt: (col, row) => {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null
        return cellAt(grid, col, row)
      },
    }
    return () => {
      delete window.__pindouStudio
    }
  }, [grid, sourceGrid, record, highlight, scale, pan, showGrid, focus, completed, minScale, usage, flipH, flipV, mismatch, imageHash])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          event.preventDefault()
          spaceRef.current = true
        }
      }
      if (event.key === 'Escape' && stateRef.current.focus) {
        setFocus(false)
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [setFocus])

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    if (!spaceRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag) return
    setPan(clampPan(scale, { x: drag.panX + (event.clientX - drag.x), y: drag.panY + (event.clientY - drag.y) }))
  }

  function onPointerUp() {
    dragRef.current = null
  }

  async function toggleCompleted(key: string, checked: boolean) {
    if (!record) return
    const next = checked ? [...record.completed, key] : record.completed.filter((item) => item !== key)
    const optimistic = { ...record, completed: [...new Set(next)] }
    setRecord(optimistic)
    try {
      const saved = await setCompletedColors(record.id, optimistic.completed)
      setRecord(saved)
    } catch (err) {
      setRecord(record)
      setError(messageOf(err))
    }
  }

  async function handleExport() {
    if (!grid || !pattern) return
    const blob = await gridToPngBlob(grid, CLEAN_EXPORT_OPTIONS)
    downloadBlob(blob, `${pattern.name}.png`)
    toast('已导出 PNG')
  }

  async function handleSaveMirrored() {
    if (!grid || !pattern || (!flipH && !flipV)) return
    const suffix = flipH && flipV ? '水平镜像、垂直镜像' : flipH ? '水平镜像' : '垂直镜像'
    const name = `${pattern.name}（${suffix}）`
    try {
      const saved = await createPatternFromGrid(name, grid, {
        fileName: `${name}.png`,
        origin: { kind: 'mirror', sourceId: pattern.id, sourceName: pattern.name },
      })
      toast(`已另存为「${saved.name}」`)
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  if (missing) return <Navigate to="/patterns" replace />
  if (!pattern || !grid || !record) {
    return (
      <section className="studio">
        <p className="pd-muted">正在打开制作模式…</p>
      </section>
    )
  }

  return (
    <section className={`studio${focus ? ' is-focus' : ''}`}>
      {focus ? null : (
        <header className="studio-head pd-pagehead">
          <div>
            <p className="pd-muted" style={{ margin: '0 0 4px' }}>
              <Link to={`/patterns/${pattern.id}`} className="pd-btn pd-btn-text" style={{ paddingLeft: 0 }}>
                返回图纸
              </Link>
            </p>
            <h1 className="pd-title">{pattern.name}</h1>
            <p className="pd-muted" style={{ margin: 0 }}>
              {grid.cols}×{grid.rows}
            </p>
          </div>
          <div className="pd-pagehead-actions studio-actions">
            <label className="studio-check">
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
              辅助网格
            </label>
            <label className="studio-check">
              <input type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} />
              显示色号
            </label>
            <button
              type="button"
              className={flipH ? 'pd-chip is-on' : 'pd-chip'}
              aria-pressed={flipH}
              onClick={() => setFlipH((value) => !value)}
            >
              水平镜像
            </button>
            <button
              type="button"
              className={flipV ? 'pd-chip is-on' : 'pd-chip'}
              aria-pressed={flipV}
              onClick={() => setFlipV((value) => !value)}
            >
              垂直镜像
            </button>
            <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleSaveMirrored()} disabled={!flipH && !flipV}>
              另存为新图纸
            </button>
            <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleExport()}>
              导出 PNG
            </button>
            <button type="button" className="pd-btn pd-btn-primary" onClick={() => setFocus(true)}>
              进入专注
            </button>
          </div>
        </header>
      )}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="studio-body">
        <div className="studio-canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="studio-canvas"
            aria-label="制作画布"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <div className="studio-zoom">
            <button type="button" className="pd-btn pd-btn-secondary" aria-label="缩小" onClick={() => changeScale(scale / 1.25)}>
              −
            </button>
            <span className="studio-zoom__value">{Math.round(scale * 100)}%</span>
            <button type="button" className="pd-btn pd-btn-secondary" aria-label="放大" onClick={() => changeScale(scale * 1.25)}>
              +
            </button>
            <button type="button" className="pd-btn pd-btn-text" onClick={applyFit}>
              适应窗口
            </button>
          </div>
        </div>
        <aside className="studio-colors" aria-label="色号列表">
          {focus ? (
            <div className="studio-focus-exit">
              <button type="button" className="pd-btn pd-btn-text" onClick={() => setFocus(false)}>
                退出专注
              </button>
            </div>
          ) : null}
          {mismatch ? <p className="usage-mismatch">用量和格子不一致</p> : null}
          <ul className="studio-color-list">
            {usageLines.map((line) => {
              const color = findColor(line.brand as 'MARD' | 'COCO', line.code)
              const done = completed.includes(line.key)
              const on = highlight === line.key
              return (
                <li key={line.key}>
                  <button
                    type="button"
                    className={`studio-color${on ? ' is-on' : ''}${done ? ' is-done' : ''}`}
                    onClick={() => setHighlight((current) => (current === line.key ? null : line.key))}
                  >
                    <span className="pd-swatch studio-swatch" style={{ background: color?.hex ?? '#CCC' }} />
                    <span className="studio-color__code">{line.code}</span>
                    <span className="studio-color__qty">{formatQty(line.quantity)}</span>
                  </button>
                  <label className="studio-done">
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={`已拼完 ${line.code}`}
                      onChange={(event) => void toggleCompleted(line.key, event.target.checked)}
                    />
                  </label>
                </li>
              )
            })}
          </ul>
          {focus || !pattern ? null : <ProgressPanel pattern={pattern} compact />}
        </aside>
      </div>
    </section>
  )
}
