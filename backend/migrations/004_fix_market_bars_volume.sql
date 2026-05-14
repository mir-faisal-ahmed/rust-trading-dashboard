-- crypto volume is fractional (e.g. 1621.67 BTC), BIGINT loses precision
ALTER TABLE market_bars ALTER COLUMN volume TYPE NUMERIC(24, 8);
