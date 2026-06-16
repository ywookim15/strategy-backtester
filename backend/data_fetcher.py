import yfinance as yf
import pandas as pd
from typing import Tuple

TIMEFRAME_CONFIG = {
    '1m':  ('1m',  '7d'),
    '5m':  ('5m',  '60d'),
    '15m': ('15m', '60d'),
    '30m': ('30m', '60d'),
    '1h':  ('1h',  '730d'),
    '4h':  ('1h',  '730d'),
    '1d':  ('1d',  '10y'),
    '1w':  ('1wk', 'max'),
    '1M':  ('1mo', 'max'),
}

def fetch_ohlcv(ticker: str, timeframe: str) -> pd.DataFrame:
    yf_interval, period = TIMEFRAME_CONFIG.get(timeframe, ('1d', '10y'))
    t = yf.Ticker(ticker)
    df = t.history(period=period, interval=yf_interval)
    if df.empty:
        raise ValueError(f"No data returned for {ticker} / {timeframe}")
    df.columns = [c.lower() for c in df.columns]
    df = df[['open', 'high', 'low', 'close', 'volume']].copy()
    # Normalize timezone
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)
    if timeframe == '4h':
        df = _resample_4h(df)
    return df

def _resample_4h(df: pd.DataFrame) -> pd.DataFrame:
    return df.resample('4h').agg({
        'open': 'first', 'high': 'max', 'low': 'min',
        'close': 'last', 'volume': 'sum'
    }).dropna()

def align_series(src: pd.Series, target_index: pd.DatetimeIndex) -> pd.Series:
    if src.index.tz is not None:
        src.index = src.index.tz_localize(None)
    return src.reindex(target_index, method='ffill')

def format_time(ts: pd.Timestamp, timeframe: str) -> str | int:
    if timeframe in ('1d', '1w', '1M'):
        return ts.strftime('%Y-%m-%d')
    return int(ts.timestamp())

def df_to_chart(df: pd.DataFrame, timeframe: str) -> list:
    result = []
    for ts, row in df.iterrows():
        result.append({
            'time': format_time(ts, timeframe),
            'open': round(float(row['open']), 4),
            'high': round(float(row['high']), 4),
            'low': round(float(row['low']), 4),
            'close': round(float(row['close']), 4),
        })
    return result

def series_to_line(s: pd.Series, timeframe: str) -> list:
    result = []
    for ts, val in s.items():
        if pd.notna(val):
            result.append({'time': format_time(ts, timeframe), 'value': round(float(val), 4)})
    return result
