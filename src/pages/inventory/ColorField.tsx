import { useMemo, useState } from 'react'
import { searchColors } from '../../data/palettes.ts'
import type { BrandId } from '../../data/types.ts'

export function ColorField({
  brand,
  value,
  onChange,
  id,
}: {
  brand: BrandId
  value: string
  onChange: (code: string) => void
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const suggestions = useMemo(() => searchColors(brand, value, 12), [brand, value])

  return (
    <div className="color-suggest">
      <input
        id={id}
        className="pd-input"
        value={value}
        autoComplete="off"
        aria-label="色号"
        placeholder="输入色号，如 A1"
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open && suggestions.length > 0 ? (
        <ul className="color-suggest__list" role="listbox">
          {suggestions.map((color) => (
            <li key={color.code}>
              <button
                type="button"
                className="color-suggest__item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(color.code)
                  setOpen(false)
                }}
              >
                <span className="pd-swatch" style={{ width: 20, height: 20, background: color.hex }} />
                <span>{color.code}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
