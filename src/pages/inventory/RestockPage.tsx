import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PriceCell } from '../../components/PriceCell.tsx'
import { useFeedback } from '../../components/Feedback.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import {
  formatLineAmount,
  formatQuoteHeadline,
  formatQuoteTotal,
  formatUnpricedNote,
  quoteLine,
  quoteSummary,
} from '../../data/priceMath.ts'
import {
  clearOverridePrice,
  effectivePrice,
  emptyPriceBook,
  loadPriceBook,
  setOverridePrice,
  type PriceBook,
} from '../../data/priceRepo.ts'
import { getWarehouse, listStock } from '../../data/repo.ts'
import type { BrandId, StockLine, Warehouse } from '../../data/types.ts'
import {
  formatRestockCsv,
  formatRestockText,
  restockLines,
  statusClass,
  toStockLine,
  unthresholdedStockoutHintCount,
  unthresholdedStockoutHref,
} from '../../inventory/stockView.ts'

export function RestockPage() {
  const { warehouseId = '' } = useParams()
  const { toast } = useFeedback()
  const [warehouse, setWarehouse] = useState<Warehouse | undefined>()
  const [lines, setLines] = useState<StockLine[]>([])
  const [book, setBook] = useState<PriceBook>(emptyPriceBook(warehouseId))
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    void (async () => {
      const current = await getWarehouse(warehouseId)
      if (!current) {
        setMissing(true)
        setLoaded(true)
        return
      }
      setWarehouse(current)
      setLines((await listStock(warehouseId)).map(toStockLine))
      setBook(await loadPriceBook(warehouseId))
      setLoaded(true)
    })()
  }, [warehouseId])

  const list = useMemo(() => restockLines(lines), [lines])
  const quote = useMemo(
    () =>
      quoteSummary(
        list.map((line) => {
          const { li } = effectivePrice(book, line.brand, line.code)
          return { need: line.restockNeed, li }
        }),
      ),
    [list, book],
  )
  const unpricedNote = formatUnpricedNote(quote)
  const unthresholdedCount = useMemo(
    () => unthresholdedStockoutHintCount(lines, warehouseId),
    [lines, warehouseId],
  )

  if (loaded && missing) {
    return <Navigate to="/inventory" replace />
  }
  if (!loaded || !warehouse) {
    return <p className="pd-muted">正在读取补豆清单…</p>
  }

  const current = warehouse

  async function reloadBook() {
    setBook(await loadPriceBook(current.id))
  }

  async function commitPrice(brand: BrandId, code: string, li: number) {
    await setOverridePrice(current.id, brand, code, li)
    await reloadBook()
  }

  async function restorePrice(brand: BrandId, code: string) {
    await clearOverridePrice(current.id, brand, code)
    await reloadBook()
  }

  async function copyList() {
    const text = formatRestockText(current.name, lines, book)
    await navigator.clipboard.writeText(text)
    toast('已复制补豆清单')
  }

  function exportList() {
    const csv = formatRestockCsv(current.name, lines, book)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${current.name}-补豆清单.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('已导出 CSV')
  }

  return (
    <section>
      <header className="pd-pagehead">
        <h1 className="pd-title">补豆清单</h1>
        <div className="pd-pagehead-actions">
          <button type="button" className="pd-btn pd-btn-text" onClick={() => void copyList()} disabled={list.length === 0}>
            复制清单
          </button>
          <button type="button" className="pd-btn pd-btn-secondary" onClick={exportList} disabled={list.length === 0}>
            导出
          </button>
          <Link to={`/inventory/${warehouse.id}`} className="pd-btn pd-btn-secondary">
            返回库存
          </Link>
        </div>
      </header>

      {unthresholdedCount > 0 ? (
        <p className="pd-muted restock-unthresholded-hint">
          <Link to={unthresholdedStockoutHref(warehouse.id)} className="restock-unthresholded-hint__link">
            另有 {unthresholdedCount} 个色号缺货但未设阈值
          </Link>
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="pd-muted">暂时不用补豆。</p>
      ) : (
        <>
          <p className="pd-quote-headline">{formatQuoteHeadline(quote)}</p>
          {unpricedNote ? <p className="pd-muted quote-unpriced">{unpricedNote}</p> : null}
          <p className="pd-muted" style={{ margin: '0 0 16px' }}>
            来自低于或等于阈值。库存等于阈值时需补为 0，仍会列在下面。
          </p>
          <table className="pd-table restock-table">
            <thead>
              <tr>
                <th className="col-swatch"></th>
                <th className="col-code">色号</th>
                <th className="col-brand">品牌</th>
                <th className="is-num col-qty">库存</th>
                <th className="is-num col-threshold">阈值</th>
                <th className="is-num col-need">需补</th>
                <th className="is-num col-price">单价 / 粒</th>
                <th className="is-num col-amount">小计</th>
                <th className="col-status">说明</th>
              </tr>
            </thead>
            <tbody>
              {list.map((line) => {
                const price = effectivePrice(book, line.brand, line.code)
                const amount = formatLineAmount(quoteLine(line.restockNeed, price.li))
                return (
                  <tr key={line.id}>
                    <td>
                      <div className="pd-swatch" style={{ background: line.hex }} />
                    </td>
                    <td>
                      <b>{line.code}</b>
                    </td>
                    <td className="pd-muted">{line.brand}</td>
                    <td className="is-num">{formatQty(line.quantity)}</td>
                    <td className="is-num">{formatQty(line.threshold ?? 0)}</td>
                    <td className="is-num col-need">{formatQty(line.restockNeed)}</td>
                    <td className="is-num col-price">
                      <PriceCell
                        brand={line.brand}
                        code={line.code}
                        li={price.li}
                        custom={price.custom}
                        onCommit={(li) => void commitPrice(line.brand, line.code, li)}
                        onRestore={() => void restorePrice(line.brand, line.code)}
                      />
                    </td>
                    <td className={`is-num col-amount ${amount === '未填' || amount === '—' ? 'is-empty' : ''}`}>{amount}</td>
                    <td className={statusClass(line.statusKind)}>
                      {line.quantity === line.threshold ? '已到阈值' : line.statusLabel}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="pd-quote-total">
            合计 {formatQuoteTotal(quote)}
            {unpricedNote ? <span className="pd-muted">（{unpricedNote}）</span> : null}
          </p>
        </>
      )}
    </section>
  )
}
