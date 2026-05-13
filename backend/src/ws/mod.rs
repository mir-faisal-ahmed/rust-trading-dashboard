// WebSocket handler for real-time benchmark progress updates.
// Clients connect here to receive live updates on running benchmarks.

use actix_web::{HttpRequest, HttpResponse, web};
use actix_ws::Message;

pub async fn ws_handler(
    req: HttpRequest,
    stream: web::Payload,
) -> Result<HttpResponse, actix_web::Error> {
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;

    actix_web::rt::spawn(async move {
        while let Some(Ok(msg)) = msg_stream.recv().await {
            match msg {
                Message::Ping(bytes) => {
                    if session.pong(&bytes).await.is_err() {
                        return;
                    }
                }
                Message::Text(text) => {
                    // handle client messages (subscribe to run updates, etc.)
                    tracing::debug!("ws received: {}", text);

                    // echo back for now; in production this would route to
                    // the engine state for subscribing to specific run updates
                    if session.text(text).await.is_err() {
                        return;
                    }
                }
                Message::Close(_) => {
                    tracing::debug!("ws client disconnected");
                    return;
                }
                _ => {}
            }
        }
    });

    Ok(response)
}
