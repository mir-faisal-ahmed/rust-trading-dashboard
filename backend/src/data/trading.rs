//! Alpaca Paper Trading API client.
//! Handles order placement, position tracking, and account management
//! for the Alpaca paper trading environment.

use chrono::{DateTime, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlpacaAccount {
    pub id: String,
    pub account_number: String,
    pub status: String,
    pub currency: String,
    pub buying_power: String,
    pub cash: String,
    pub portfolio_value: String,
    pub equity: String,
    pub last_equity: String,
    pub long_market_value: String,
    pub short_market_value: String,
    pub initial_margin: String,
    pub maintenance_margin: String,
    pub daytrade_count: i32,
    pub pattern_day_trader: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub asset_id: String,
    pub symbol: String,
    pub exchange: String,
    pub asset_class: String,
    pub qty: String,
    pub side: String,
    pub market_value: String,
    pub cost_basis: String,
    pub unrealized_pl: String,
    pub unrealized_plpc: String,
    pub current_price: String,
    pub lastday_price: String,
    pub change_today: String,
    pub avg_entry_price: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub id: String,
    pub client_order_id: String,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub submitted_at: Option<String>,
    pub filled_at: Option<String>,
    pub symbol: String,
    pub asset_class: String,
    pub qty: Option<String>,
    pub notional: Option<String>,
    pub filled_qty: String,
    pub filled_avg_price: Option<String>,
    #[serde(rename = "type")]
    pub order_type: String,
    pub side: String,
    pub time_in_force: String,
    pub limit_price: Option<String>,
    pub stop_price: Option<String>,
    pub status: String,
    pub trail_percent: Option<String>,
    pub trail_price: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderRequest {
    pub symbol: String,
    pub qty: Option<String>,
    pub notional: Option<String>,
    pub side: String,          // "buy" | "sell"
    pub r#type: String,        // "market" | "limit" | "stop" | "stop_limit" | "trailing_stop"
    pub time_in_force: String, // "day" | "gtc" | "ioc" | "fok"
    pub limit_price: Option<String>,
    pub stop_price: Option<String>,
    pub trail_percent: Option<String>,
    pub trail_price: Option<String>,
    pub client_order_id: Option<String>,
    pub extended_hours: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClosePositionRequest {
    pub qty: Option<String>,
    pub percentage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioHistory {
    pub timestamp: Vec<i64>,
    pub equity: Vec<f64>,
    pub profit_loss: Vec<f64>,
    pub profit_loss_pct: Vec<f64>,
    pub base_value: f64,
    pub timeframe: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub activity_type: String,
    pub symbol: Option<String>,
    pub side: Option<String>,
    pub qty: Option<String>,
    pub price: Option<String>,
    pub cum_qty: Option<String>,
    pub transaction_time: Option<String>,
    pub order_id: Option<String>,
}

// ─── Paper Trading State ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperTradingState {
    pub connected: bool,
    pub account: Option<AlpacaAccount>,
    pub positions: Vec<Position>,
    pub open_orders: Vec<Order>,
    pub last_sync: Option<DateTime<Utc>>,
}

impl Default for PaperTradingState {
    fn default() -> Self {
        Self {
            connected: false,
            account: None,
            positions: Vec::new(),
            open_orders: Vec::new(),
            last_sync: None,
        }
    }
}

// ─── Paper Trading Client ────────────────────────────────────────────────────

#[derive(Clone)]
pub struct PaperTradingClient {
    client: Client,
    base_url: String,
    api_key: String,
    api_secret: String,
    pub state: Arc<RwLock<PaperTradingState>>,
}

impl PaperTradingClient {
    pub fn new(api_key: String, api_secret: String, base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
            api_key,
            api_secret,
            state: Arc::new(RwLock::new(PaperTradingState::default())),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.api_key.is_empty() && !self.api_secret.is_empty()
    }

    fn auth_headers(&self) -> Vec<(&'static str, &str)> {
        vec![
            ("APCA-API-KEY-ID", self.api_key.as_str()),
            ("APCA-API-SECRET-KEY", self.api_secret.as_str()),
        ]
    }

    // ── Account ──────────────────────────────────────────────────────────

    pub async fn get_account(&self) -> Result<AlpacaAccount, String> {
        let resp = self
            .client
            .get(format!("{}/v2/account", self.base_url))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<AlpacaAccount>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    // ── Positions ────────────────────────────────────────────────────────

    pub async fn get_positions(&self) -> Result<Vec<Position>, String> {
        let resp = self
            .client
            .get(format!("{}/v2/positions", self.base_url))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<Vec<Position>>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    pub async fn close_position(
        &self,
        symbol: &str,
        req: &ClosePositionRequest,
    ) -> Result<Order, String> {
        let mut url = format!("{}/v2/positions/{}", self.base_url, symbol);
        let mut params = Vec::new();
        if let Some(ref qty) = req.qty {
            params.push(format!("qty={}", qty));
        }
        if let Some(ref pct) = req.percentage {
            params.push(format!("percentage={}", pct));
        }
        if !params.is_empty() {
            url.push('?');
            url.push_str(&params.join("&"));
        }

        let resp = self
            .client
            .delete(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<Order>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    pub async fn close_all_positions(&self) -> Result<Vec<Order>, String> {
        let resp = self
            .client
            .delete(format!("{}/v2/positions", self.base_url))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<Vec<Order>>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    // ── Orders ───────────────────────────────────────────────────────────

    pub async fn submit_order(&self, order: &OrderRequest) -> Result<Order, String> {
        let resp = self
            .client
            .post(format!("{}/v2/orders", self.base_url))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .json(order)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<Order>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    pub async fn get_orders(
        &self,
        status: &str,
        limit: i32,
    ) -> Result<Vec<Order>, String> {
        let resp = self
            .client
            .get(format!(
                "{}/v2/orders?status={}&limit={}&direction=desc",
                self.base_url, status, limit
            ))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status_code = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status_code, body));
        }

        resp.json::<Vec<Order>>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    pub async fn cancel_order(&self, order_id: &str) -> Result<(), String> {
        let resp = self
            .client
            .delete(format!("{}/v2/orders/{}", self.base_url, order_id))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        Ok(())
    }

    pub async fn cancel_all_orders(&self) -> Result<(), String> {
        let resp = self
            .client
            .delete(format!("{}/v2/orders", self.base_url))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        Ok(())
    }

    // ── Portfolio History ─────────────────────────────────────────────────

    pub async fn get_portfolio_history(
        &self,
        period: &str,
        timeframe: &str,
    ) -> Result<PortfolioHistory, String> {
        let resp = self
            .client
            .get(format!(
                "{}/v2/account/portfolio/history?period={}&timeframe={}",
                self.base_url, period, timeframe
            ))
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<PortfolioHistory>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    // ── Activities ───────────────────────────────────────────────────────

    pub async fn get_activities(
        &self,
        activity_type: Option<&str>,
        limit: i32,
    ) -> Result<Vec<Activity>, String> {
        let mut url = format!("{}/v2/account/activities", self.base_url);
        if let Some(at) = activity_type {
            url.push('/');
            url.push_str(at);
        }
        url.push_str(&format!("?direction=desc&page_size={}", limit));

        let resp = self
            .client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| format!("request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("alpaca returned {}: {}", status, body));
        }

        resp.json::<Vec<Activity>>()
            .await
            .map_err(|e| format!("parse error: {}", e))
    }

    // ── Sync State ───────────────────────────────────────────────────────

    /// Refresh all paper trading state from Alpaca API.
    pub async fn sync_state(&self) -> Result<PaperTradingState, String> {
        let account = self.get_account().await?;
        let positions = self.get_positions().await?;
        let open_orders = self.get_orders("open", 50).await?;

        let state = PaperTradingState {
            connected: true,
            account: Some(account),
            positions,
            open_orders,
            last_sync: Some(Utc::now()),
        };

        let mut locked = self.state.write().await;
        *locked = state.clone();
        Ok(state)
    }
}
