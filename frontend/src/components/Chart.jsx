import { useEffect, useRef, useCallback } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'

const FIB_DEFS = [
  { key: 'fib0',   lvl: 'fib_0',   color: 'rgba(255,255,255,0.75)', label: 'Fib 0' },
  { key: 'fib382', lvl: 'fib_382', color: '#f9a825',                label: 'Fib 0.382' },
  { key: 'fib500', lvl: 'fib_500', color: '#1e88e5',                label: 'Fib 0.5' },
  { key: 'fib618', lvl: 'fib_618', color: '#ef5350',                label: 'Fib 0.618' },
  { key: 'fib1',   lvl: 'fib_1',   color: 'rgba(255,255,255,0.75)', label: 'Fib 1' },
]

function toHeikinAshi(data) {
  const out = []
  for (let i = 0; i < data.length; i++) {
    const { time, open, high, low, close } = data[i]
    const haClose = (open + high + low + close) / 4
    const haOpen  = i === 0 ? (open + close) / 2
      : (out[i - 1].open + out[i - 1].close) / 2
    out.push({
      time,
      open:  haOpen,
      high:  Math.max(high, haOpen, haClose),
      low:   Math.min(low,  haOpen, haClose),
      close: haClose,
    })
  }
  return out
}

// Build a line series data array for one fib level.
// Emits WhitespaceData ({time}) for points outside any period so
// lightweight-charts renders a gap instead of connecting across trades.
function buildFibLine(fibPeriods, lvlKey, chartData) {
  if (!chartData?.length || !fibPeriods?.length) return []

  return chartData.map(d => {
    const t = d.time
    for (const fp of fibPeriods) {
      const after  = fp.start_time == null || t >= fp.start_time
      const before = fp.end_time   == null || t <= fp.end_time
      if (after && before) return { time: t, value: fp[lvlKey] }
    }
    return { time: t }  // whitespace — creates a gap between fib periods
  })
}

export default function Chart({ chartData, results, chartType }) {
  const containerRef = useRef(null)
  const chartRef     = useRef(null)
  const seriesRef    = useRef({})

  const init = useCallback(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#131722' }, textColor: '#787b86' },
      grid:   { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale:       { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor:   '#26a69a', downColor: '#ef5350',
      borderUpColor: '#26a69a', borderDownColor: '#ef5350',
      wickUpColor:   '#26a69a', wickDownColor:   '#ef5350',
    })

    const sma1Series = chart.addLineSeries({
      color: '#ffffff', lineWidth: 1,
      priceLineVisible: false, lastValueVisible: true, title: 'SMA1',
    })
    const sma2Series = chart.addLineSeries({
      color: '#f9a825', lineWidth: 2,
      priceLineVisible: false, lastValueVisible: true, title: 'SMA2',
    })

    const fibSeries = {}
    FIB_DEFS.forEach(({ key, color }) => {
      fibSeries[key] = chart.addLineSeries({
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
      })
    })

    chartRef.current = chart
    seriesRef.current = { candleSeries, sma1Series, sma2Series, fibSeries }

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); chart.remove() }
  }, [])

  useEffect(() => {
    const cleanup = init()
    return cleanup
  }, [init])

  useEffect(() => {
    const refs = seriesRef.current
    if (!refs.candleSeries) return

    const rawData = results?.chart_data || chartData || []
    if (!rawData.length) return

    const displayData = chartType === 'heikin_ashi' ? toHeikinAshi(rawData) : rawData
    try { refs.candleSeries.setData(displayData) } catch (_) {}

    // Batch mode: no overlays on chart (results are in the panel only)
    const batch = results?.batch

    try { refs.sma1Series.setData(batch ? [] : (results?.sma1 || [])) } catch (_) {}
    try { refs.sma2Series.setData(batch ? [] : (results?.sma2 || [])) } catch (_) {}

    const fibPeriods = batch ? [] : (results?.fibonacci_periods || [])
    FIB_DEFS.forEach(({ key, lvl }) => {
      const lineData = buildFibLine(fibPeriods, lvl, rawData)
      try { refs.fibSeries[key].setData(lineData) } catch (_) {}
    })

    if (batch) {
      try { refs.candleSeries.setMarkers([]) } catch (_) {}
      return
    }

    // ── Markers ───────────────────────────────────────────────────────────
    const markers = []

    for (const gc of results?.golden_crosses || []) {
      markers.push({
        time: gc.time, position: 'aboveBar',
        color: '#f9a825', shape: 'circle', size: 1,
      })
    }

    for (const trade of results?.trades || []) {
      for (const e of trade.entries) {
        markers.push({
          time: e.time, position: 'belowBar',
          color: '#26a69a', shape: 'arrowUp', size: 1,
        })
      }
      if (trade.exit) {
        markers.push({
          time: trade.exit.time, position: 'aboveBar',
          color: '#ef5350', shape: 'arrowDown', size: 1,
        })
      }
    }

    markers.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0))
    try { refs.candleSeries.setMarkers(markers) } catch (_) {}

  }, [chartData, results, chartType])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
