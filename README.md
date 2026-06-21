# Trading Strategy Backtester

A localhost trading strategy backtester. Runs entirely on your machine with free market data — no API keys needed.

![Strategy Backtester](https://img.shields.io/badge/stack-FastAPI%20%2B%20React-blue) ![Data](https://img.shields.io/badge/data-yfinance%20(free)-green) ![Charts](https://img.shields.io/badge/charts-lightweight--charts%20v4-orange)

## Features

- **Candlestick + Heikin Ashi** chart with 9 timeframes (1min → 1month)
- **Golden Cross + Fibonacci Retracement** strategy with full configurability
- **S&P 500 batch mode** — run the strategy across all ~180 tickers in parallel and see aggregate results
- **Quant metrics** — Sharpe, Sortino, Calmar, CAGR, max drawdown, recovery factor, expectancy, and more
- **Strategy score (0–100)** — weighted ranking across win rate, profit factor, Sharpe, drawdown, and CAGR
- **Charts tab** — equity curve, drawdown %, monthly P&L heatmap, trade distribution histogram
- **Resizable results panel** — drag the handle up to expand, TradingView-style

## Strategy: Golden Cross + Fibonacci Retracement

1. Wait for the **4H 200 SMA** to cross above the **1D 200 SMA** (golden cross)
2. Look back 50 candles for the recent high → look back 100 more candles for the recent low
3. Draw Fibonacci levels between them (0 = high, 1 = low)
4. If price makes a **new high** before hitting 0.382, shift the entire fib up silently
5. **Scale in** on retracement:
   - Buy **1 share** at 0.382
   - Buy **2 shares** at 0.5
   - Buy **3 shares** at 0.618
6. **Stop loss** = avg entry − (Fib 0 − avg entry) / 2 &nbsp;(1:2 risk/reward)
7. **Take profit** = Fib 0 (recent high)
8. After any exit → wait for a **new golden cross** before re-entering

Fibonacci lines are only visible from the golden cross candle to the trade exit. They disappear completely after the sell.

## Quickstart

```bash
git clone https://github.com/ywookim15/strategy-backtester.git
cd strategy-backtester
chmod +x start.sh
./start.sh
```

`start.sh` will:
- Create a Python venv in `backend/venv/`
- Install Python dependencies
- Install Node dependencies
- Start the FastAPI backend on port 8000 and Vite dev server on port 5173
- Open the app in your browser

> **Requirements:** Python 3.9+, Node 18+

## Manual Setup

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + uvicorn |
| Market data | yfinance (free, no API key) |
| Frontend | React + Vite |
| Charts | lightweight-charts v4 (TradingView) |
| Data processing | pandas + numpy |

## Project Structure

```
strategy-backtester/
├── backend/
│   ├── main.py                          # FastAPI routes + S&P 500 ticker list
│   ├── data_fetcher.py                  # yfinance wrapper, 4H resampling, SMA alignment
│   ├── requirements.txt
│   └── strategies/
│       └── golden_cross_fibonacci.py    # Full strategy + metrics engine
├── frontend/
│   └── src/
│       ├── App.jsx                      # Layout, routing, resize logic
│       ├── App.css
│       └── components/
│           ├── Chart.jsx                # lightweight-charts, Heikin Ashi, overlays
│           ├── StrategyPanel.jsx        # Param form, Run Strategy, Run S&P 500
│           ├── ResultsPanel.jsx         # Score, charts, metrics, trades table
│           └── SearchBar.jsx            # Ticker autocomplete
└── start.sh
```

## Configuration

All parameters are adjustable in the UI:

| Parameter | Default | Description |
|---|---|---|
| Chart Timeframe | 1d | OHLCV resolution for the main chart |
| SMA 1 Length | 200 | Slower SMA period |
| SMA 1 Timeframe | 1d | Timeframe for SMA 1 |
| SMA 2 Length | 200 | Faster SMA period |
| SMA 2 Timeframe | 4h | Timeframe for SMA 2 |
| Lookback High | 50 | Candles to look back for recent high |
| Lookback Low | 100 | Candles before the high to find recent low |
| Backtest History | 2 years | How far back to display and backtest |
| Starting Capital | $10,000 | Per-ticker capital |

## Data Limitations

yfinance provides free data with some constraints:

- **4H / 1H data**: only available for the past ~2 years
- **Daily data**: available for 10+ years on most tickers
- The displayed chart window starts where both SMAs have valid data (no partial SMA coverage)

## Notes

- The S&P 500 batch run (~180 tickers) takes 60–90 seconds with 20 parallel threads
- Intraday timeframes (1m, 5m) have very limited history and may not produce golden cross signals
- The strategy score is computed per-ticker; batch mode shows a simplified score based on aggregate win rate, profit factor, and trade count
