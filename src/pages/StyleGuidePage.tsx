import { Link } from 'react-router-dom'

const colors = [
  { name: '页面底', varName: '--pd-bg', hex: '#FAF7F5' },
  { name: '卡片 / 导航底', varName: '--pd-surface', hex: '#FFFFFF' },
  { name: '正文', varName: '--pd-text', hex: '#2C2A28' },
  { name: '次要文字', varName: '--pd-text-secondary', hex: '#8A8580' },
  { name: '强调（少用）', varName: '--pd-accent', hex: '#C4787A' },
  { name: '浅粉底 / 描边', varName: '--pd-accent-soft', hex: '#E8C4C0' },
]

export function StyleGuidePage() {
  return (
    <section>
      <header className="pd-pagehead">
        <h1 className="pd-title">样式示例</h1>
        <Link to="/settings" className="pd-btn pd-btn-text">
          返回设置
        </Link>
      </header>
      <p className="pd-muted">本页展示界面用到的颜色、字体、间距和组件。</p>

      <div className="page-block">
        <h2 className="pd-section-title">色板</h2>
        <p className="pd-muted hint">强调色少用，让豆色做主角。状态只用文字颜色，不要左侧色条。</p>
        <div className="style-grid">
          {colors.map((c) => (
            <div key={c.varName} className="pd-card style-swatch">
              <div className="style-swatch__chip" style={{ background: c.hex }} />
              <div className="pd-row-name">{c.name}</div>
              <div className="pd-muted">
                {c.hex} · {c.varName}
              </div>
            </div>
          ))}
        </div>
        <p className="hint">
          <span className="pd-status-ok">充足 #6B9B7A</span>
          {'　'}
          <span className="pd-status-warn">临近阈值 #C4A35A</span>
          {'　'}
          <span className="pd-status-danger">缺货 #B85C5C</span>
        </p>
      </div>

      <div className="page-block">
        <h2 className="pd-section-title">字体</h2>
        <p className="pd-title" style={{ marginTop: 12 }}>
          页面标题 20 / 28 / 600
        </p>
        <p className="pd-section-title">区块标题 16 / 24 / 600</p>
        <p>正文 15 / 22 / 500，字体栈为 Nunito 与系统中文无衬线。</p>
        <p className="pd-muted">次要说明 13 / 20 / 500，不要再用更浅的字重。</p>
        <p className="pd-num">库存数量 1280</p>
      </div>

      <div className="page-block">
        <h2 className="pd-section-title">按钮与芯片</h2>
        <div className="style-row">
          <button type="button" className="pd-btn pd-btn-primary">
            入库
          </button>
          <button type="button" className="pd-btn pd-btn-secondary">
            导出
          </button>
          <button type="button" className="pd-btn pd-btn-text">
            复制清单
          </button>
        </div>
        <div className="pd-chips" style={{ marginTop: 12 }}>
          <span className="pd-chip is-on">全部</span>
          <span className="pd-chip">
            <span className="pd-chip-dot" style={{ background: '#c45c5c' }} />
            红系
          </span>
          <span className="pd-chip">
            <span className="pd-chip-dot" style={{ background: '#6b9b7a' }} />
            绿系
          </span>
        </div>
      </div>

      <div className="page-block">
        <h2 className="pd-section-title">库存表格结构（示例，状态只用文字色）</h2>
        <table className="pd-table inventory-table style-preview">
          <thead>
            <tr>
              <th className="col-swatch"></th>
              <th className="col-code">色号</th>
              <th className="col-brand">品牌</th>
              <th className="is-num col-qty">数量</th>
              <th className="is-num col-threshold">阈值</th>
              <th className="col-status">状态</th>
              <th className="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="pd-swatch" style={{ background: '#F2B8B5' }} />
              </td>
              <td>
                <b>A10</b>
              </td>
              <td className="pd-muted">MARD</td>
              <td className="is-num">1,240</td>
              <td className="is-num">300</td>
              <td className="pd-status pd-status-ok">充足</td>
              <td className="col-actions">
                <div className="pd-row-actions">
                  <button type="button" className="pd-btn pd-btn-text">
                    出库
                  </button>
                  <button type="button" className="pd-btn pd-btn-text">
                    编辑
                  </button>
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <div className="pd-swatch" style={{ background: '#F6E3A1' }} />
              </td>
              <td>
                <b>B03</b>
              </td>
              <td className="pd-muted">MARD</td>
              <td className="is-num pd-status-warn">320</td>
              <td className="is-num">300</td>
              <td className="pd-status pd-status-warn">临近阈值</td>
              <td className="col-actions">
                <div className="pd-row-actions">
                  <button type="button" className="pd-btn pd-btn-text">
                    出库
                  </button>
                  <button type="button" className="pd-btn pd-btn-text">
                    编辑
                  </button>
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <div className="pd-swatch" style={{ background: '#8FB89A' }} />
              </td>
              <td>
                <b>C12</b>
              </td>
              <td className="pd-muted">MARD</td>
              <td className="is-num pd-status-danger">0</td>
              <td className="is-num">200</td>
              <td className="pd-status pd-status-danger">缺货</td>
              <td className="col-actions">
                <div className="pd-row-actions">
                  <button type="button" className="pd-btn pd-btn-text">
                    出库
                  </button>
                  <button type="button" className="pd-btn pd-btn-text">
                    编辑
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="pd-muted hint">此表仅为结构示例，库存首页在无数据时走空状态，并未接入真实库存。</p>
      </div>
    </section>
  )
}
