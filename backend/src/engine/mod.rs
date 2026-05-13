pub mod executor;
pub mod metrics;

use std::sync::Mutex;
use uuid::Uuid;

/// Shared state for the benchmark execution engine.
/// Holds queued run IDs and tracks currently executing runs.
pub struct EngineState {
    queue: Mutex<Vec<Uuid>>,
    running: Mutex<Vec<Uuid>>,
    max_concurrent: usize,
}

impl EngineState {
    pub fn new() -> Self {
        let max_concurrent = std::env::var("MAX_CONCURRENT_RUNS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(4);

        Self {
            queue: Mutex::new(Vec::new()),
            running: Mutex::new(Vec::new()),
            max_concurrent,
        }
    }

    pub fn queue_run(&self, run_id: Uuid) {
        let mut q = self.queue.lock().unwrap();
        q.push(run_id);
        tracing::info!("queued benchmark run {}, queue depth: {}", run_id, q.len());
    }

    pub fn can_start(&self) -> bool {
        let running = self.running.lock().unwrap();
        running.len() < self.max_concurrent
    }

    pub fn start_run(&self, run_id: Uuid) -> bool {
        let mut running = self.running.lock().unwrap();
        if running.len() >= self.max_concurrent {
            return false;
        }
        running.push(run_id);
        true
    }

    pub fn complete_run(&self, run_id: Uuid) {
        let mut running = self.running.lock().unwrap();
        running.retain(|id| *id != run_id);
    }

    pub fn dequeue(&self) -> Option<Uuid> {
        let mut q = self.queue.lock().unwrap();
        if q.is_empty() {
            return None;
        }
        Some(q.remove(0))
    }
}
