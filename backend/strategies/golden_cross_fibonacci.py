import pandas as pd
import numpy as np
from data_fetcher import fetch_ohlcv, align_series, format_time, df_to_chart, series_to_line


def run(params: dict) -> dict:
    ticker         = params['ticker']
    chart_tf       = params.get('chart_timeframe', '1d')
    sma1_len       = int(params.get('sma1_length', 200))
    sma1_tf        = params.get('sma1_timeframe', '1d')
    sma2_len       = int(params.get('sma2_length', 200))
    sma2_tf        = params.get('sma2_timeframe', '4h')
    lb_high        = int(params.get('lookback_high', 50))
    lb_low         = int(params.get('lookback_low', 100))
    start_capital  = float(params.get('starting_capital', 10000))
    lookback_years = int(params.get('lookback_years', 10))

    # ── Fetch & align ────────────────────────────────────────────────────────
    df   = fetch_ohlcv(ticker, chart_tf)
    sma1 = align_series(fetch_ohlcv(ticker, sma1_tf)['close'].rolling(sma1_len).mean(), df.index)
    sma2 = align_series(fetch_ohlcv(ticker, sma2_tf)['close'].rolling(sma2_len).mean(), df.index)

    # ── Display window: start where both SMAs have data ──────────────────────
    if lookback_years > 0:
        user_ts  = df.index[-1] - pd.DateOffset(years=lookback_years)
        user_idx = next((j for j, ts in enumerate(df.index) if ts >= user_ts), 0)
    else:
        user_idx = 0

    valid   = sma1.notna() & sma2.notna()
    sma_idx = df.index.get_loc(valid.idxmax()) if valid.any() else 0
    disp_idx = max(user_idx, sma_idx)

    # ── Helpers ──────────────────────────────────────────────────────────────
    def _fmt(ts):
        return format_time(ts, chart_tf)

    def _fibs(high, low):
        r = high - low
        return {'0': high, '0.382': high - 0.382*r,
                '0.5': high - 0.500*r, '0.618': high - 0.618*r, '1': low}

    def _sl(elist, fib0):
        tot = sum(e[1] for e in elist)
        avg = sum(e[0]*e[1] for e in elist) / tot
        return avg - (fib0 - avg) / 2.0, avg, tot

    def _low_time(lo_s, hi_idx):
        return _fmt(df['low'].iloc[lo_s:hi_idx].idxmin())

    # ── Strategy state ───────────────────────────────────────────────────────
    state    = 'WAITING'

    # Current fib setup (tracked in memory, NOT yet visible on chart)
    cur_fib_h     = None
    cur_fib_l     = None
    cur_fib_lvls  = {}
    cur_low_time  = None   # timestamp of the recent low (for fib level ref only)
    cur_cross_time = None  # golden cross timestamp — used as fib display start_time

    entries  = []
    e_flags  = {k: False for k in ('0.382', '0.5', '0.618')}
    sl = tp  = None

    golden_crosses = []
    fib_periods    = []   # only created when a trade is OPENED (0.382 entry)
    trades         = []
    capital        = start_capital
    peak           = start_capital
    max_dd         = 0.0

    def _update_cur_fib(high, low, low_time):
        """Update in-memory fib setup; does NOT create a visible chart period."""
        nonlocal cur_fib_h, cur_fib_l, cur_fib_lvls, cur_low_time
        cur_fib_h    = high
        cur_fib_l    = low
        cur_fib_lvls = _fibs(high, low)
        cur_low_time = low_time

    def _open_fib_display():
        """Create a visible fib period — called ONLY when the first entry is made.
        Uses golden cross time as start so it never predates the previous trade's exit."""
        fib_periods.append({
            'start_time': cur_cross_time,
            'end_time':   None,
            'fib_0':   round(cur_fib_lvls['0'],     4),
            'fib_382': round(cur_fib_lvls['0.382'], 4),
            'fib_500': round(cur_fib_lvls['0.5'],   4),
            'fib_618': round(cur_fib_lvls['0.618'], 4),
            'fib_1':   round(cur_fib_lvls['1'],     4),
        })

    def _close_fib_display(i):
        """Set end_time on the active visible fib period (at sell point)."""
        if fib_periods and fib_periods[-1]['end_time'] is None:
            fib_periods[-1]['end_time'] = _fmt(df.index[i])

    def _close_trade(i, exit_price, exit_type):
        nonlocal capital, peak, max_dd, entries, e_flags, sl, tp
        tot  = sum(e[1] for e in entries)
        avg  = sum(e[0]*e[1] for e in entries) / tot
        pnl  = (exit_price - avg) * tot
        capital += pnl
        peak     = max(peak, capital)
        dd       = (peak - capital) / peak if peak else 0
        max_dd   = max(max_dd, dd)
        trades.append({
            'entries': [{'time': _fmt(e[3]), 'price': round(float(e[0]), 4),
                         'shares': e[1], 'level': e[2]} for e in entries],
            'exit':  {'time': _fmt(df.index[i]), 'price': round(float(exit_price), 4),
                      'type': exit_type},
            'avg_entry':   round(float(avg), 4),
            'stop_loss':   round(float(sl), 4) if sl is not None else None,
            'take_profit': round(float(tp), 4) if tp is not None else None,
            'pnl':         round(float(pnl), 2),
            'pnl_pct':     round(float(pnl / (avg * tot) * 100), 2),
            'shares':      tot,
        })
        entries = []
        e_flags = {k: False for k in ('0.382', '0.5', '0.618')}
        sl = tp = None

    # ── Main loop ─────────────────────────────────────────────────────────────
    for i in range(max(disp_idx, 1), len(df)):
        s1,  s2  = sma1.iloc[i],   sma2.iloc[i]
        s1p, s2p = sma1.iloc[i-1], sma2.iloc[i-1]

        if pd.isna(s1) or pd.isna(s2) or pd.isna(s1p) or pd.isna(s2p):
            continue

        c         = df.iloc[i]
        is_golden = (s2 > s1) and (s2p <= s1p)
        is_death  = (s2 < s1) and (s2p >= s1p)

        # ── Golden cross ──────────────────────────────────────────────────────
        if is_golden:
            golden_crosses.append({'time': _fmt(df.index[i]),
                                   'price': round(float(c['close']), 4)})
            if state == 'WAITING':
                # Compute fib setup (not yet visible)
                hi_s   = max(0, i - lb_high)
                rh_loc = df['high'].iloc[hi_s:i].idxmax()
                rh_idx = df.index.get_loc(rh_loc)
                lo_s   = max(0, rh_idx - lb_low)
                rh     = df['high'].iloc[hi_s:i].max()
                rl     = df['low'].iloc[lo_s:rh_idx].min()
                lt     = _low_time(lo_s, rh_idx)
                _update_cur_fib(rh, rl, lt)
                cur_cross_time = _fmt(df.index[i])   # anchor for fib display start
                state   = 'WATCHING'
                entries = []
                e_flags = {k: False for k in ('0.382', '0.5', '0.618')}

        # ── Death cross ───────────────────────────────────────────────────────
        if is_death:
            if state == 'IN_TRADE' and entries:
                _close_fib_display(i)
                _close_trade(i, float(c['close']), 'DC')
            # If WATCHING: no visible fib period exists, nothing to close
            state   = 'WAITING'
            entries = []
            e_flags = {k: False for k in ('0.382', '0.5', '0.618')}
            sl = tp = None
            cur_fib_h = cur_fib_l = None
            continue

        # ── WATCHING ──────────────────────────────────────────────────────────
        if state == 'WATCHING':
            # New high above current fib_0 before any entry → shift fib up silently
            if not entries and c['high'] > cur_fib_h:
                lo_s   = max(0, i - lb_low)
                new_lo = df['low'].iloc[lo_s:i].min()
                lt     = _low_time(lo_s, i)
                _update_cur_fib(c['high'], new_lo, lt)

            lo = c['low']
            # 0.382 entry: open the VISIBLE fib period for the first time
            if not e_flags['0.382'] and lo <= cur_fib_lvls['0.382']:
                _open_fib_display()                                # fib lines start here
                entries.append((cur_fib_lvls['0.382'], 1, '0.382', df.index[i]))
                e_flags['0.382'] = True
                sl, _, _ = _sl(entries, cur_fib_h)
                tp       = cur_fib_h
                state    = 'IN_TRADE'

            # Can fall through to additional levels on same candle
            if e_flags['0.382'] and not e_flags['0.5'] and lo <= cur_fib_lvls['0.5']:
                entries.append((cur_fib_lvls['0.5'], 2, '0.5', df.index[i]))
                e_flags['0.5'] = True
                sl, _, _ = _sl(entries, cur_fib_h)
            if e_flags['0.382'] and not e_flags['0.618'] and lo <= cur_fib_lvls['0.618']:
                entries.append((cur_fib_lvls['0.618'], 3, '0.618', df.index[i]))
                e_flags['0.618'] = True
                sl, _, _ = _sl(entries, cur_fib_h)

        # ── IN_TRADE ──────────────────────────────────────────────────────────
        elif state == 'IN_TRADE':
            lo, hi = c['low'], c['high']

            # Scale into deeper levels
            if not e_flags['0.5'] and lo <= cur_fib_lvls['0.5']:
                entries.append((cur_fib_lvls['0.5'], 2, '0.5', df.index[i]))
                e_flags['0.5'] = True
                sl, _, _ = _sl(entries, cur_fib_h)
            if not e_flags['0.618'] and lo <= cur_fib_lvls['0.618']:
                entries.append((cur_fib_lvls['0.618'], 3, '0.618', df.index[i]))
                e_flags['0.618'] = True
                sl, _, _ = _sl(entries, cur_fib_h)

            # Stop loss
            if lo <= sl:
                _close_fib_display(i)       # fib lines end at sell point
                _close_trade(i, sl, 'SL')
                state = 'WAITING'
                cur_fib_h = cur_fib_l = None
            # Take profit
            elif hi >= tp:
                _close_fib_display(i)       # fib lines end at sell point
                _close_trade(i, tp, 'TP')
                state = 'WAITING'
                cur_fib_h = cur_fib_l = None

    # ── Close open trade/fib at end of data ─────────────────────────────────
    if state == 'IN_TRADE' and entries:
        _close_fib_display(len(df) - 1)
        _close_trade(len(df) - 1, float(df['close'].iloc[-1]), 'END')

    # Safety: close any unclosed period
    if fib_periods and fib_periods[-1]['end_time'] is None:
        fib_periods[-1]['end_time'] = _fmt(df.index[-1])

    # ── Core P&L aggregation ────────────────────────────────────────────────
    wins  = [t for t in trades if t['pnl'] > 0]
    loses = [t for t in trades if t['pnl'] <= 0]
    tw    = sum(t['pnl'] for t in wins)
    tl    = abs(sum(t['pnl'] for t in loses))

    # ── Equity curve (daily resolution) ─────────────────────────────────────
    idx_range  = df.index[disp_idx:]
    pnl_series = pd.Series(0.0, index=idx_range)

    for t in trades:
        raw = t['exit']['time']
        try:
            ts = pd.Timestamp(raw) if isinstance(raw, str) else pd.Timestamp(raw, unit='s')
            if ts in pnl_series.index:
                pnl_series[ts] += t['pnl']
            else:
                loc = pnl_series.index.searchsorted(ts)
                if loc < len(pnl_series):
                    pnl_series.iloc[loc] += t['pnl']
        except Exception:
            pass

    equity = start_capital + pnl_series.cumsum()

    # Drawdown series
    peak_eq = equity.cummax()
    dd_pct   = (equity - peak_eq) / peak_eq * 100  # negative values

    equity_curve   = [{'time': _fmt(ts), 'value': round(float(v), 2)} for ts, v in equity.items()]
    drawdown_curve = [{'time': _fmt(ts), 'value': round(float(v), 2)} for ts, v in dd_pct.items()]

    # ── Returns-based stats ──────────────────────────────────────────────────
    daily_rets = equity.pct_change().dropna()
    neg_rets   = daily_rets[daily_rets < 0]

    sharpe  = float(daily_rets.mean() / daily_rets.std() * np.sqrt(252)) \
              if len(daily_rets) > 1 and daily_rets.std() > 0 else 0.0
    sortino = float(daily_rets.mean() / neg_rets.std() * np.sqrt(252)) \
              if len(neg_rets) > 1 and neg_rets.std() > 0 else 0.0

    # CAGR
    total_days = max((df.index[-1] - df.index[disp_idx]).days, 1)
    years      = total_days / 365.25
    end_cap    = float(equity.iloc[-1])
    cagr_pct   = ((end_cap / start_capital) ** (1 / years) - 1) * 100 if years > 0 else 0.0

    # Max drawdown
    max_dd_pct    = float(abs(dd_pct.min())) if len(dd_pct) else 0.0
    max_dd_dollar = float((peak_eq - equity).max()) if len(equity) else 0.0

    # Calmar & recovery
    calmar          = round(cagr_pct / max_dd_pct, 2)      if max_dd_pct > 0  else None
    net_profit      = end_cap - start_capital
    recovery_factor = round(net_profit / max_dd_dollar, 2) if max_dd_dollar > 0 else None

    # Trade-level stats
    all_pnls = [t['pnl'] for t in trades]
    expectancy  = round(float(np.mean(all_pnls)), 2) if all_pnls else 0.0
    best_trade  = round(max(all_pnls), 2) if all_pnls else 0.0
    worst_trade = round(min(all_pnls), 2) if all_pnls else 0.0

    # Average holding period (days)
    hold_days = []
    for t in trades:
        try:
            et = t['entries'][0]['time'];  xt = t['exit']['time']
            if isinstance(et, str):
                hold_days.append((pd.Timestamp(xt) - pd.Timestamp(et)).days)
            else:
                hold_days.append((xt - et) / 86400)
        except Exception:
            pass
    avg_hold_days = round(float(np.mean(hold_days)), 1) if hold_days else 0.0

    # Consecutive wins / losses
    max_cw = max_cl = cw = cl = 0
    for t in trades:
        if t['pnl'] > 0:
            cw += 1; cl = 0; max_cw = max(max_cw, cw)
        else:
            cl += 1; cw = 0; max_cl = max(max_cl, cl)

    # Monthly returns
    monthly: dict = {}
    for t in trades:
        raw = t['exit']['time']
        key = raw[:7] if isinstance(raw, str) \
              else pd.Timestamp(raw, unit='s').strftime('%Y-%m')
        monthly[key] = round(monthly.get(key, 0.0) + t['pnl'], 2)
    monthly_returns = [{'month': k, 'pnl': v} for k, v in sorted(monthly.items())]

    # ── Strategy score (0–100) ───────────────────────────────────────────────
    def _score(wr, pf, sr, mdd, n, cgr):
        s  = min(20, max(0, (wr  - 45) / 25  * 20))   # win rate
        s += min(20, max(0, (pf  - 1.0) / 1.5 * 20))  # profit factor
        s += min(20, max(0,  sr         / 1.5 * 20))   # sharpe
        s += min(20, max(0, (40  - mdd) / 40  * 20))   # drawdown (lower = better)
        s += min(10, n / 20 * 10)                       # trade count
        s += min(10, max(0,  cgr        / 25  * 10))   # CAGR %
        return round(min(100, max(0, s)))

    metrics = {
        # Capital
        'starting_capital':     round(start_capital, 2),
        'ending_capital':       round(end_cap, 2),
        'net_pnl':              round(net_profit, 2),
        'total_return_pct':     round(net_profit / start_capital * 100, 2) if start_capital else 0,
        # Returns
        'cagr_pct':             round(cagr_pct, 2),
        'sharpe_ratio':         round(sharpe, 2),
        'sortino_ratio':        round(sortino, 2),
        'calmar_ratio':         calmar,
        # Risk
        'max_drawdown_pct':     round(max_dd_pct, 2),
        'max_drawdown_dollar':  round(max_dd_dollar, 2),
        'recovery_factor':      recovery_factor,
        # Trade stats
        'total_golden_crosses': len(golden_crosses),
        'total_trades':         len(trades),
        'winning_trades':       len(wins),
        'losing_trades':        len(loses),
        'win_rate':             round(len(wins) / len(trades) * 100, 1) if trades else 0,
        'profit_factor':        round(tw / tl, 2) if tl > 0 else None,
        'gross_profit':         round(tw, 2),
        'gross_loss':           round(-tl, 2),
        'avg_win':              round(tw / len(wins),   2) if wins  else 0,
        'avg_loss':             round(-tl / len(loses), 2) if loses else 0,
        'expectancy':           expectancy,
        'best_trade':           best_trade,
        'worst_trade':          worst_trade,
        'avg_hold_days':        avg_hold_days,
        'max_consec_wins':      max_cw,
        'max_consec_losses':    max_cl,
        # Score
        'strategy_score': _score(
            len(wins) / len(trades) * 100 if trades else 0,
            tw / tl if tl > 0 else 0,
            sharpe, max_dd_pct, len(trades), cagr_pct,
        ),
    }

    return {
        'chart_data':        df_to_chart(df.iloc[disp_idx:], chart_tf),
        'sma1':              series_to_line(sma1.iloc[disp_idx:], chart_tf),
        'sma2':              series_to_line(sma2.iloc[disp_idx:], chart_tf),
        'golden_crosses':    golden_crosses,
        'trades':            trades,
        'fibonacci_periods': fib_periods,
        'metrics':           metrics,
        'equity_curve':      equity_curve,
        'drawdown_curve':    drawdown_curve,
        'monthly_returns':   monthly_returns,
    }
