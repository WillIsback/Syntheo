export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { NodeSDK } = await import("@opentelemetry/sdk-node");
		const { OTLPTraceExporter } = await import(
			"@opentelemetry/exporter-trace-otlp-http"
		);
		const { getNodeAutoInstrumentations } = await import(
			"@opentelemetry/auto-instrumentations-node"
		);

		const sdk = new NodeSDK({
			traceExporter: new OTLPTraceExporter({
				url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
					? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
					: "http://otel-collector:4318/v1/traces",
			}),
			instrumentations: [getNodeAutoInstrumentations()],
			serviceName: process.env.OTEL_SERVICE_NAME ?? "syntheo-app",
		});
		sdk.start();
	}
}
