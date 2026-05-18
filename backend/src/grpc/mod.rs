pub mod finrl {
    tonic::include_proto!("finrl");
}

use std::collections::HashMap;
use tonic::transport::Channel;

use finrl::fin_rl_service_client::FinRlServiceClient;
use finrl::{HealthCheckRequest, LoadModelRequest, PredictRequest};

pub struct FinRLClient {
    client: FinRlServiceClient<Channel>,
}

impl FinRLClient {
    pub async fn connect(endpoint: &str) -> Result<Self, tonic::transport::Error> {
        let client = FinRlServiceClient::connect(endpoint.to_string()).await?;
        Ok(Self { client })
    }

    pub async fn predict_weights(
        &mut self,
        model_id: &str,
        features: Vec<f64>,
        symbols: Vec<String>,
    ) -> Result<HashMap<String, f64>, tonic::Status> {
        let req = tonic::Request::new(PredictRequest {
            model_id: model_id.to_string(),
            features,
            symbols,
        });
        let resp = self.client.predict_weights(req).await?;
        Ok(resp.into_inner().weights)
    }

    pub async fn load_model(
        &mut self,
        model_id: &str,
        checkpoint_path: &str,
    ) -> Result<bool, tonic::Status> {
        let req = tonic::Request::new(LoadModelRequest {
            model_id: model_id.to_string(),
            checkpoint_path: checkpoint_path.to_string(),
        });
        let resp = self.client.load_model(req).await?;
        Ok(resp.into_inner().success)
    }

    pub async fn health_check(&mut self) -> Result<bool, tonic::Status> {
        let req = tonic::Request::new(HealthCheckRequest {});
        let resp = self.client.health_check(req).await?;
        Ok(resp.into_inner().healthy)
    }
}
