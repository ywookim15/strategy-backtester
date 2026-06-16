import { useState, useEffect } from 'react'

const COMMON_PARAMS = [
  { key: 'starting_capital', label: 'Starting Capital ($)', type: 'number', default: 10000, min: 100 },
]

export default function StrategyPanel({ ticker, onResults }) {
  const [strategies, setStrategies] = useState({})
  const [selected, setSelected] = useState('')
  const [params, setParams]   = useState({})
  const [loading,    setLoading]    = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)
  const [status,     setStatus]     = useState('')
  const [isError,    setIsError]    = useState(false)

  useEffect(() => {
    fetch('/api/strategies').then(r => r.json()).then(d => {
      setStrategies(d.strategies || {})
      const first = Object.keys(d.strategies || {})[0]
      if (first) {
        setSelected(first)
        initParams(d.strategies[first])
      }
    })
  }, [])

  function initParams(strategy) {
    const defaults = {}
    ;[...(strategy.params || []), ...COMMON_PARAMS].forEach(p => {
      defaults[p.key] = p.default ?? ''
    })
    setParams(defaults)
  }

  function handleStrategyChange(id) {
    setSelected(id)
    if (strategies[id]) initParams(strategies[id])
  }

  function handleParam(key, val) {
    setParams(prev => ({ ...prev, [key]: val }))
  }

  async function runAll() {
    if (!selected) return
    setLoadingAll(true)
    setStatus('Scanning S&P 500… this may take 1–2 minutes')
    setIsError(false)
    try {
      const res = await fetch('/api/backtest-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: selected, ticker: 'BATCH', params }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Batch run failed')
      onResults({ strategy: selected, ...data })
      const m = data.metrics || {}
      setStatus(`Done — ${m.total_trades ?? 0} trades across ${m.tickers_analyzed ?? 0} tickers`)
    } catch (e) {
      setStatus(e.message)
      setIsError(true)
    } finally {
      setLoadingAll(false)
    }
  }

  async function runBacktest() {
    if (!ticker || !selected) return
    setLoading(true)
    setStatus('Running backtest...')
    setIsError(false)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: selected, ticker, params }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Backtest failed')
      onResults({ strategy: selected, ...data })
      setStatus(`Done — ${data.metrics?.total_trades ?? 0} trades found`)
    } catch (e) {
      setStatus(e.message)
      setIsError(true)
    } finally {
      setLoading(false)
    }
  }

  const strat = strategies[selected]

  return (
    <div className="strategy-panel">
      <div className="panel-title">Strategy</div>

      <div className="form-group">
        <label className="form-label">Strategy</label>
        <select
          className="form-select"
          value={selected}
          onChange={e => handleStrategyChange(e.target.value)}
        >
          {Object.entries(strategies).map(([id, s]) => (
            <option key={id} value={id}>{s.name}</option>
          ))}
        </select>
      </div>

      {strat && (
        <>
          <div className="section-header">Strategy Params</div>
          {strat.params.map(p => (
            <ParamField key={p.key} def={p} value={params[p.key]} onChange={v => handleParam(p.key, v)} />
          ))}

          <div className="section-header">Capital</div>
          {COMMON_PARAMS.map(p => (
            <ParamField key={p.key} def={p} value={params[p.key]} onChange={v => handleParam(p.key, v)} />
          ))}
        </>
      )}

      <button className="run-btn" onClick={runBacktest} disabled={loading || loadingAll || !ticker}>
        {loading ? 'Running…' : 'Run Strategy'}
      </button>
      <button className="run-btn run-btn-all" onClick={runAll} disabled={loading || loadingAll}>
        {loadingAll ? 'Scanning S&P 500…' : 'Run S&P 500'}
      </button>
      {status && <div className={`status-msg${isError ? ' error' : ''}`}>{status}</div>}
    </div>
  )
}

function ParamField({ def, value, onChange }) {
  if (def.type === 'select') {
    return (
      <div className="form-group">
        <label className="form-label">{def.label}</label>
        <select className="form-select" value={value ?? def.default} onChange={e => onChange(e.target.value)}>
          {(def.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div className="form-group">
      <label className="form-label">{def.label}</label>
      <input
        className="form-input"
        type="number"
        min={def.min}
        max={def.max}
        value={value ?? def.default}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}
