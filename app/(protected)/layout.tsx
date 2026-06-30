import { headers } from "next/headers";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";

export default async function ProtectedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const headersList = await headers();
	const userName = headersList.get("x-user-name") ?? undefined;

	return (
		<div className="flex h-screen overflow-hidden">
			<Sidebar />
			<div className="flex flex-col flex-1 overflow-hidden">
				<Header userName={userName} />
				<main className="flex-1 overflow-y-auto p-6">{children}</main>
			</div>
		</div>
	);
}
