import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Syntheo",
	description:
		"Transcription de réunions privée et conforme — Privacy-first AI meeting transcription",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="fr">
			<body>{children}</body>
		</html>
	);
}
