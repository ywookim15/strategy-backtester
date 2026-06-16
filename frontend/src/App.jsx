import { useState, useEffect, useRef, useCallback } from 'react'
import SearchBar   from './components/SearchBar.jsx'
import Chart       from './components/Chart.jsx'
import StrategyPanel from './components/StrategyPanel.jsx'
import ResultsPanel  from './components/ResultsPanel.jsx'

const TIMEFRAMES = ['1m','5m','15m','30m','1h','4h','1d','1w','1M']
const MIN_RESULTS_H = 80
const MAX_RESULTS_H = 600

export default function App() {
  const [ticker,     setTicker]    = useState('AAPL')
  const [timeframe,  setTimeframe] = useState('1d')
  const [chartType,  setChartType] = useState('candlestick')
  const [chartData,  setChartData] = useState(null)
  const [results,    setResults]   = useState(null)
  const [loading,    setLoading]   = useState(false)
  const [resultsH,   setResultsH]  = useState(220)
  const [activeTab,  setActiveTab] = useState('overview')

  const dragRef  = useRef(null)
  const startY   = useRef(0)
  const startH   = useRef(0)

  // Fetch chart data when ticker or timeframe changes
  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setResults(null)
    fetch(`/api/chart-data?ticker=${encodeURIComponent(ticker)}&timeframe=${timeframe}`)
      .then(r => r.json())
      .then(d => setChartData(d.data || []))
      .catch(() => setChartData([]))
      .finally(() => setLoading(false))
  }, [ticker, timeframe])

  // Resize handle drag
  const onMouseDown = useCallback(e => {
    e.preventDefault()
    startY.current = e.clientY
    startH.current = resultsH
    const onMove = ev => {
      const delta = startY.current - ev.clientY
      const newH  = Math.min(MAX_RESULTS_H, Math.max(MIN_RESULTS_H, startH.current + delta))
      setResultsH(newH)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [resultsH])

  function handleResults(data) {
    setResults(data)
    if (!data.batch) {
      setChartData(null) // chart will use results.chart_data
    }
    // batch: keep chartData as-is — chart shows plain OHLCV, no overlays
  }

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="top-bar">
        <span className="app-title">StratBacktest</span>
        <SearchBar value={ticker} onSearch={t => { setTicker(t); setResults(null) }} />
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>
          {results?.batch
            ? `${results.metrics?.total_trades ?? 0} trades · ${results.metrics?.tickers_analyzed ?? 0} tickers`
            : ticker && results ? `${results.metrics?.total_trades ?? 0} trades` : ''}
        </span>
      </div>

      {/* ── Workspace ───────────────────────────────────────────────── */}
      <div className="workspace">

        {/* Left: chart + controls */}
        <div className="left-col">
          <div className="chart-container">
            {loading && <div className="chart-loading">Loading {ticker}…</div>}
            <Chart
              chartData={chartData}
              results={results}
              chartType={chartType}
            />
          </div>

          {/* Bottom control bar */}
          <div className="chart-controls">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                className={`ctrl-btn${timeframe === tf ? ' active' : ''}`}
                onClick={() => { setTimeframe(tf); setResults(null) }}
              >
                {tf}
              </button>
            ))}
            <div className="ctrl-separator" />
            <button
              className={`ctrl-btn${chartType === 'candlestick' ? ' active' : ''}`}
              onClick={() => setChartType('candlestick')}
            >
              Candles
            </button>
            <button
              className={`ctrl-btn${chartType === 'heikin_ashi' ? ' active' : ''}`}
              onClick={() => setChartType('heikin_ashi')}
            >
              Heikin Ashi
            </button>

            {results && (
              <>
                <div className="ctrl-separator" />
                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
                  <span style={{ color: '#ffffff' }}>─</span> SMA1
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ color: '#f9a825' }}>━</span> SMA2
                </span>
                <div className="ctrl-separator" />
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.75)' }}>─</span> Fib 0/1
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ color: '#f9a825' }}>─</span> 0.382
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ color: '#1e88e5' }}>─</span> 0.5
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  <span style={{ color: '#ef5350' }}>─</span> 0.618
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: strategy panel */}
        <div className="right-col">
          <StrategyPanel ticker={ticker} onResults={handleResults} />
        </div>
      </div>

      {/* ── Resize handle ────────────────────────────────────────────── */}
      <div
        className="resize-handle"
        onMouseDown={onMouseDown}
        ref={dragRef}
      />

      {/* ── Results panel ─────────────────────────────────────────────── */}
      <div className="results-panel" style={{ height: resultsH }}>
        <ResultsPanel results={results} />
      </div>
    </div>
  )
}
