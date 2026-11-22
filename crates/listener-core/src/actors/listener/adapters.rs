use std::time::{Duration, UNIX_EPOCH};

use bytes::Bytes;
use ractor::{ActorProcessingErr, ActorRef};

use owhisper_client::{
    AdapterKind, NvidiaAdapter, OpenAIAdapter, RealtimeSttAdapter, syntheo_ws_client,
};
use owhisper_interface::stream::{Extra, StreamResponse};
use owhisper_interface::{ControlMessage, MixedMessage};

use super::stream::process_stream;
use super::{
    ChannelSender, ListenerArgs, ListenerMsg, actor_error, actor_error_with_degraded,
    actor_error_with_degraded_retry,
};

use crate::{DegradedError, SessionErrorEvent};

fn client_build_error(args: &ListenerArgs, error: owhisper_client::Error) -> ActorProcessingErr {
    let message = error.to_string();
    args.runtime.emit_error(SessionErrorEvent::ConnectionError {
        session_id: args.session_id.clone(),
        error: message.clone(),
    });

    match error {
        owhisper_client::Error::ProviderConfiguration { provider, message } => {
            actor_error_with_degraded(
                format!("listen_provider_configuration_failed: {provider}: {message}"),
                DegradedError::ProviderConfiguration { provider, message },
            )
        }
        _ => actor_error(format!("listen_client_build_failed: {message}")),
    }
}

/// Adresse de connexion, et preuve pour la source « Sur ce poste » : résolue
/// à chaque listener (reconnexion comprise), donc toujours le port et le
/// jeton du lancement en cours du module, jamais un port mémorisé.
async fn connection_target(
    args: &ListenerArgs,
) -> Result<(String, Option<owhisper_client::OnDeviceToken>), ActorProcessingErr> {
    if !owhisper_client::is_on_device(&args.base_url) {
        return Ok((args.base_url.clone(), None));
    }
    match args.runtime.on_device_target().await {
        Ok(target) => Ok((target.base_url, Some(target.token))),
        Err(error) => {
            args.runtime.emit_error(SessionErrorEvent::ConnectionError {
                session_id: args.session_id.clone(),
                error: error.message.clone(),
            });
            Err(actor_error_with_degraded(
                format!("on_device_unavailable: {}", error.message),
                DegradedError::OnDeviceUnavailable {
                    reason: error.kind.code().to_owned(),
                    permanent: error.kind.is_permanent(),
                },
            ))
        }
    }
}

fn classify_ws_connect_failure(provider: &str, error: &syntheo_ws_client::Error) -> DegradedError {
    // Preuve du module « Sur ce poste » absente ou fausse : pas une clé d'API.
    if matches!(error, syntheo_ws_client::Error::PeerAuthenticationFailed) {
        return DegradedError::OnDeviceAuthenticationFailed;
    }
    if error.is_auth_error() {
        return DegradedError::AuthenticationFailed {
            provider: provider.to_string(),
        };
    }

    match error {
        syntheo_ws_client::Error::InvalidRequest { message }
        | syntheo_ws_client::Error::ConnectFailed {
            message,
            status_code: Some(400 | 402 | 404 | 422),
            ..
        } => DegradedError::ProviderConfiguration {
            provider: provider.to_string(),
            message: message.clone(),
        },
        _ => DegradedError::UpstreamUnavailable {
            message: error.to_string(),
        },
    }
}

fn ws_connect_error(args: &ListenerArgs, error: syntheo_ws_client::Error) -> ActorProcessingErr {
    let provider =
        AdapterKind::from_url_and_languages(&args.base_url, &args.languages, Some(&args.model))
            .to_string();
    let message = format!("listen_ws_connect_failed: {error:?}");

    tracing::warn!(
        syntheo.session.id = %args.session_id,
        syntheo.stt.provider.name = %provider,
        error.message = ?error,
        "listen_ws_connect_failed"
    );
    args.runtime.emit_error(SessionErrorEvent::ConnectionError {
        session_id: args.session_id.clone(),
        error: message.clone(),
    });

    let retry_after = error.retry_after_secs().map(Duration::from_secs);
    actor_error_with_degraded_retry(
        message,
        classify_ws_connect_failure(&provider, &error),
        retry_after,
    )
}

pub(super) async fn spawn_rx_task(
    args: ListenerArgs,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<Vec<StreamResponse>>,
        tokio::sync::oneshot::Sender<()>,
        String,
    ),
    ActorProcessingErr,
> {
    if args.transcription_mode != crate::TranscriptionMode::Live {
        return Err(actor_error(
            "listener_batch_mode: live listener is disabled for batch transcription",
        ));
    }

    let adapter_kind =
        AdapterKind::from_url_and_languages(&args.base_url, &args.languages, Some(&args.model));
    let is_dual = matches!(args.mode, crate::actors::ChannelMode::MicAndSpeaker);

    let result = match (adapter_kind, is_dual) {
        (AdapterKind::OpenAI, false) => {
            let params = build_listen_params(&args);
            spawn_rx_task_single_with_adapter::<OpenAIAdapter>(args, params, myself).await
        }
        (AdapterKind::OpenAI, true) => {
            let params = build_listen_params(&args);
            spawn_rx_task_dual_with_adapter::<OpenAIAdapter>(args, params, myself).await
        }
        (AdapterKind::Nvidia, false) => {
            let params = nemo_speech_listen_params(&args).await;
            spawn_rx_task_single_with_adapter::<NvidiaAdapter>(args, params, myself).await
        }
        (AdapterKind::Nvidia, true) => {
            let params = nemo_speech_listen_params(&args).await;
            spawn_rx_task_dual_with_adapter::<NvidiaAdapter>(args, params, myself).await
        }
    }?;

    Ok((result.0, result.1, result.2, adapter_kind.to_string()))
}

fn build_listen_params(args: &ListenerArgs) -> owhisper_interface::ListenParams {
    let redemption_time_ms = if args.onboarding { "60" } else { "400" };
    let custom_query = std::collections::HashMap::from([(
        "redemption_time_ms".to_string(),
        redemption_time_ms.to_string(),
    )]);

    owhisper_interface::ListenParams {
        model: Some(args.model.clone()),
        languages: args.languages.clone(),
        sample_rate: super::super::SAMPLE_RATE,
        keywords: args.keywords.clone(),
        // A bound, never an exact count: attendance says who may speak.
        max_speakers: max_speakers(args),
        mic_num_speakers: args.mic_isolated.then_some(1),
        custom_query: Some(custom_query),
        ..Default::default()
    }
}

/// Paramètres d'une session NeMo-Speech.cpp. Un serveur sans diariseur
/// refuse l'ouverture d'une session qui demande la diarisation (issue 574) :
/// sa liste de modèles le dit, et la session s'ouvre alors sans. Sonde muette
/// ou en échec (`NEMO_SPEECH_PROBE_TIMEOUT`) : diarisation demandée, comme
/// avant, pour ne pas perdre les intervenants d'un serveur qui les fournit.
async fn nemo_speech_listen_params(args: &ListenerArgs) -> owhisper_interface::ListenParams {
    let mut params = build_listen_params(args);
    let diarization = owhisper_client::nemo_speech_speaker_diarization(
        &args.base_url,
        Some(args.api_key.as_str()),
        owhisper_client::NEMO_SPEECH_PROBE_TIMEOUT,
    )
    .await;
    if diarization == Some(false) {
        tracing::info!("nemo_speech_session_without_diarization");
        owhisper_client::without_speaker_diarization(&mut params);
    }
    params
}

fn max_speakers(args: &ListenerArgs) -> Option<u32> {
    crate::max_speakers_per_stream(&args.participant_human_ids, args.self_human_id.as_deref())
}

fn build_extra(args: &ListenerArgs) -> (f64, Extra) {
    let session_offset_secs = args
        .stream_offset_secs
        .unwrap_or_else(|| args.session_started_at.elapsed().as_secs_f64());
    let started_unix_millis = args
        .session_started_at_unix
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0))
        .as_millis()
        .min(u64::MAX as u128) as u64;

    let extra = Extra {
        started_unix_millis,
    };

    (session_offset_secs, extra)
}

fn desktop_connect_policy() -> syntheo_ws_client::client::WebSocketConnectPolicy {
    syntheo_ws_client::client::WebSocketConnectPolicy {
        connect_timeout: Duration::from_secs(4),
        max_attempts: 1,
        retry_delay: Duration::from_secs(1),
    }
}

async fn spawn_rx_task_single_with_adapter<A: RealtimeSttAdapter>(
    args: ListenerArgs,
    params: owhisper_interface::ListenParams,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<Vec<StreamResponse>>,
        tokio::sync::oneshot::Sender<()>,
    ),
    ActorProcessingErr,
> {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (session_offset_secs, extra) = build_extra(&args);

    let (tx, rx) = tokio::sync::mpsc::channel::<MixedMessage<Bytes, ControlMessage>>(32);

    let (base_url, on_device) = connection_target(&args).await?;
    let mut builder = owhisper_client::ListenClient::builder()
        .adapter::<A>()
        .api_base(base_url)
        .api_key(args.api_key.clone())
        .params(params)
        .connect_policy(desktop_connect_policy());
    if let Some(token) = on_device {
        builder = builder.on_device(token);
    }
    let client = builder
        .build_single()
        .await
        .map_err(|error| client_build_error(&args, error))?;

    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let (listen_stream, handle) = client
        .from_realtime_audio(outbound)
        .await
        .map_err(|error| ws_connect_error(&args, error))?;

    let rx_task = tokio::spawn(async move {
        futures_util::pin_mut!(listen_stream);
        process_stream(
            listen_stream,
            handle,
            myself,
            shutdown_rx,
            session_offset_secs,
            extra,
            Some(super::LISTEN_STREAM_TIMEOUT),
        )
        .await
    });

    Ok((ChannelSender::Single(tx), rx_task, shutdown_tx))
}

async fn spawn_rx_task_dual_with_adapter<A: RealtimeSttAdapter>(
    args: ListenerArgs,
    params: owhisper_interface::ListenParams,
    myself: ActorRef<ListenerMsg>,
) -> Result<
    (
        ChannelSender,
        tokio::task::JoinHandle<Vec<StreamResponse>>,
        tokio::sync::oneshot::Sender<()>,
    ),
    ActorProcessingErr,
> {
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
    let (session_offset_secs, extra) = build_extra(&args);

    let (tx, rx) = tokio::sync::mpsc::channel::<MixedMessage<(Bytes, Bytes), ControlMessage>>(32);

    let (base_url, on_device) = connection_target(&args).await?;
    let mut builder = owhisper_client::ListenClient::builder()
        .adapter::<A>()
        .api_base(base_url)
        .api_key(args.api_key.clone())
        .params(params)
        .connect_policy(desktop_connect_policy());
    if let Some(token) = on_device {
        builder = builder.on_device(token);
    }
    let client = builder
        .build_dual()
        .await
        .map_err(|error| client_build_error(&args, error))?;

    let outbound = tokio_stream::wrappers::ReceiverStream::new(rx);

    let (listen_stream, handle) = client
        .from_realtime_audio(outbound)
        .await
        .map_err(|error| ws_connect_error(&args, error))?;

    let rx_task = tokio::spawn(async move {
        futures_util::pin_mut!(listen_stream);
        process_stream(
            listen_stream,
            handle,
            myself,
            shutdown_rx,
            session_offset_secs,
            extra,
            Some(super::LISTEN_STREAM_TIMEOUT),
        )
        .await
    });

    Ok((ChannelSender::Dual(tx), rx_task, shutdown_tx))
}

#[cfg(test)]
mod tests;
