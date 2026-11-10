import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { listPatterns } from '../../data/patternRepo.ts'
import { listProgress } from '../../data/progressRepo.ts'
import type { Pattern, PatternProgress } from '../../data/types.ts'

export function InProgressSection({ tick = 0 }: { tick?: number }) {
  const [items, setItems] = useState<{ pattern: Pattern; progress: PatternProgress }[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const [patterns, progressRows] = await Promise.all([listPatterns(), listProgress()])
      const map = new Map(patterns.map((item) => [item.id, item]))
      const next = progressRows
        .map((progress) => {
          const pattern = map.get(progress.patternId)
          if (!pattern || pattern.status !== 'in-progress') return null
          return { pattern, progress }
        })
        .filter((item): item is { pattern: Pattern; progress: PatternProgress } => Boolean(item))
      setItems(next)
      setLoaded(true)
    })()
  }, [tick])

  if (!loaded) return null

  return (
    <div className="page-block">
      <h2 className="pd-section-title">进行中作品</h2>
      {items.length === 0 ? (
        <EmptyState
          mark="进"
          description="还没有进行中的图，从图纸册选一张开始"
          action={
            <Link to="/patterns" className="pd-btn pd-btn-secondary">
              打开图纸册
            </Link>
          }
        />
      ) : (
        <ul className="progress-cards">
          {items.map(({ pattern, progress }) => {
            const holdTotal = progress.holds.reduce((sum, hold) => sum + hold.quantity, 0)
            const code = progress.colorKey.includes('::') ? progress.colorKey.split('::')[1] : progress.colorKey
            return (
              <li key={pattern.id} className="pd-card progress-card">
                <Link to={`/patterns/${pattern.id}`} className="progress-card__name">
                  {pattern.name}
                </Link>
                <p className="pd-muted progress-card__meta">
                  {progress.boardLabel ? `当前板 ${progress.boardLabel}` : '还没记下当前板'}
                  {progress.colorKey ? ` · 当前色 ${code || progress.colorKey}` : ' · 还没记下当前色'}
                </p>
                <p className="pd-muted progress-card__meta">暂扣 {formatQty(holdTotal)}</p>
                <div className="style-row">
                  <Link to={`/patterns/${pattern.id}/studio`} className="pd-btn pd-btn-secondary">
                    打开制作
                  </Link>
                  <Link to={`/patterns/${pattern.id}`} className="pd-btn pd-btn-text">
                    图纸详情
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
