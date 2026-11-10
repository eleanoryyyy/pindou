import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useFeedback } from '../../components/Feedback.tsx'
import { Drawer } from '../../components/Overlay.tsx'
import { applyTemplate, inbound, messageOf } from '../../data/repo.ts'
import { formatTemplateTotal, KIT_TEMPLATES, parsePerColorQuantity } from '../../data/templates.ts'
import type { BrandId } from '../../data/types.ts'
import { ColorField } from './ColorField.tsx'

type Tab = 'single' | 'batch' | 'template'

export function InboundDrawer({
  warehouseId,
  onClose,
  onDone,
}: {
  warehouseId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { toast } = useFeedback()
  const [tab, setTab] = useState<Tab>('single')
  const [brand, setBrand] = useState<BrandId>('MARD')
  const [code, setCode] = useState('')
  const [quantity, setQuantity] = useState('10')
  const [batchRows, setBatchRows] = useState<{ code: string; quantity: string }[]>([
    { code: '', quantity: '' },
    { code: '', quantity: '' },
  ])
  const [templateId, setTemplateId] = useState(KIT_TEMPLATES[0]?.id ?? '')
  const [perColor, setPerColor] = useState('100')
  const [perColorError, setPerColorError] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedTemplate = KIT_TEMPLATES.find((item) => item.id === templateId)

  async function finish() {
    await onDone()
    toast('入库已保存')
    onClose()
  }

  async function submitSingle(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await inbound({
        warehouseId,
        items: [{ brand, code, quantity: Number(quantity) }],
      })
      await finish()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  async function submitBatch(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const items = batchRows
        .map((row) => ({ brand, code: row.code.trim(), quantity: Number(row.quantity) }))
        .filter((row) => row.code || row.quantity)
      await inbound({ warehouseId, items })
      await finish()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  const parsedPerColor = parsePerColorQuantity(perColor)

  async function submitTemplate(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (parsedPerColor === 'invalid') {
      setPerColorError(true)
      return
    }
    setPerColorError(false)
    setBusy(true)
    try {
      await applyTemplate(warehouseId, templateId, parsedPerColor)
      await finish()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  function onBatchKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (index === batchRows.length - 1) {
        setBatchRows((rows) => [...rows, { code: '', quantity: '' }])
      } else {
        const next = event.currentTarget.form?.elements.namedItem(`batch-qty-${index + 1}`)
        if (next instanceof HTMLElement) next.focus()
      }
    }
  }

  return (
    <Drawer title="入库" onClose={onClose}>
      <div className="pd-tabs" role="tablist">
        {(
          [
            ['single', '单条'],
            ['batch', '批量'],
            ['template', '套装模板'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'pd-chip is-on' : 'pd-chip'}
            onClick={() => {
              setTab(id)
              setError('')
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {tab === 'single' ? (
        <form onSubmit={(event) => void submitSingle(event)}>
          <BrandField value={brand} onChange={setBrand} />
          <label className="pd-field">
            <span>色号</span>
            <ColorField brand={brand} value={code} onChange={setCode} />
          </label>
          <label className="pd-field">
            <span>数量</span>
            <input
              className="pd-input"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
            确认入库
          </button>
        </form>
      ) : null}

      {tab === 'batch' ? (
        <form onSubmit={(event) => void submitBatch(event)}>
          <BrandField value={brand} onChange={setBrand} />
          <p className="pd-muted" style={{ margin: '0 0 12px' }}>
            每行一个色号和数量。在数量框按回车可到下一行。
          </p>
          {batchRows.map((row, index) => (
            <div className="batch-row" key={index}>
              <ColorField
                brand={brand}
                value={row.code}
                onChange={(codeValue) =>
                  setBatchRows((rows) =>
                    rows.map((item, i) => (i === index ? { ...item, code: codeValue } : item)),
                  )
                }
              />
              <input
                className="pd-input"
                name={`batch-qty-${index}`}
                inputMode="numeric"
                placeholder="数量"
                value={row.quantity}
                onChange={(event) =>
                  setBatchRows((rows) =>
                    rows.map((item, i) => (i === index ? { ...item, quantity: event.target.value } : item)),
                  )
                }
                onKeyDown={(event) => onBatchKey(index, event)}
              />
              <button
                type="button"
                className="pd-btn pd-btn-text"
                aria-label="删除此行"
                onClick={() =>
                  setBatchRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)))
                }
              >
                删
              </button>
            </div>
          ))}
          <div className="style-row">
            <button
              type="button"
              className="pd-btn pd-btn-secondary"
              onClick={() => setBatchRows((rows) => [...rows, { code: '', quantity: '' }])}
            >
              添加一行
            </button>
            <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
              确认批量入库
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'template' ? (
        <form onSubmit={(event) => void submitTemplate(event)}>
          <label className="pd-field">
            <span>套装模板</span>
            <select
              className="pd-input"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              {KIT_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pd-field">
            <span className="pd-muted">每色粒数</span>
            <div className="per-color-field">
              <input
                className={`pd-input${perColorError ? ' is-invalid' : ''}`}
                value={perColor}
                inputMode="numeric"
                aria-label="每色粒数"
                aria-invalid={perColorError}
                onChange={(event) => {
                  setPerColor(event.target.value)
                  setPerColorError(false)
                }}
              />
              <span className="per-color-field__unit">粒</span>
            </div>
            {perColorError ? <p className="per-color-error">请填正整数</p> : null}
          </label>
          {selectedTemplate && parsedPerColor !== 'invalid' ? (
            <p className="pd-muted per-color-total">
              {formatTemplateTotal(selectedTemplate.items.length, parsedPerColor)}
            </p>
          ) : selectedTemplate ? (
            <p className="pd-muted">将只写入当前豆仓。色号均来自开源色卡。</p>
          ) : null}
          <button type="submit" className="pd-btn pd-btn-primary" disabled={busy} style={{ marginTop: 12 }}>
            按模板录入
          </button>
        </form>
      ) : null}
    </Drawer>
  )
}

function BrandField({ value, onChange }: { value: BrandId; onChange: (brand: BrandId) => void }) {
  return (
    <div className="pd-field">
      <span>品牌色卡</span>
      <div className="pd-chips">
        {(['MARD', 'COCO'] as const).map((brand) => (
          <button
            key={brand}
            type="button"
            className={value === brand ? 'pd-chip is-on' : 'pd-chip'}
            aria-pressed={value === brand}
            onClick={() => onChange(brand)}
          >
            {brand}
          </button>
        ))}
      </div>
    </div>
  )
}
