import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("syntheo-audit");

export function logDataAccess(
	userId: string,
	action:
		| "read"
		| "export"
		| "delete"
		| "transcription_access"
		| "report_access",
	resource: string,
): void {
	const span = tracer.startSpan(`data_access.${action}`);
	span.setAttributes({
		"user.id": userId,
		"audit.action": action,
		"audit.resource": resource,
		"audit.timestamp": new Date().toISOString(),
		"rgpd.relevant": "true",
	});
	span.end();
}
