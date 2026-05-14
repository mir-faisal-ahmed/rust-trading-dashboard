/// Simple Moving Average.
pub fn sma(values: &[f64], period: usize) -> Vec<f64> {
    let n = values.len();
    let mut result = vec![f64::NAN; n];
    if n < period {
        return result;
    }
    let mut sum: f64 = values[..period].iter().sum();
    result[period - 1] = sum / period as f64;
    for i in period..n {
        sum += values[i] - values[i - period];
        result[i] = sum / period as f64;
    }
    result
}

/// Exponential Moving Average.
/// Seeds with the SMA of the first contiguous window of `period` finite values,
/// correctly handling inputs like MACD line that have leading NaN entries.
pub fn ema(values: &[f64], period: usize) -> Vec<f64> {
    let n = values.len();
    let mut result = vec![f64::NAN; n];
    if n < period {
        return result;
    }
    // Find the earliest start index where all `period` values are finite.
    let mut start = 0;
    'outer: loop {
        if start + period > n {
            return result;
        }
        for v in &values[start..start + period] {
            if !v.is_finite() {
                start += 1;
                continue 'outer;
            }
        }
        break;
    }
    let k = 2.0 / (period as f64 + 1.0);
    let seed: f64 = values[start..start + period].iter().sum::<f64>() / period as f64;
    result[start + period - 1] = seed;
    for i in (start + period)..n {
        if values[i].is_finite() && result[i - 1].is_finite() {
            result[i] = values[i] * k + result[i - 1] * (1.0 - k);
        }
    }
    result
}

/// Wilder RSI. Returns values in [0, 100]; NaN until warm-up completes.
pub fn rsi(closes: &[f64], period: usize) -> Vec<f64> {
    let n = closes.len();
    let mut result = vec![f64::NAN; n];
    if n <= period {
        return result;
    }
    let mut avg_gain = 0.0_f64;
    let mut avg_loss = 0.0_f64;
    for i in 1..=period {
        let d = closes[i] - closes[i - 1];
        if d > 0.0 {
            avg_gain += d;
        } else {
            avg_loss += -d;
        }
    }
    avg_gain /= period as f64;
    avg_loss /= period as f64;
    result[period] = 100.0 - 100.0 / (1.0 + if avg_loss == 0.0 { 1e9 } else { avg_gain / avg_loss });
    for i in (period + 1)..n {
        let d = closes[i] - closes[i - 1];
        let gain = if d > 0.0 { d } else { 0.0 };
        let loss = if d < 0.0 { -d } else { 0.0 };
        avg_gain = (avg_gain * (period as f64 - 1.0) + gain) / period as f64;
        avg_loss = (avg_loss * (period as f64 - 1.0) + loss) / period as f64;
        result[i] =
            100.0 - 100.0 / (1.0 + if avg_loss == 0.0 { 1e9 } else { avg_gain / avg_loss });
    }
    result
}

/// MACD — returns (macd_line, signal_line, histogram).
pub fn macd(
    closes: &[f64],
    fast: usize,
    slow: usize,
    signal: usize,
) -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let ema_fast = ema(closes, fast);
    let ema_slow = ema(closes, slow);
    let n = closes.len();
    let mut macd_line = vec![f64::NAN; n];
    for i in 0..n {
        if ema_fast[i].is_finite() && ema_slow[i].is_finite() {
            macd_line[i] = ema_fast[i] - ema_slow[i];
        }
    }
    let signal_line = ema(&macd_line, signal);
    let mut histogram = vec![f64::NAN; n];
    for i in 0..n {
        if macd_line[i].is_finite() && signal_line[i].is_finite() {
            histogram[i] = macd_line[i] - signal_line[i];
        }
    }
    (macd_line, signal_line, histogram)
}

/// Bollinger Bands — returns (upper, middle, lower, pct_b).
pub fn bollinger_bands(
    closes: &[f64],
    period: usize,
    num_std: f64,
) -> (Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>) {
    let n = closes.len();
    let middle = sma(closes, period);
    let mut upper = vec![f64::NAN; n];
    let mut lower = vec![f64::NAN; n];
    let mut pct_b = vec![f64::NAN; n];
    for i in (period - 1)..n {
        let slice = &closes[i + 1 - period..=i];
        let mean = middle[i];
        let std = (slice.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / period as f64).sqrt();
        upper[i] = mean + num_std * std;
        lower[i] = mean - num_std * std;
        if (upper[i] - lower[i]).abs() > 1e-10 {
            pct_b[i] = (closes[i] - lower[i]) / (upper[i] - lower[i]);
        }
    }
    (upper, middle, lower, pct_b)
}

/// Wilder's Average True Range.
pub fn atr(highs: &[f64], lows: &[f64], closes: &[f64], period: usize) -> Vec<f64> {
    let n = closes.len();
    let mut result = vec![f64::NAN; n];
    if n == 0 {
        return result;
    }
    let mut tr = vec![0.0_f64; n];
    tr[0] = highs[0] - lows[0];
    for i in 1..n {
        tr[i] = (highs[i] - lows[i])
            .max((highs[i] - closes[i - 1]).abs())
            .max((lows[i] - closes[i - 1]).abs());
    }
    if n < period {
        return result;
    }
    let seed: f64 = tr[..period].iter().sum::<f64>() / period as f64;
    result[period - 1] = seed;
    for i in period..n {
        result[i] = (result[i - 1] * (period as f64 - 1.0) + tr[i]) / period as f64;
    }
    result
}
