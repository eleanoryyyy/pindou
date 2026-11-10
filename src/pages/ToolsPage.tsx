import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFeedback } from '../components/Feedback.tsx'
import {
  countsFromGrid,
  gridsEqual,
  mergeBoards,
  splitBoards,
  resolveTileOrigin,
  tileCardTitle,
  tileFileName,
  usageFromGrid,
  type BoardTile,
} from '../data/boardMath.ts'
import { CLEAN_EXPORT_OPTIONS, downloadBlob, drawGrid, gridToPngBlob, paperBackground } from '../data/renderGrid.ts'
import { formatQty } from '../data/inventoryMath.ts'
import { findColor } from '../data/palettes.ts'
import {
  createPatternFromGrid,
  ensurePatternGrid,
  getPattern,
  getPatternThumb,
  listPatterns,
  saveSplitTiles,
  updatePatternUsage,
} from '../data/patternRepo.ts'
import { messageOf } from '../data/repo.ts'
import { recognizePixelArt, rasterFromBlob, isAcceptedImageFile, gridFromRecognize } from '../data/recognizePattern.ts'
import type { BrandId, Pattern, PatternGrid } from '../data/types.ts'

type Tab = 'split' | 'merge' | 'pixel'
const BOARD_SIZES = [52, 29, 50] as const

export type ToolsDebug = {
  tab: Tab
  boardSize: number
  sourceName?: string
  sourceSize?: string
  tiles: { row: number; col: number; cols: number; rows: number; sizeLabel: string; counts: Record<string, number>; originCol: number; originRow: number }[]
  merged?: { cols: number; rows: number; counts: Record<string, number>; equalToSource: boolean }
  pixel?: { cols: number; rows: number; counts: Record<string, number>; name: string }
  lastExportName?: string
  lastSavedNames?: string[]
  placements?: { id: string; name: string; originCol: number; originRow: number; cols: number; rows: number }[]
}

declare global {
  interface Window {
    __pindouTools?: ToolsDebug
  }
}

function countMap(grid: PatternGrid): Record<string, number> {
  return countsFromGrid(grid)
}

export function ToolsPage() {
  const { toast } = useFeedback()
  const [tab, setTab] = useState<Tab>('split')
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [sourceId, setSourceId] = useState('')
  const [sourceGrid, setSourceGrid] = useState<PatternGrid>()
  const [sourcePattern, setSourcePattern] = useState<Pattern>()
  const [referenceGrid, setReferenceGrid] = useState<PatternGrid>()
  const [boardSize, setBoardSize] = useState(52)
  const [showGrid, setShowGrid] = useState(true)
  const [showCodes, setShowCodes] = useState(false)
  const [tiles, setTiles] = useState<BoardTile[]>([])
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([])
  const [placements, setPlacements] = useState<{ id: string; name: string; grid: PatternGrid; originCol: number; originRow: number; sourceId?: string }[]>([])
  const [pixelFile, setPixelFile] = useState<File | null>(null)
  const [pixelGrid, setPixelGrid] = useState<PatternGrid>()
  const [pixelName, setPixelName] = useState('')
  const [pixelBrand, setPixelBrand] = useState<BrandId>('MARD')
  const [pixelCols, setPixelCols] = useState('')
  const [pixelRows, setPixelRows] = useState('')
  const [pixelUsage, setPixelUsage] = useState<{ brand: BrandId; code: string; quantity: string }[]>([])
  const [error, setError] = useState('')
  const [lastExportName, setLastExportName] = useState<string>()
  const [lastSavedNames, setLastSavedNames] = useState<string[]>()
  const previewRef = useRef<HTMLCanvasElement>(null)
  const mergeGen = useRef(0)

  async function reloadPatterns() {
    const list = await listPatterns()
    setPatterns(list)
    const next: Record<string, string> = {}
    for (const item of list) {
      const blob = await getPatternThumb(item.id)
      if (blob) next[item.id] = URL.createObjectURL(blob)
    }
    setThumbs((prev) => {
      for (const url of Object.values(prev)) URL.revokeObjectURL(url)
      return next
    })
  }

  useEffect(() => {
    void reloadPatterns()
    return () => {
      setThumbs((prev) => {
        for (const url of Object.values(prev)) URL.revokeObjectURL(url)
        return {}
      })
    }
  }, [])

  async function loadSource(id: string) {
    setSourceId(id)
    if (!id) {
      setSourceGrid(undefined)
      setSourcePattern(undefined)
      setTiles([])
      return
    }
    try {
      const pattern = await getPattern(id)
      const record = await ensurePatternGrid(id)
      const grid = { cols: record.cols, rows: record.rows, cells: record.cells }
      setSourcePattern(pattern)
      setSourceGrid(grid)
      setTiles(splitBoards(grid, boardSize))
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  useEffect(() => {
    if (sourceGrid) setTiles(splitBoards(sourceGrid, boardSize))
  }, [boardSize, sourceGrid])

  async function loadMerge(ids: string[]) {
    const gen = ++mergeGen.current
    setSelectedMergeIds(ids)
    const loaded: { id: string; name: string; grid: PatternGrid; sourceId?: string; origin?: Pattern['origin'] }[] = []
    for (const id of ids) {
      const pattern = patterns.find((item) => item.id === id) ?? (await getPattern(id))
      if (!pattern) continue
      const record = await ensurePatternGrid(id)
      loaded.push({
        id,
        name: pattern.name,
        grid: { cols: record.cols, rows: record.rows, cells: record.cells },
        sourceId: pattern.origin?.sourceId,
        origin: pattern.origin,
      })
    }
    const splitHint =
      loaded.map((item) => item.origin?.splitSize).find((size) => Number.isInteger(size)) ??
      Math.max(...loaded.map((item) => Math.max(item.grid.cols, item.grid.rows)), 1)
    const resolvedAll = loaded.map((item) => ({
      item,
      resolved: resolveTileOrigin({ name: item.name, origin: item.origin }, splitHint),
    }))
    const next: typeof placements = resolvedAll.map(({ item, resolved }) => ({
      id: item.id,
      name: item.name,
      grid: item.grid,
      originCol: resolved.originCol,
      originRow: resolved.originRow,
      sourceId: item.sourceId,
    }))
    if (resolvedAll.every(({ resolved }) => resolved.source === 'none') && next.length > 1) {
      let x = 0
      for (const item of next) {
        item.originCol = x
        item.originRow = 0
        x += item.grid.cols
      }
    }
    if (gen !== mergeGen.current) return
    setPlacements(next)
  }

  useEffect(() => {
    const sourceIds = [...new Set(placements.map((item) => item.sourceId).filter((id): id is string => Boolean(id)))]
    if (sourceIds.length !== 1) {
      setReferenceGrid(undefined)
      return
    }
    let cancelled = false
    void ensurePatternGrid(sourceIds[0]).then((record) => {
      if (!cancelled) setReferenceGrid({ cols: record.cols, rows: record.rows, cells: record.cells })
    })
    return () => {
      cancelled = true
    }
  }, [placements])

  const mergedGrid = useMemo(() => {
    if (placements.length === 0) return undefined
    return mergeBoards(placements.map((item) => ({ grid: item.grid, originCol: item.originCol, originRow: item.originRow })))
  }, [placements])

  const compareSource = referenceGrid ?? sourceGrid
  const equalToSource = useMemo(() => {
    if (!mergedGrid || !compareSource) return false
    return gridsEqual(mergedGrid, compareSource)
  }, [mergedGrid, compareSource])

  async function recognizePixel(file: File, brand: BrandId, cols?: number, rows?: number) {
    const raster = await rasterFromBlob(file)
    const result = recognizePixelArt(raster, {
      preferBrand: brand,
      cols: cols && cols > 0 ? cols : undefined,
      rows: rows && rows > 0 ? rows : undefined,
    })
    const grid = gridFromRecognize(result)
    setPixelGrid(grid)
    setPixelCols(String(grid.cols))
    setPixelRows(String(grid.rows))
    setPixelUsage(result.usage.map((line) => ({ brand: line.brand, code: line.code, quantity: String(line.quantity) })))
    if (!pixelName) setPixelName(file.name.replace(/\.[^.]+$/, ''))
  }

  async function onPickPixel(file: File | undefined) {
    if (!file) return
    try {
      if (!isAcceptedImageFile(file)) throw new Error('请上传 JPG 或 PNG')
      setPixelFile(file)
      setPixelName(file.name.replace(/\.[^.]+$/, ''))
      await recognizePixel(file, pixelBrand)
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const previewGrid: PatternGrid | undefined =
    tab === 'split' ? sourceGrid : tab === 'merge' ? mergedGrid : pixelGrid

  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (tab === 'split' && sourceGrid && tiles.length) {
      const gap = 8
      const labelH = 20
      const cellPx = sourceGrid.cols * sourceGrid.rows > 6400 ? 6 : 8
      const boardCols = Math.max(...tiles.map((tile) => tile.col)) + 1
      const boardRows = Math.max(...tiles.map((tile) => tile.row)) + 1
      const colWidthPx: number[] = Array.from({ length: boardCols }, () => 0)
      const rowHeightPx: number[] = Array.from({ length: boardRows }, () => 0)
      for (const tile of tiles) {
        colWidthPx[tile.col] = Math.max(colWidthPx[tile.col], tile.cols * cellPx)
        rowHeightPx[tile.row] = Math.max(rowHeightPx[tile.row], tile.rows * cellPx)
      }
      const minWidth = colWidthPx.reduce((sum, item) => sum + item, 0) + gap * Math.max(0, boardCols - 1)
      const height = rowHeightPx.reduce((sum, item) => sum + item + labelH, 0) + gap * Math.max(0, boardRows - 1)
      ctx.font = '13px sans-serif'
      let width = minWidth
      for (const tile of tiles) {
        let x = 0
        for (let col = 0; col < tile.col; col += 1) x += colWidthPx[col] + gap
        width = Math.max(width, x + ctx.measureText(tileCardTitle(tile)).width + 4)
      }
      canvas.width = Math.max(1, Math.ceil(width))
      canvas.height = Math.max(1, height)
      // 预览用暖纸底；导出走 gridToPngBlob(CLEAN_EXPORT_OPTIONS)，白底、留空格透明。
      ctx.fillStyle = paperBackground()
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const tile of tiles) {
        let x = 0
        for (let col = 0; col < tile.col; col += 1) x += colWidthPx[col] + gap
        let y = 0
        for (let row = 0; row < tile.row; row += 1) y += labelH + rowHeightPx[row] + gap
        ctx.fillStyle = '#6B6560'
        ctx.font = '13px sans-serif'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(tileCardTitle(tile), x, y + 2)
        drawGrid(ctx, tile.grid, x, y + labelH, cellPx, { showGrid, showCodes })
      }
      return
    }
    if (!previewGrid || previewGrid.cols < 1) {
      canvas.width = 1
      canvas.height = 1
      return
    }
    const cellPx = previewGrid.cols * previewGrid.rows > 6400 ? 8 : 16
    canvas.width = previewGrid.cols * cellPx
    canvas.height = previewGrid.rows * cellPx
    // 预览用暖纸底，合板留空格也画成纸色；导出 PNG 用白底，留空格打成透明。
    ctx.fillStyle = paperBackground()
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    drawGrid(ctx, previewGrid, 0, 0, cellPx, { showGrid, showCodes, emptyStyle: tab === 'merge' ? 'preview' : undefined })
  }, [tab, previewGrid, tiles, sourceGrid, showGrid, showCodes])

  const currentExportName = useMemo(() => {
    if (tab === 'split' && sourcePattern) return `${sourcePattern.name}-split${boardSize}.png`
    if (tab === 'merge') return '合板结果.png'
    if (tab === 'pixel') return `${pixelName || '像素图纸'}.png`
    return 'pattern.png'
  }, [tab, sourcePattern, boardSize, pixelName])

  useEffect(() => {
    window.__pindouTools = {
      tab,
      boardSize,
      sourceName: sourcePattern?.name,
      sourceSize: sourceGrid ? `${sourceGrid.cols}x${sourceGrid.rows}` : undefined,
      tiles: tiles.map((tile) => ({
        row: tile.row,
        col: tile.col,
        cols: tile.cols,
        rows: tile.rows,
        sizeLabel: tile.sizeLabel,
        counts: tile.counts,
        originCol: tile.originCol,
        originRow: tile.originRow,
      })),
      merged: mergedGrid
        ? {
            cols: mergedGrid.cols,
            rows: mergedGrid.rows,
            counts: countMap(mergedGrid),
            equalToSource,
          }
        : undefined,
      pixel: pixelGrid
        ? { cols: pixelGrid.cols, rows: pixelGrid.rows, counts: countMap(pixelGrid), name: pixelName }
        : undefined,
      lastExportName,
      lastSavedNames,
      placements: placements.map((item) => ({ id: item.id, name: item.name, originCol: item.originCol, originRow: item.originRow, cols: item.grid.cols, rows: item.grid.rows })),
    }
    return () => {
      delete window.__pindouTools
    }
  }, [tab, boardSize, sourcePattern, sourceGrid, tiles, mergedGrid, equalToSource, pixelGrid, pixelName, lastExportName, lastSavedNames, placements])


  async function exportOneTile(pattern: Pattern, tile: BoardTile) {
    const name = tileFileName(pattern.name, tile)
    const blob = await gridToPngBlob(tile.grid, { ...CLEAN_EXPORT_OPTIONS })
    downloadBlob(blob, name)
    setLastExportName(name)
    toast('已导出 PNG')
  }

  async function exportCurrent() {
    try {
      if (tab === 'split') {
        if (!sourcePattern || tiles.length === 0) throw new Error('请先选择图纸并拆板')
        for (const tile of tiles) {
          const name = tileFileName(sourcePattern.name, tile)
          const blob = await gridToPngBlob(tile.grid, { ...CLEAN_EXPORT_OPTIONS })
          downloadBlob(blob, name)
          setLastExportName(name)
        }
        toast(`已导出 ${tiles.length} 张 PNG`)
        return
      }
      const grid = tab === 'merge' ? mergedGrid : pixelGrid
      if (!grid) throw new Error('没有可导出的图纸')
      const name = currentExportName
      const blob = await gridToPngBlob(grid, { ...CLEAN_EXPORT_OPTIONS })
      downloadBlob(blob, name)
      setLastExportName(name)
      toast('已导出 PNG')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function saveSplit() {
    if (!sourcePattern || tiles.length === 0) return
    try {
      const created = await saveSplitTiles(sourcePattern, tiles, boardSize)
      setLastSavedNames(created.map((item) => item.name))
      toast(`已保存 ${created.length} 块板到图纸册`)
      await reloadPatterns()
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function saveMerged() {
    if (!mergedGrid) return
    try {
      const name = '合板结果'
      const saved = await createPatternFromGrid(name, mergedGrid, {
        fileName: '合板结果.png',
        origin: { kind: 'merge', sourceName: placements.map((item) => item.name).join('、') },
      })
      setLastSavedNames([saved.name])
      toast('合板结果已保存到图纸册')
      await reloadPatterns()
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function savePixel() {
    if (!pixelGrid) return
    try {
      const saved = await createPatternFromGrid(pixelName || '像素图纸', pixelGrid, {
        fileName: `${pixelName || '像素图纸'}.png`,
        origin: { kind: 'pixel', sourceName: pixelFile?.name },
      })
      const edited = pixelUsage.some((row) => {
        const original = countMap(pixelGrid)[row.code]
        return Number(row.quantity) !== original || row.brand !== pixelGrid.cells.find((cell) => cell.code === row.code)?.brand
      })
      // If the user changed usage numbers, persist that edit on the pattern (grid stays as recognized).
      if (edited) {
        await updatePatternUsage(
          saved.id,
          pixelUsage.map((row) => ({ brand: row.brand, code: row.code, quantity: Number(row.quantity) })),
        )
      }
      setLastSavedNames([saved.name])
      toast('像素图纸已保存到图纸册')
      await reloadPatterns()
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <section className="tools-page">
      <header className="pd-pagehead">
        <div>
          <h1 className="pd-title">工具</h1>
          <p className="pd-muted" style={{ margin: 0 }}>
            拆板、合板或把像素画转成图纸，结果可导出 PNG 或存到图纸册。
          </p>
        </div>
      </header>

      <div className="pd-chips" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'split' ? 'pd-chip is-on' : 'pd-chip'} onClick={() => setTab('split')}>
          拆板
        </button>
        <button type="button" className={tab === 'merge' ? 'pd-chip is-on' : 'pd-chip'} onClick={() => setTab('merge')}>
          合板
        </button>
        <button type="button" className={tab === 'pixel' ? 'pd-chip is-on' : 'pd-chip'} onClick={() => setTab('pixel')}>
          像素转图纸
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="tools-layout">
        <aside className="tools-params">
          {tab === 'split' ? (
            <>
              <label className="pd-field">
                <span>选择图纸</span>
                <select className="pd-input" aria-label="选择图纸" value={sourceId} onChange={(event) => void loadSource(event.target.value)}>
                  <option value="">请选择</option>
                  {patterns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}（{item.cols}×{item.rows}）
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="tools-fieldset">
                <legend>板尺寸</legend>
                {BOARD_SIZES.map((size) => (
                  <label key={size} className="studio-check">
                    <input type="radio" name="board-size" checked={boardSize === size} onChange={() => setBoardSize(size)} />
                    {size}×{size}
                  </label>
                ))}
              </fieldset>
              {tiles.length > 0 ? (
                <div className="tools-tile-list">
                  <p className="pd-muted">共 {tiles.length} 板</p>
                  {tiles.map((tile) => (
                    <article key={`${tile.row}-${tile.col}`} className="tools-tile-card">
                      <header className="tools-tile-card__head">
                        <h3 className="tools-tile-card__title">{tileCardTitle(tile)}</h3>
                        {sourcePattern ? (
                          <button
                            type="button"
                            className="pd-btn pd-btn-text"
                            aria-label={`导出 ${tileCardTitle(tile)}`}
                            onClick={() => void exportOneTile(sourcePattern, tile)}
                          >
                            导出
                          </button>
                        ) : null}
                      </header>
                      <div className="pd-chips">
                        {usageFromGrid(tile.grid).map((line) => {
                          const color = findColor(line.brand, line.code)
                          return (
                            <span className="pd-chip" key={`${line.brand}-${line.code}`}>
                              <span className="pd-chip-dot" style={{ background: color?.hex ?? '#CCC' }} />
                              {line.code} {formatQty(line.quantity)}
                            </span>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="pd-muted">选一张图纸，拆板、合板或转成图纸后导出 PNG，存到相册看。</p>
              )}
            </>
          ) : null}

          {tab === 'merge' ? (
            <>
              <p className="pd-muted">勾选要拼接的小图，可改每块的起点坐标。放错位置也会生成结果，不会中断。</p>
              <div className="tools-merge-list">
                {patterns.map((item) => (
                  <label key={item.id} className="tools-merge-item">
                    <input
                      type="checkbox"
                      checked={selectedMergeIds.includes(item.id)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...selectedMergeIds, item.id]
                          : selectedMergeIds.filter((id) => id !== item.id)
                        void loadMerge(next)
                      }}
                    />
                    {thumbs[item.id] ? <img src={thumbs[item.id]} alt="" width={28} height={28} /> : null}
                    <span>{item.name}</span>
                  </label>
                ))}
              </div>
              {placements.map((item) => (
                <div key={item.id} className="tools-place-row">
                  <span>{item.name}</span>
                  <label>
                    列
                    <input
                      className="pd-input"
                      aria-label={`${item.name} 起点列`}
                      value={item.originCol}
                      onChange={(event) =>
                        setPlacements((rows) =>
                          rows.map((row) => (row.id === item.id ? { ...row, originCol: Number(event.target.value) || 0 } : row)),
                        )
                      }
                    />
                  </label>
                  <label>
                    行
                    <input
                      className="pd-input"
                      aria-label={`${item.name} 起点行`}
                      value={item.originRow}
                      onChange={(event) =>
                        setPlacements((rows) =>
                          rows.map((row) => (row.id === item.id ? { ...row, originRow: Number(event.target.value) || 0 } : row)),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              {mergedGrid ? (
                <p className="pd-muted">
                  合板尺寸 {mergedGrid.cols}×{mergedGrid.rows}
                  {compareSource ? (equalToSource ? '，与当前拆板原图逐格相同' : '，与原图不同（按实际摆放）') : ''}
                </p>
              ) : null}
            </>
          ) : null}

          {tab === 'pixel' ? (
            <>
              <label className="pd-field">
                <span>上传像素画</span>
                <input
                  className="pd-input"
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  aria-label="上传像素画"
                  onChange={(event) => void onPickPixel(event.target.files?.[0])}
                />
              </label>
              <label className="pd-field">
                <span>色卡</span>
                <select className="pd-input" aria-label="色卡" value={pixelBrand} onChange={(event) => {
                  const brand = event.target.value as BrandId
                  setPixelBrand(brand)
                  if (pixelFile) void recognizePixel(pixelFile, brand, Number(pixelCols) || undefined, Number(pixelRows) || undefined)
                }}>
                  <option value="MARD">MARD</option>
                  <option value="COCO">COCO</option>
                </select>
              </label>
              <div className="pattern-grid-controls">
                <label className="pd-field">
                  <span>列</span>
                  <input className="pd-input" aria-label="像素列数" value={pixelCols} onChange={(event) => setPixelCols(event.target.value)} />
                </label>
                <label className="pd-field">
                  <span>行</span>
                  <input className="pd-input" aria-label="像素行数" value={pixelRows} onChange={(event) => setPixelRows(event.target.value)} />
                </label>
                <button
                  type="button"
                  className="pd-btn pd-btn-secondary"
                  onClick={() => pixelFile && void recognizePixel(pixelFile, pixelBrand, Number(pixelCols) || undefined, Number(pixelRows) || undefined)}
                >
                  重新识别
                </button>
              </div>
              <label className="pd-field">
                <span>名称</span>
                <input className="pd-input" aria-label="像素图纸名称" value={pixelName} onChange={(event) => setPixelName(event.target.value)} />
              </label>
              {pixelUsage.map((row, index) => {
                const color = findColor(row.brand, row.code)
                return (
                  <div className="usage-editor-row" key={`${row.code}-${index}`}>
                    <div className="pd-swatch" style={{ background: color?.hex ?? '#CCC' }} />
                    <select
                      className="pd-input"
                      value={row.brand}
                      aria-label="品牌"
                      onChange={(event) =>
                        setPixelUsage((rows) => rows.map((item, i) => (i === index ? { ...item, brand: event.target.value as BrandId } : item)))
                      }
                    >
                      <option value="MARD">MARD</option>
                      <option value="COCO">COCO</option>
                    </select>
                    <input
                      className="pd-input"
                      aria-label={`${row.code || '色号'}色号`}
                      value={row.code}
                      onChange={(event) =>
                        setPixelUsage((rows) => rows.map((item, i) => (i === index ? { ...item, code: event.target.value } : item)))
                      }
                    />
                    <input
                      className="pd-input"
                      aria-label={`${row.code || '色号'}用量`}
                      value={row.quantity}
                      onChange={(event) =>
                        setPixelUsage((rows) => rows.map((item, i) => (i === index ? { ...item, quantity: event.target.value } : item)))
                      }
                    />
                  </div>
                )
              })}
              {pixelGrid ? (
                <p className="pd-muted">
                  识别为 {pixelGrid.cols}×{pixelGrid.rows}，合计 {formatQty(pixelGrid.cells.length)} 粒。
                </p>
              ) : (
                <p className="pd-muted">支持 1 像素 1 格，也支持放大 N 倍的清晰像素图。</p>
              )}
            </>
          ) : null}

          <label className="studio-check">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            显示网格
          </label>
          <label className="studio-check">
            <input type="checkbox" checked={showCodes} onChange={(event) => setShowCodes(event.target.checked)} />
            显示色号
          </label>

          <div className="tools-actions">
            <button type="button" className="pd-btn pd-btn-primary" onClick={() => void exportCurrent()}>
              导出 PNG
            </button>
            {tab === 'split' ? (
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void saveSplit()} disabled={tiles.length === 0}>
                保存为图纸
              </button>
            ) : null}
            {tab === 'merge' ? (
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void saveMerged()} disabled={!mergedGrid}>
                保存为图纸
              </button>
            ) : null}
            {tab === 'pixel' ? (
              <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void savePixel()} disabled={!pixelGrid}>
                保存为图纸
              </button>
            ) : null}
            {lastSavedNames?.length ? (
              <p className="pd-muted">
                已保存：{lastSavedNames.join('、')}。可到 <Link to="/patterns">图纸册</Link> 做对比或出库。
              </p>
            ) : null}
          </div>
        </aside>

        <div className="tools-preview">
          {previewGrid || (tab === 'split' && tiles.length) ? (
            <canvas ref={previewRef} className="tools-preview-canvas" aria-label="工具预览" />
          ) : (
            <div className="tools-empty">
              <p className="pd-muted">选一张图纸，拆板、合板或转成图纸后导出 PNG，存到相册看。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
