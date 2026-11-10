import { useEffect, useMemo, useState } from 'react'
import { PriceCell } from '../../components/PriceCell.tsx'
import { useFeedback } from '../../components/Feedback.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { formatLineAmount, formatQuoteHeadline, formatQuoteTotal, formatUnpricedNote, quoteLine, quoteSummary } from '../../data/priceMath.ts'
import {
  clearOverridePrice,
  effectivePrice,
  emptyPriceBook,
  loadPriceBook,
  setOverridePrice,
  type PriceBook,
} from '../../data/priceRepo.ts'
import { formatShortageCsv, formatShortageText, type CompareResult } from '../../data/patternMath.ts'
import type { BrandId, Warehouse } from '../../data/types.ts'
import { statusClass } from '../../inventory/stockView.ts'

export function ScopeSelect({
  warehouses,
  value,
  onChange,
}: {
  warehouses: Warehouse[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="pd-field" style={{ marginBottom: 0, minWidth: 200 }}>
      <span>对比范围</span>
      <select className="pd-input" aria-label="对比范围" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">全部合计</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ComparePanel({
  title,
  result,
  scopeLabel,
  priceWarehouseId,
  priceWarehouseLabel,
}: {
  title: string
  result: CompareResult
  scopeLabel: string
  priceWarehouseId?: string
  priceWarehouseLabel?: string
}) {
  const { toast } = useFeedback()
  const [book, setBook] = useState<PriceBook>(emptyPriceBook(priceWarehouseId ?? ''))

  useEffect(() => {
    void (async () => {
      if (!priceWarehouseId) {
        setBook(emptyPriceBook(''))
        return
      }
      setBook(await loadPriceBook(priceWarehouseId))
    })()
  }, [priceWarehouseId])

  const quote = useMemo(
    () =>
      quoteSummary(
        result.shortages.map((line) => {
          const { li } = effectivePrice(book, line.brand, line.code)
          return { need: line.short, li }
        }),
      ),
    [result.shortages, book],
  )
  const unpricedNote = formatUnpricedNote(quote)

  async function reloadBook() {
    if (!priceWarehouseId) return
    setBook(await loadPriceBook(priceWarehouseId))
  }

  async function commitPrice(brand: BrandId, code: string, li: number) {
    if (!priceWarehouseId) return
    await setOverridePrice(priceWarehouseId, brand, code, li)
    await reloadBook()
  }

  async function restorePrice(brand: BrandId, code: string) {
    if (!priceWarehouseId) return
    await clearOverridePrice(priceWarehouseId, brand, code)
    await reloadBook()
  }

  async function copyList() {
    await navigator.clipboard.writeText(formatShortageText(title, result, scopeLabel, book))
    toast('已复制对比结果')
  }

  function exportList() {
    const csv = formatShortageCsv(title, result, scopeLabel, book)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title}-消耗对比.csv`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('已导出 CSV')
  }

  return (
    <div>
      <p className="pd-muted" style={{ margin: '0 0 12px' }}>
        对比「{scopeLabel}」：
        <strong className={result.ok ? 'pd-status pd-status-ok' : 'pd-status pd-status-danger'}> {result.label}</strong>
        。需要 {formatQty(result.totalNeed)} 粒
        {result.ok ? '' : `，缺 ${formatQty(result.totalShort)} 粒`}。对比只是预览，不会改库存。
      </p>
      {result.shortages.length > 0 ? (
        <>
          <p className="pd-quote-headline">{formatQuoteHeadline(quote)}</p>
          {unpricedNote ? <p className="pd-muted quote-unpriced">{unpricedNote}</p> : null}
        </>
      ) : null}
      {priceWarehouseLabel && priceWarehouseId && scopeLabel === '全部合计' ? (
        <p className="pd-muted quote-unpriced">单价按「{priceWarehouseLabel}」计算。</p>
      ) : null}
      {result.lines.length === 0 ? (
        <p className="pd-muted">还没有用量，无法对比。</p>
      ) : (
        <table className="pd-table inventory-table compare-table">
          <thead>
            <tr>
              <th className="col-swatch"></th>
              <th className="col-code">色号</th>
              <th className="col-brand">品牌</th>
              <th className="is-num col-qty">需要</th>
              <th className="is-num col-qty">库存</th>
              <th className="is-num col-need">剩余</th>
              <th className="is-num col-need">缺口</th>
              <th className="is-num col-price">单价 / 粒</th>
              <th className="is-num col-amount">小计</th>
              <th className="col-status">状态</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => {
              const price = effectivePrice(book, line.brand, line.code)
              const amount = formatLineAmount(quoteLine(line.short, price.li))
              return (
                <tr key={`${line.brand}-${line.code}`}>
                  <td>
                    <div className="pd-swatch" style={{ background: line.hex }} />
                  </td>
                  <td>
                    <b>{line.code}</b>
                  </td>
                  <td className="pd-muted">{line.brand}</td>
                  <td className="is-num">{formatQty(line.need)}</td>
                  <td className="is-num">{formatQty(line.stock)}</td>
                  <td className={`is-num ${line.remaining < 0 ? 'pd-status-danger' : ''}`}>{formatQty(line.remaining)}</td>
                  <td className={`is-num ${line.short > 0 ? 'pd-status-danger' : ''}`}>{formatQty(line.short)}</td>
                  <td className="is-num col-price">
                    {priceWarehouseId ? (
                      <PriceCell
                        brand={line.brand}
                        code={line.code}
                        li={price.li}
                        custom={price.custom}
                        onCommit={(li) => void commitPrice(line.brand, line.code, li)}
                        onRestore={() => void restorePrice(line.brand, line.code)}
                      />
                    ) : (
                      <span className="is-empty">未填</span>
                    )}
                  </td>
                  <td className={`is-num col-amount ${amount === '未填' || amount === '—' ? 'is-empty' : ''}`}>{amount}</td>
                  <td className={statusClass(line.short > 0 ? 'danger' : 'ok')}>{line.short > 0 ? '缺料' : '够拼'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {result.shortages.length > 0 ? (
        <>
          <p className="pd-muted" style={{ margin: '12px 0 0' }}>
            缺口清单：{result.shortages.map((line) => `${line.brand} ${line.code} 缺 ${line.short}`).join('，')}。
            不会自动加入按阈值计算的补豆清单。
          </p>
          <p className="pd-quote-total">
            合计 {formatQuoteTotal(quote)}
            {unpricedNote ? <span className="pd-muted">（{unpricedNote}）</span> : null}
          </p>
        </>
      ) : null}
      <div className="style-row">
        <button type="button" className="pd-btn pd-btn-text" onClick={() => void copyList()} disabled={result.lines.length === 0}>
          复制清单
        </button>
        <button type="button" className="pd-btn pd-btn-secondary" onClick={exportList} disabled={result.lines.length === 0}>
          导出
        </button>
      </div>
    </div>
  )
}
