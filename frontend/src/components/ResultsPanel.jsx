import { useState, useEffect, useRef } from 'react'
import { createChart, LineStyle } from 'lightweight-charts'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ResultsPanel({ results }) {
  const [tab, setTab] = useState('overview')

  if (!results) return (
    <div className="results-content no-results">Run a strategy to see results here.</div>
  )

  const { metrics: m, trades = [], batch } = results

  const tabs = [
    { id: 'overview', label: batch ? 'S&P 500' : 'Overview' },
    { id: 'charts',   label: 'Charts',    hide: batch },
    { id: 'trades',   label: `Trades (${trades.length})` },
  ].filter(t => !t.hide)

  return (
    <>
      <div className="results-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`results-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="results-content scrollable">
        {tab === 'overview' && <Overview metrics={m} batch={batch} />}
        {tab === 'charts'   && <Charts results={results} />}
        {tab === 'trades'   && <TradesTable trades={trades} batch={batch} />}
      </div>
    </>
  )
}

// ── Score card ────────────────────────────────────────────────────────────────
function ScoreCard({ score, trades }) {
  if (score === undefined || score === null) return null
  const label  = score >= 86 ? 'Excellent' : score >= 71 ? 'Strong' : score >= 51 ? 'Good' : score >= 31 ? 'Fair' : 'Poor'
  const color  = score >= 86 ? '#26a69a'   : score >= 71 ? '#66bb6a' : score >= 51 ? '#f9a825' : score >= 31 ? '#ffa726' : '#ef5350'
  const pct    = `${score}%`
  return (
    <div className="score-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="score-title">Strategy Score</div>
          <div className="score-subtitle">{trades} trade{trades !== 1 ? 's' : ''} analyzed</div>
        </div>
        <div className="score-number" style={{ color }}>{score}</div>
      </div>
      <div className="score-bar-bg">
        <div className="score-bar-fill" style={{ width: pct, background: color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color, fontWeight: 600, fontSize: 11 }}>{label}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
          Win Rate · Profit Factor · Sharpe · Drawdown · CAGR
        </span>
      </div>
    </div>
  )
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function Overview({ metrics: m, batch }) {
  if (!m) return <div className="no-results">No metrics.</div>
  const p  = v => v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu'
  const f  = fmt

  const perfCards = batch ? [
    { label: 'Total Net P&L',    value: `$${f(m.net_pnl)}`,         cls: p(m.net_pnl) },
    { label: 'Starting Capital', value: `$${f(m.starting_capital)}/ticker`, cls: 'neu' },
    { label: 'Profit Factor',    value: f(m.profit_factor) ?? '∞',  cls: (m.profit_factor||0) >= 1 ? 'pos' : 'neg' },
    { label: 'Expectancy',       value: `$${f(m.expectancy)}`,       cls: p(m.expectancy) },
  ] : [
    { label: 'Net P&L',          value: `$${f(m.net_pnl)}`,         cls: p(m.net_pnl) },
    { label: 'Total Return',     value: `${f(m.total_return_pct)}%`, cls: p(m.total_return_pct) },
    { label: 'CAGR',             value: `${f(m.cagr_pct)}%`,        cls: p(m.cagr_pct) },
    { label: 'Starting Capital', value: `$${f(m.starting_capital)}`, cls: 'neu' },
    { label: 'Ending Capital',   value: `$${f(m.ending_capital)}`,   cls: p(m.net_pnl) },
  ]

  const riskCards = batch ? [
    { label: 'Best Trade',   value: `$${f(m.best_trade)}`,   cls: 'pos' },
    { label: 'Worst Trade',  value: `$${f(m.worst_trade)}`,  cls: 'neg' },
    { label: 'Gross Profit', value: `$${f(m.gross_profit)}`, cls: 'pos' },
    { label: 'Gross Loss',   value: `-$${f(m.gross_loss)}`,  cls: 'neg' },
  ] : [
    { label: 'Sharpe Ratio',    value: f(m.sharpe_ratio),           cls: (m.sharpe_ratio||0) > 1 ? 'pos' : 'neg' },
    { label: 'Sortino Ratio',   value: f(m.sortino_ratio),          cls: (m.sortino_ratio||0) > 1 ? 'pos' : 'neg' },
    { label: 'Calmar Ratio',    value: f(m.calmar_ratio) ?? '—',    cls: (m.calmar_ratio||0) > 1 ? 'pos' : 'neg' },
    { label: 'Max Drawdown',    value: `-${f(m.max_drawdown_pct)}%`,cls: 'neg' },
    { label: 'Max DD ($)',      value: `-$${f(m.max_drawdown_dollar)}`, cls: 'neg' },
    { label: 'Recovery Factor', value: f(m.recovery_factor) ?? '—', cls: (m.recovery_factor||0) > 1 ? 'pos' : 'neg' },
  ]

  const tradeCards = [
    { label: 'Total Trades',   value: m.total_trades,                   cls: 'neu' },
    { label: 'Win Rate',       value: `${f(m.win_rate)}%`,              cls: p(m.win_rate - 50) },
    { label: 'Profit Factor',  value: f(m.profit_factor) ?? '∞',        cls: (m.profit_factor||0) >= 1 ? 'pos' : 'neg' },
    { label: 'Avg Win',        value: `$${f(m.avg_win)}`,               cls: 'pos' },
    { label: 'Avg Loss',       value: `-$${f(m.avg_loss)}`,             cls: 'neg' },
    { label: 'Expectancy',     value: `$${f(m.expectancy)}`,            cls: p(m.expectancy) },
    { label: 'Best Trade',     value: `$${f(m.best_trade)}`,            cls: 'pos' },
    { label: 'Worst Trade',    value: `-$${f(Math.abs(m.worst_trade))}`,cls: 'neg' },
    { label: 'Gross Profit',   value: `$${f(m.gross_profit)}`,          cls: 'pos' },
    { label: 'Gross Loss',     value: `-$${f(m.gross_loss)}`,           cls: 'neg' },
    ...(!batch ? [
      { label: 'Avg Hold (days)',     value: f(m.avg_hold_days),         cls: 'neu' },
      { label: 'Max Consec. Wins',    value: m.max_consec_wins,          cls: 'pos' },
      { label: 'Max Consec. Losses',  value: m.max_consec_losses,        cls: 'neg' },
      { label: 'Golden Crosses',      value: m.total_golden_crosses,     cls: 'neu' },
    ] : [
      { label: 'Tickers Analyzed',    value: m.tickers_analyzed,         cls: 'neu' },
      { label: 'Golden Crosses',      value: m.total_golden_crosses,     cls: 'neu' },
    ]),
  ]

  return (
    <div className="overview-layout">
      <ScoreCard score={m.strategy_score} trades={m.total_trades} />

      <div className="metrics-section">
        <div className="metrics-section-title">Performance</div>
        <div className="metrics-grid">{perfCards.map(c => <MetricCard key={c.label} {...c} />)}</div>
      </div>

      {!batch && (
        <div className="metrics-section">
          <div className="metrics-section-title">Risk</div>
          <div className="metrics-grid">{riskCards.map(c => <MetricCard key={c.label} {...c} />)}</div>
        </div>
      )}

      <div className="metrics-section">
        <div className="metrics-section-title">Trade Analytics</div>
        <div className="metrics-grid">{tradeCards.map(c => <MetricCard key={c.label} {...c} />)}</div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, cls }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${cls}`}>{value ?? '—'}</div>
    </div>
  )
}

// ── Charts tab ────────────────────────────────────────────────────────────────
function Charts({ results }) {
  const { equity_curve, drawdown_curve, monthly_returns, trades = [], metrics: m } = results
  if (!equity_curve?.length) return <div className="no-results">No chart data — run a single-ticker backtest first.</div>

  return (
    <div className="charts-layout">
      <ChartSection title="Equity Curve">
        <MiniLineChart data={equity_curve} color="#26a69a" baseline={m?.starting_capital} />
      </ChartSection>

      <ChartSection title="Drawdown %">
        <MiniAreaChart data={drawdown_curve} color="#ef5350" />
      </ChartSection>

      {monthly_returns?.length > 0 && (
        <ChartSection title="Monthly P&L">
          <MonthlyHeatmap data={monthly_returns} />
        </ChartSection>
      )}

      {trades.length > 1 && (
        <ChartSection title="Trade P&L Distribution">
          <TradeHistogram trades={trades} />
        </ChartSection>
      )}
    </div>
  )
}

function ChartSection({ title, children }) {
  return (
    <div className="chart-section">
      <div className="chart-section-title">{title}</div>
      {children}
    </div>
  )
}

function MiniLineChart({ data, color, baseline }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !data?.length) return
    const chart = createChart(ref.current, {
      height: 130,
      layout: { background: { color: 'transparent' }, textColor: '#787b86' },
      grid:   { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale:       { borderColor: '#2a2e39', timeVisible: true },
      handleScroll: false, handleScale: false,
    })
    const s = chart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    s.setData(data)
    if (baseline != null) {
      chart.addLineSeries({ color: 'rgba(255,255,255,0.2)', lineWidth: 1, lineStyle: LineStyle.Dashed,
        priceLineVisible: false, lastValueVisible: false })
        .setData(data.map(d => ({ time: d.time, value: baseline })))
    }
    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) })
    ro.observe(ref.current)
    return () => { ro.disconnect(); chart.remove() }
  }, [data, color, baseline])
  return <div ref={ref} style={{ width: '100%', height: 130 }} />
}

const HEX_ALPHA = { '#ef5350': 'rgba(239,83,80,0.3)', '#26a69a': 'rgba(38,166,154,0.3)' }

function MiniAreaChart({ data, color }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !data?.length) return
    const chart = createChart(ref.current, {
      height: 90,
      layout: { background: { color: 'transparent' }, textColor: '#787b86' },
      grid:   { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale:       { borderColor: '#2a2e39', timeVisible: true },
      handleScroll: false, handleScale: false,
    })
    const s = chart.addAreaSeries({
      lineColor: color, topColor: HEX_ALPHA[color] || 'rgba(255,255,255,0.15)',
      bottomColor: 'transparent', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    s.setData(data)
    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }) })
    ro.observe(ref.current)
    return () => { ro.disconnect(); chart.remove() }
  }, [data, color])
  return <div ref={ref} style={{ width: '100%', height: 90 }} />
}

function MonthlyHeatmap({ data }) {
  const byYear = {}
  let absMax = 0
  for (const { month, pnl } of data) {
    const [y, m] = month.split('-')
    if (!byYear[y]) byYear[y] = {}
    byYear[y][parseInt(m) - 1] = pnl
    absMax = Math.max(absMax, Math.abs(pnl))
  }
  return (
    <div className="monthly-heatmap">
      <div className="heatmap-header">
        <span className="heatmap-year-col" />
        {MONTHS.map(m => <span key={m} className="heatmap-month-label">{m}</span>)}
      </div>
      {Object.entries(byYear).sort().map(([year, months]) => (
        <div key={year} className="heatmap-row">
          <span className="heatmap-year-col">{year}</span>
          {Array.from({ length: 12 }, (_, i) => {
            const v = months[i]
            const intensity = v != null && absMax > 0 ? Math.abs(v) / absMax : 0
            const bg = v == null ? 'rgba(255,255,255,0.04)'
              : v > 0 ? `rgba(38,166,154,${0.15 + intensity * 0.75})`
              : `rgba(239,83,80,${0.15 + intensity * 0.75})`
            return (
              <span key={i} className="heatmap-cell" style={{ background: bg }}
                title={v != null ? `${MONTHS[i]}: ${v > 0 ? '+' : ''}$${v.toFixed(2)}` : '—'}>
                {v != null ? (v > 0 ? '+' : '') + (Math.abs(v) >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)) : ''}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function TradeHistogram({ trades }) {
  const pnls   = trades.map(t => t.pnl)
  const lo     = Math.min(...pnls)
  const hi     = Math.max(...pnls)
  const N      = 12
  const bw     = (hi - lo) / N || 1
  const counts = Array(N).fill(0)
  pnls.forEach(p => { const i = Math.min(Math.floor((p - lo) / bw), N - 1); counts[i]++ })
  const maxC   = Math.max(...counts)

  return (
    <div className="trade-histogram">
      {counts.map((c, i) => {
        const center = lo + (i + 0.5) * bw
        const h      = maxC > 0 ? (c / maxC) * 100 : 0
        const isPos  = center >= 0
        return (
          <div key={i} className="hist-col">
            <div className="hist-bar-wrap">
              <div className="hist-bar" style={{
                height: `${h}%`,
                background: isPos ? '#26a69a' : '#ef5350',
                opacity: c === 0 ? 0.15 : 0.85,
              }} />
            </div>
            {c > 0 && <div className="hist-count">{c}</div>}
            <div className="hist-label">{center >= 0 ? '+' : ''}{Math.round(center)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Trades table ──────────────────────────────────────────────────────────────
function TradesTable({ trades, batch }) {
  if (!trades.length) return <div className="no-results">No completed trades.</div>
  return (
    <table className="trades-table">
      <thead>
        <tr>
          <th>#</th>
          {batch && <th>Ticker</th>}
          <th>Entry Levels</th>
          <th>Avg Entry</th>
          <th>Exit Price</th>
          <th>Exit Date</th>
          <th>Type</th>
          <th>Shares</th>
          <th>Stop Loss</th>
          <th>Take Profit</th>
          <th>P&L</th>
          <th>P&L %</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => {
          const cls = t.pnl > 0 ? 'pos' : 'neg'
          return (
            <tr key={i}>
              <td>{i + 1}</td>
              {batch && <td style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{t.ticker}</td>}
              <td>{t.entries.map(e => `${e.level}@${e.price}`).join(', ')}</td>
              <td>{t.avg_entry}</td>
              <td>{t.exit.price}</td>
              <td>{t.exit.time}</td>
              <td><span className={`badge badge-${t.exit.type.toLowerCase()}`}>{t.exit.type}</span></td>
              <td>{t.shares}</td>
              <td style={{ color: 'var(--red)' }}>{t.stop_loss}</td>
              <td style={{ color: 'var(--green)' }}>{t.take_profit}</td>
              <td className={cls}>{t.pnl > 0 ? '+' : ''}{t.pnl}</td>
              <td className={cls}>{t.pnl_pct > 0 ? '+' : ''}{t.pnl_pct}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function fmt(v) {
  if (v === null || v === undefined) return '—'
  return typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v
}
