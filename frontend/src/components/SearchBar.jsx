import { useState, useEffect, useRef } from 'react'

export default function SearchBar({ value, onChange, onSearch }) {
  const [query, setQuery] = useState(value || '')
  const [tickers, setTickers] = useState([])
  const [filtered, setFiltered] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    fetch('/api/tickers').then(r => r.json()).then(d => setTickers(d.tickers || []))
  }, [])

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    if (query.length < 1) { setFiltered([]); return }
    const q = query.toUpperCase()
    setFiltered(tickers.filter(t => t.startsWith(q)).slice(0, 12))
  }, [query, tickers])

  const handleClick = useOutsideClick(ref, () => setOpen(false))

  function select(ticker) {
    setQuery(ticker)
    setOpen(false)
    onSearch(ticker)
  }

  function handleKey(e) {
    if (e.key === 'Enter') {
      const t = query.toUpperCase()
      setOpen(false)
      onSearch(t)
    }
  }

  return (
    <div className="search-wrap" ref={ref}>
      <input
        className="search-input"
        placeholder="Symbol..."
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
      />
      {open && filtered.length > 0 && (
        <ul className="search-dropdown">
          {filtered.map(t => (
            <li key={t} onMouseDown={() => select(t)}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function useOutsideClick(ref, cb) {
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) cb()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, cb])
}
