# Market Data Tool - Frontend

React component module for market data fetching, caching, and visualization.

## Overview

The Market Data frontend provides:
- **Data Fetcher**: Queue historical bar fetches
- **Status Panel**: API usage, cache health, available symbols
- **Bar Chart**: OHLCV visualization with technical indicators
- **Data Export**: Download bars as CSV/JSON

## Component Structure

```
frontend/src/tools/market_data/
├── index.ts                 # Public exports
├── MarketDataTypes.ts       # TypeScript types
├── MarketDataHooks.ts       # React hooks
├── MarketDataView.tsx       # Main container
├── BarChart.tsx             # OHLCV chart
├── DataFetcher.tsx          # Fetch control
├── StatusPanel.tsx          # API/cache status
├── README.md                # This file
└── __tests__/               # Jest tests
```

## Usage

```tsx
import { MarketDataView, BarChart } from "@/tools/market_data";

export function DataPage() {
  return (
    <>
      <DataFetcher />
      <BarChart symbol="AAPL" timeframe="1day" />
    </>
  );
}
```

## Features

### Data Fetcher
- Symbol input with autocomplete
- Date range pickers
- Timeframe selector (1min, 5min, 15min, 1hour, 1day)
- "Fetch Data" button
- Progress indicator

### Status Panel
- API request count / limit
- Last update time
- Cached symbols list
- Cache size
- Connection status

### Bar Chart
- OHLCV candlestick chart
- Volume bars below price
- Technical indicator overlays (SMA, RSI, ATR)
- Interactive zooming/panning
- Tooltip with OHLCV details

### Data Export
- CSV export
- JSON export
- Custom date range
- Download button

## Types

```typescript
export interface BarData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataStatus {
  account_status: string;
  data_available: boolean;
  last_update: string;
  cached_symbols: string[];
  api_requests_today: number;
  api_limit: number;
  next_reset: string;
}
```

## Common Tasks

### Fetch Historical Data
```tsx
const { fetch } = useMarketData();

fetch({
  symbol: "AAPL",
  timeframe: "1day",
  start: "2024-01-01",
  end: "2024-12-31",
});
```

### Display Bar Chart
```tsx
<BarChart
  symbol="AAPL"
  timeframe="1day"
  limit={252}
  showIndicators={true}
/>
```

### Export Data
```tsx
const { export: exportData } = useMarketData();

exportData({
  symbol: "AAPL",
  format: "csv",
  start: "2024-01-01",
  end: "2024-12-31",
});
```

## Hooks

### `useMarketData()`
Fetch and cache market data.

```typescript
const { fetch, data, loading } = useMarketData();
// data: BarData[]
```

### `useMarketDataStatus()`
Get API and cache status.

```typescript
const { status, refresh } = useMarketDataStatus();
```

## Testing

```bash
npm test -- --testPathPattern=market_data
```

## Integration

Works with:
- **Benchmarking Tool**: Auto-fetch data before runs
- **Strategies Tool**: View strategy performance vs market
- **Live Trading Tool**: Display current market prices

## Performance Tips

- **Cache Local**: Use IndexedDB for large datasets
- **Paginate Charts**: Show 100-bar windows
- **Debounce Requests**: Avoid duplicate API calls

