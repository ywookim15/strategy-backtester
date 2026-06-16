from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf

from data_fetcher import fetch_ohlcv, df_to_chart
from strategies import golden_cross_fibonacci

app = FastAPI(title="Strategy Backtester API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SP500_SAMPLE = [
    "AAPL","MSFT","AMZN","NVDA","GOOGL","GOOG","META","TSLA","BRK.B","UNH",
    "LLY","JPM","XOM","JNJ","V","PG","MA","AVGO","HD","CVX","MRK","ABBV",
    "COST","PEP","KO","ADBE","WMT","CRM","BAC","TMO","MCD","CSCO","ACN","ABT",
    "NFLX","LIN","AMD","DHR","TXN","CMCSA","NEE","PM","VZ","ORCL","RTX","HON",
    "AMGN","UNP","IBM","LOW","INTU","CAT","SPGI","GS","QCOM","ELV","MDT","ISRG",
    "DE","BLK","AMAT","SYK","GILD","ADI","REGN","MMC","VRTX","ZTS","AXP","MDLZ",
    "CI","PLD","MO","TJX","C","EOG","DUK","SO","BDX","KLAC","AON","ITW","SNPS",
    "CME","WM","BSX","PGR","MCO","NOC","USB","ETN","SHW","FCX","EW","MAR","MPC",
    "GE","HCA","F","GM","SCHW","CL","FDX","NSC","WELL","CTAS","APH","HUM","ICE",
    "TGT","DXCM","EMR","PSA","TRV","ALL","AIG","PH","AFL","COF","CARR","OTIS",
    "FICO","IDXX","VRSK","GWW","WMB","NUE","ROK","A","FAST","YUM","KMB","ROP",
    "CTSH","IR","FANG","TEL","LHX","HES","CCI","DD","EQT","AVB","EXR","WAB",
    "DLR","PPL","ES","XEL","KEYS","AEP","PAYX","MTD","EIX","SWK","ODFL","STE",
    "BALL","TTWO","ZBH","WEC","MLM","VMC","PNR","PKI","DOV","HAL","OXY","CTRA",
    "DVN","MRO","HFC","APA","PSX","VLO","PXD","KMI","WMB","OKE","ET","EPD",
    "SPY","QQQ","IWM","DIA","VOO","GLD","SLV","TLT","HYG","LQD",
]

STRATEGIES = {
    "golden_cross_fibonacci": {
        "name": "Golden Cross + Fibonacci Retracement",
        "description": "Waits for a dual-timeframe golden cross, then scales into positions at Fibonacci retracement levels (0.382, 0.5, 0.618).",
        "params": [
            {"key": "chart_timeframe", "label": "Chart Timeframe", "type": "select",
             "options": ["1m","5m","15m","30m","1h","4h","1d","1w","1M"], "default": "1d"},
            {"key": "sma1_length",    "label": "SMA 1 Length",     "type": "number", "default": 200, "min": 5, "max": 500},
            {"key": "sma1_timeframe", "label": "SMA 1 Timeframe",  "type": "select",
             "options": ["1m","5m","15m","30m","1h","4h","1d","1w","1M"], "default": "1d"},
            {"key": "sma2_length",    "label": "SMA 2 Length",     "type": "number", "default": 200, "min": 5, "max": 500},
            {"key": "sma2_timeframe", "label": "SMA 2 Timeframe",  "type": "select",
             "options": ["1m","5m","15m","30m","1h","4h","1d","1w","1M"], "default": "4h"},
            {"key": "lookback_high",   "label": "Lookback for Recent High (candles)", "type": "number", "default": 50,  "min": 5,  "max": 200},
            {"key": "lookback_low",    "label": "Lookback for Recent Low (candles)",  "type": "number", "default": 100, "min": 5,  "max": 300},
            {"key": "lookback_years",  "label": "Backtest History (years, 0=all)",    "type": "number", "default": 10,  "min": 0,  "max": 30},
        ],
    }
}


class BacktestRequest(BaseModel):
    strategy: str
    ticker: str
    params: dict


@app.get("/api/tickers")
def get_tickers():
    return {"tickers": sorted(set(SP500_SAMPLE))}


@app.get("/api/strategies")
def get_strategies():
    return {"strategies": STRATEGIES}


@app.get("/api/chart-data")
def get_chart_data(ticker: str = Query(...), timeframe: str = Query("1d")):
    try:
        df = fetch_ohlcv(ticker.upper(), timeframe)
        return {"data": df_to_chart(df, timeframe)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/backtest")
def run_backtest(req: BacktestRequest):
    try:
        req.params['ticker'] = req.ticker.upper()
        if req.strategy == "golden_cross_fibonacci":
            result = golden_cross_fibonacci.run(req.params)
            return result
        raise HTTPException(status_code=400, detail=f"Unknown strategy: {req.strategy}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/backtest-all")
def run_backtest_all(req: BacktestRequest):
    """Run strategy on every ticker in SP500_SAMPLE; returns aggregate results without chart data."""
    tickers = sorted(set(SP500_SAMPLE))

    def run_one(ticker):
        try:
            p = {**req.params, 'ticker': ticker}
            if req.strategy == "golden_cross_fibonacci":
                return ticker, golden_cross_fibonacci.run(p)
            return ticker, None
        except Exception:
            return ticker, None

    all_trades   = []
    total_crosses = 0
    ok_count     = 0

    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(run_one, t): t for t in tickers}
        for fut in as_completed(futures):
            ticker, result = fut.result()
            if result:
                ok_count     += 1
                total_crosses += result['metrics']['total_golden_crosses']
                for trade in result['trades']:
                    trade['ticker'] = ticker
                all_trades.extend(result['trades'])

    all_trades.sort(key=lambda t: t['entries'][0]['time'] if t['entries'] else '')

    wins  = [t for t in all_trades if t['pnl'] > 0]
    loses = [t for t in all_trades if t['pnl'] <= 0]
    tw    = sum(t['pnl'] for t in wins)
    tl    = abs(sum(t['pnl'] for t in loses))

    wr  = round(len(wins) / len(all_trades) * 100, 1) if all_trades else 0
    pf  = round(tw / tl, 2) if tl > 0 else None

    def _batch_score(wr, pf, avg_w, avg_l, n):
        s  = min(25, max(0, (wr - 45) / 25 * 25))
        s += min(35, max(0, ((pf or 0) - 1.0) / 1.5 * 35))
        rr = avg_w / avg_l if avg_l > 0 else 0
        s += min(25, max(0, (rr - 1) / 2 * 25))
        s += min(15, n / 50 * 15)
        return round(min(100, max(0, s)))

    avg_w = round(tw / len(wins),   2) if wins  else 0
    avg_l = round(-tl / len(loses), 2) if loses else 0

    metrics = {
        'tickers_analyzed':    ok_count,
        'total_golden_crosses': total_crosses,
        'total_trades':         len(all_trades),
        'winning_trades':       len(wins),
        'losing_trades':        len(loses),
        'win_rate':             wr,
        'net_pnl':              round(sum(t['pnl'] for t in all_trades), 2),
        'gross_profit':         round(tw, 2),
        'gross_loss':           round(-tl, 2),
        'profit_factor':        pf,
        'avg_win':              avg_w,
        'avg_loss':             avg_l,
        'expectancy':           round(sum(t['pnl'] for t in all_trades) / len(all_trades), 2) if all_trades else 0,
        'best_trade':           round(max(t['pnl'] for t in all_trades), 2) if all_trades else 0,
        'worst_trade':          round(min(t['pnl'] for t in all_trades), 2) if all_trades else 0,
        'starting_capital':     float(req.params.get('starting_capital', 10000)),
        'strategy_score':       _batch_score(wr, pf, avg_w, avg_l, len(all_trades)),
    }

    return {
        'batch':             True,
        'chart_data':        None,
        'sma1':              None,
        'sma2':              None,
        'golden_crosses':    [],
        'fibonacci_periods': [],
        'trades':            all_trades,
        'metrics':           metrics,
    }
