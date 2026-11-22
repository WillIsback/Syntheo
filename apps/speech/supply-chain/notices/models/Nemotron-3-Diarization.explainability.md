Field | Response
:---|:---
Intended Task/Domain | Speaker Diarization (determining who spoke when in conversational audio), Speaker Tagging in Speech Recognition Systems
Model Type | Transformer encoder
Intended Users | Developers, researchers and agents working on conversational AI systems that require generic speaker labels and timestamps.
Output | A `[T, 8]` floating-point tensor of per-speaker activity probabilities. The eight channels are ordered by speaker arrival time. The default output stride is 10 ms and can be configured to a multiple of 10 ms.
Describe how the model works | The model stacks 10 ms Mel-spectrogram features by a factor of eight, processes the resulting 80 ms frames with a Transformer encoder, and upsamples predictions back to 10 ms resolution with a Conv1D layer. During streaming inference, the Arrival-Order Speaker Cache and FIFO queue preserve useful speaker context across chunks. Speaker activity probabilities can be postprocessed into generic speaker labels with start and end timestamps.
Name the adversely impacted groups this has been tested to deliver comparable outcomes regardless of | Not Applicable
Technical Limitations & Mitigation | This model supports up to eight speakers; if the audio contains more than eight speakers, some will inevitably be missed or misattributed. Performance may degrade on very long recordings and in challenging acoustic conditions, such as high background noise or severe reverberation. Latency profile should be chosen carefully for a downstream application, as lowering latency generally decreases both accuracy and speed of the model.
Verified to have met prescribed NVIDIA quality standards | Yes
Performance Metrics | Diarization Error Rate (DER), Speaker Counting Accuracy (SCA), Speaker Counting Mean Absolute Error (MAE), and Real-Time Factor speedup (RTFx).
Potential Known Risks | Diarization errors can assign speech to the wrong generic speaker channel, miss speech, introduce false alarms, or place boundaries incorrectly, particularly under overlap, noise, far-field conditions, domain shift, or unsupported speaker counts. Downstream systems should retain uncertainty and be tested for the intended use case.
Licensing | Use of this model is governed by the [OpenMDW License Agreement, version 1.1](https://openmdw.ai/license/1-1/).