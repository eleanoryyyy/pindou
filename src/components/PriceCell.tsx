import { useEffect, useState } from 'react'
import { liToYuanInput, parseYuanToLi } from '../data/priceMath.ts'
import type { BrandId } from '../data/types.ts'

export function PriceCell({
  brand,
  code,
  li,
  custom,
  onCommit,
  onRestore,
}: {
  brand: BrandId
  code: string
  li: number | null
  custom: boolean
  onCommit: (li: number) => void
  onRestore?: () => void
}) {
  const [text, setText] = useState(li === null ? '' : liToYuanInput(li))
  const [error, setError] = useState('')

  useEffect(() => {
    setText(li === null ? '' : liToYuanInput(li))
    setError('')
  }, [li, brand, code])

  function apply(raw: string, persistEmpty: boolean) {
    const parsed = parseYuanToLi(raw)
    if (parsed === 'invalid') {
      setError('请输入 0 或正数')
      return false
    }
    setError('')
    if (parsed === null) {
      if (!persistEmpty) return true
      setText(li === null ? '' : liToYuanInput(li))
      return true
    }
    onCommit(parsed)
    return true
  }

  return (
    <div className="price-cell">
      <label className="price-field">
        <span className="price-prefix" aria-hidden="true">
          ¥
        </span>
        <input
          className="pd-input price-input"
          inputMode="decimal"
          aria-label={`${code}单价`}
          aria-invalid={error ? true : undefined}
          value={text}
          onChange={(event) => {
            const raw = event.target.value
            setText(raw)
            void apply(raw, false)
          }}
          onBlur={() => {
            if (!apply(text, true)) {
              setText(li === null ? '' : liToYuanInput(li))
            } else if (parseYuanToLi(text) !== 'invalid' && parseYuanToLi(text) !== null) {
              setText(liToYuanInput(parseYuanToLi(text) as number))
            } else {
              setText(li === null ? '' : liToYuanInput(li))
            }
          }}
        />
      </label>
      {custom ? (
        <div className="price-custom">
          <span>自定</span>
          {onRestore ? (
            <button type="button" className="pd-btn pd-btn-text" onClick={() => onRestore()}>
              恢复默认
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="price-error">{error}</p> : null}
    </div>
  )
}

export function DefaultPriceField({
  warehouseId,
  li,
  onCommit,
}: {
  warehouseId: string
  li: number | null
  onCommit: (li: number | null) => void
}) {
  const [text, setText] = useState(li === null ? '' : liToYuanInput(li))
  const [error, setError] = useState('')

  useEffect(() => {
    setText(li === null ? '' : liToYuanInput(li))
    setError('')
  }, [li, warehouseId])

  function apply(raw: string, persistEmpty: boolean) {
    const parsed = parseYuanToLi(raw)
    if (parsed === 'invalid') {
      setError('请输入 0 或正数')
      return false
    }
    setError('')
    if (parsed === null) {
      if (persistEmpty) onCommit(null)
      return true
    }
    onCommit(parsed)
    return true
  }

  return (
    <div className="price-cell">
      <label className="price-field default-price-field">
        <span className="price-prefix" aria-hidden="true">
          ¥
        </span>
        <input
          className="pd-input"
          inputMode="decimal"
          aria-label="默认单价"
          placeholder="可留空"
          aria-invalid={error ? true : undefined}
          value={text}
          onChange={(event) => {
            const raw = event.target.value
            setText(raw)
            void apply(raw, false)
          }}
          onBlur={() => {
            if (!apply(text, true)) {
              setText(li === null ? '' : liToYuanInput(li))
            } else if (parseYuanToLi(text) !== null && parseYuanToLi(text) !== 'invalid') {
              setText(liToYuanInput(parseYuanToLi(text) as number))
            }
          }}
        />
        <span className="pd-muted">元/粒</span>
      </label>
      {error ? <p className="price-error">{error}</p> : null}
    </div>
  )
}
