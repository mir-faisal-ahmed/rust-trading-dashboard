// Performance metrics computation.
// All calculations follow standard quantitative finance definitions.

/// Compute annualized Sharpe ratio from a series of daily returns.
/// Uses excess returns over the risk-free rate.
pub fn sharpe_ratio(daily_returns: &[f64], risk_free_annual: f64) -> f64 {
    if daily_returns.is_empty() {
        return 0.0;
    }
    let rf_daily = risk_free_annual / 252.0;
    let excess: Vec<f64> = daily_returns.iter().map(|r| r - rf_daily).collect();
    let mean = excess.iter().sum::<f64>() / excess.len() as f64;
    let variance = excess.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / excess.len() as f64;
    let std_dev = variance.sqrt();
    if std_dev == 0.0 {
        return 0.0;
    }
    (mean / std_dev) * (252.0_f64).sqrt()
}

/// Compute annualized Sortino ratio using downside deviation only.
pub fn sortino_ratio(daily_returns: &[f64], risk_free_annual: f64) -> f64 {
    if daily_returns.is_empty() {
        return 0.0;
    }
    let rf_daily = risk_free_annual / 252.0;
    let excess: Vec<f64> = daily_returns.iter().map(|r| r - rf_daily).collect();
    let mean = excess.iter().sum::<f64>() / excess.len() as f64;
    let downside_sq: Vec<f64> = excess.iter().map(|r| if *r < 0.0 { r.powi(2) } else { 0.0 }).collect();
    let downside_dev = (downside_sq.iter().sum::<f64>() / downside_sq.len() as f64).sqrt();
    if downside_dev == 0.0 {
        return 0.0;
    }
    (mean / downside_dev) * (252.0_f64).sqrt()
}

/// Compute maximum drawdown from an equity curve.
/// Returns a negative percentage (e.g., -0.15 for 15% drawdown).
pub fn max_drawdown(equity_curve: &[f64]) -> (f64, usize) {
    if equity_curve.is_empty() {
        return (0.0, 0);
    }
    let mut peak = equity_curve[0];
    let mut max_dd = 0.0;
    let mut max_dd_duration = 0;
    let mut current_dd_start = 0;

    for (i, &value) in equity_curve.iter().enumerate() {
        if value > peak {
            peak = value;
            current_dd_start = i;
        }
        let dd = (value - peak) / peak;
        if dd < max_dd {
            max_dd = dd;
            max_dd_duration = i - current_dd_start;
        }
    }
    (max_dd, max_dd_duration)
}

/// Compute annualized volatility from daily returns.
pub fn annualized_volatility(daily_returns: &[f64]) -> f64 {
    if daily_returns.is_empty() {
        return 0.0;
    }
    let mean = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
    let variance = daily_returns
        .iter()
        .map(|r| (r - mean).powi(2))
        .sum::<f64>()
        / daily_returns.len() as f64;
    variance.sqrt() * (252.0_f64).sqrt()
}

/// Compute win rate from a series of trade PnLs.
pub fn win_rate(trade_pnls: &[f64]) -> f64 {
    if trade_pnls.is_empty() {
        return 0.0;
    }
    let wins = trade_pnls.iter().filter(|&&pnl| pnl > 0.0).count();
    wins as f64 / trade_pnls.len() as f64
}

/// Compute profit factor (gross profits / gross losses).
pub fn profit_factor(trade_pnls: &[f64]) -> f64 {
    let gross_profit: f64 = trade_pnls.iter().filter(|&&p| p > 0.0).sum();
    let gross_loss: f64 = trade_pnls.iter().filter(|&&p| p < 0.0).map(|p| p.abs()).sum();
    if gross_loss == 0.0 {
        return f64::INFINITY;
    }
    gross_profit / gross_loss
}

/// Compute VaR at given confidence level using historical method.
pub fn value_at_risk(daily_returns: &[f64], confidence: f64) -> f64 {
    if daily_returns.is_empty() {
        return 0.0;
    }
    let mut sorted = daily_returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let idx = ((1.0 - confidence) * sorted.len() as f64).floor() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Compute Conditional VaR (Expected Shortfall) at given confidence level.
pub fn conditional_var(daily_returns: &[f64], confidence: f64) -> f64 {
    if daily_returns.is_empty() {
        return 0.0;
    }
    let mut sorted = daily_returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let cutoff = ((1.0 - confidence) * sorted.len() as f64).floor() as usize;
    let tail: &[f64] = &sorted[..cutoff.max(1)];
    tail.iter().sum::<f64>() / tail.len() as f64
}

/// Sample skewness of a return series.
pub fn skewness(returns: &[f64]) -> f64 {
    let n = returns.len() as f64;
    if n < 3.0 {
        return 0.0;
    }
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / n;
    let std = variance.sqrt();
    if std == 0.0 {
        return 0.0;
    }
    let m3 = returns.iter().map(|r| ((r - mean) / std).powi(3)).sum::<f64>() / n;
    m3 * (n * (n - 1.0)).sqrt() / (n - 2.0)
}

/// Excess kurtosis of a return series.
pub fn kurtosis(returns: &[f64]) -> f64 {
    let n = returns.len() as f64;
    if n < 4.0 {
        return 0.0;
    }
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / n;
    let std = variance.sqrt();
    if std == 0.0 {
        return 0.0;
    }
    returns.iter().map(|r| ((r - mean) / std).powi(4)).sum::<f64>() / n - 3.0
}

/// CAPM beta and annualised alpha (alpha returned as percentage).
pub fn beta_and_alpha(
    strategy: &[f64],
    benchmark: &[f64],
    risk_free_annual: f64,
) -> (f64, f64) {
    let n = strategy.len().min(benchmark.len());
    if n < 2 {
        return (1.0, 0.0);
    }
    let s = &strategy[..n];
    let b = &benchmark[..n];
    let s_mean = s.iter().sum::<f64>() / n as f64;
    let b_mean = b.iter().sum::<f64>() / n as f64;
    let cov = (0..n).map(|i| (s[i] - s_mean) * (b[i] - b_mean)).sum::<f64>() / n as f64;
    let b_var = (0..n).map(|i| (b[i] - b_mean).powi(2)).sum::<f64>() / n as f64;
    let beta = if b_var == 0.0 { 1.0 } else { cov / b_var };
    let rf_daily = risk_free_annual / 252.0;
    let s_ann = (1.0 + s_mean - rf_daily).powi(252) - 1.0;
    let b_ann = (1.0 + b_mean - rf_daily).powi(252) - 1.0;
    let alpha = s_ann - beta * b_ann;
    (beta, alpha * 100.0)
}

/// Omega ratio: sum of gains above `threshold` / sum of losses below.
pub fn omega_ratio(returns: &[f64], threshold: f64) -> f64 {
    let gains: f64 = returns.iter().map(|&r| (r - threshold).max(0.0)).sum();
    let losses: f64 = returns.iter().map(|&r| (threshold - r).max(0.0)).sum();
    if losses == 0.0 {
        f64::INFINITY
    } else {
        gains / losses
    }
}

/// Tail ratio: 95th percentile return / |5th percentile return|.
pub fn tail_ratio(returns: &[f64]) -> f64 {
    if returns.len() < 20 {
        return 1.0;
    }
    let mut sorted = returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = sorted.len();
    let p95 = sorted[(n as f64 * 0.95) as usize];
    let p05 = sorted[(n as f64 * 0.05) as usize];
    if p05.abs() < 1e-10 {
        1.0
    } else {
        p95 / p05.abs()
    }
}

/// Annualised information ratio vs a benchmark.
pub fn information_ratio(strategy: &[f64], benchmark: &[f64]) -> f64 {
    let n = strategy.len().min(benchmark.len());
    if n == 0 {
        return 0.0;
    }
    let active: Vec<f64> = (0..n).map(|i| strategy[i] - benchmark[i]).collect();
    let mean = active.iter().sum::<f64>() / n as f64;
    let tracking_error = {
        let var = active.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / n as f64;
        var.sqrt() * (252.0_f64).sqrt()
    };
    if tracking_error == 0.0 {
        return 0.0;
    }
    let ann = (1.0 + mean).powi(252) - 1.0;
    ann / tracking_error
}
