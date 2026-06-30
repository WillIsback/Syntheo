"use client";

import { useRouter } from "next/navigation";
import ConsentDialog from "@/components/consent-dialog";

export default function NewSessionPage() {
	const router = useRouter();

	return (
		<ConsentDialog
			onConfirm={(sessionId) => router.push(`/sessions/${sessionId}/record`)}
			onCancel={() => router.push("/sessions")}
		/>
	);
}
