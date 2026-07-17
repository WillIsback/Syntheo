import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Root route — never rendered, only routes to the right group. */
export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/signin");
}
