# Paper Trading Tool - Frontend

React component module for simulated trading with account, positions, and order management.

## Overview

The Paper Trading frontend provides:
- **Account Panel**: Cash, equity, buying power display
- **Positions Table**: Current holdings with P&L
- **Order Form**: Submit buy/sell orders
- **Order History**: All orders with status
- **Portfolio Monitor**: Real-time equity tracking

## Component Structure

```
frontend/src/tools/paper_trading/
├── index.ts                    # Public exports
├── PaperTradingTypes.ts        # TypeScript types
├── PaperTradingHooks.ts        # React hooks
├── PaperTradingView.tsx        # Main container
├── AccountPanel.tsx            # Account display
├── PositionsTable.tsx          # Holdings table
├── OrderForm.tsx               # Order submission
├── OrderHistory.tsx            # Order list
├── README.md                   # This file
└── __tests__/                  # Jest tests
```

## Usage

```tsx
import { PaperTradingView } from "@/tools/paper_trading";

export function TradingPage() {
  return <PaperTradingView />;
}
```

## Features

### Account Panel
- Cash balance
- Total equity
- Buying power
- Portfolio value
- Updated in real-time

### Positions Table
- Symbol
- Quantity held
- Entry price
- Current price
- Unrealized P&L
- Unrealized P&L %
- Quick close/sell buttons

### Order Form
- Symbol input (with autocomplete)
- Side selector (buy/sell)
- Quantity input
- Order type (market/limit)
- Limit price (if applicable)
- Submit button

### Order History
- Order ID
- Symbol
- Side
- Quantity / Filled Qty
- Status (pending, filled, rejected, cancelled)
- Price
- Created/Filled timestamp

## Types

```typescript
export interface PaperAccount {
  cash: number;
  total_equity: number;
  buying_power: number;
  portfolio_value: number;
  created_at: string;
}

export interface PaperPosition {
  symbol: string;
  qty: number;
  entry_price: number;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  created_at: string;
}

export interface PaperOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  filled_qty: number;
  status: "pending" | "filled" | "rejected" | "cancelled";
  order_type: "market" | "limit";
  limit_price?: number;
  fill_price?: number;
  created_at: string;
  filled_at?: string;
}
```

## Common Tasks

### Submit Market Order
```tsx
const { submitOrder } = usePaperTrading();

submitOrder({
  symbol: "AAPL",
  side: "buy",
  qty: "10",
  type: "market",
});
```

### Close Position
```tsx
const { closePosition } = usePaperTrading();

closePosition("AAPL", "5");  // Sell 5 shares
```

### Monitor Portfolio
```tsx
const { account, positions } = usePaperTradingData();

console.log(`Cash: $${account?.cash}`);
console.log(`Equity: $${account?.total_equity}`);
console.log(`Open Positions: ${positions?.length}`);
```

## Hooks

### `usePaperTradingData()`
Fetch account and positions data.

```typescript
const { account, positions, loading } = usePaperTradingData();
```

### `usePaperTrading()`
Trading operations (submit order, close position).

```typescript
const { submitOrder, closePosition, closeAll } = usePaperTrading();
```

### `usePaperOrderHistory()`
Fetch order history.

```typescript
const { orders, loading } = usePaperOrderHistory({ status: "all" });
```

## Testing

```bash
npm test -- --testPathPattern=paper_trading
```

## Integration

Works with:
- **Benchmarking Tool**: Replay benchmark trades
- **Strategies Tool**: Execute strategy signals

