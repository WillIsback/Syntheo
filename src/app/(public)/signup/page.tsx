import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components";
import { auth } from "@/lib/auth";

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-(--syn-bg) p-6">
      <div className="mb-7 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--syn-blue)">
          <svg
            width="19"
            height="19"
            viewBox="0 0 20 20"
            fill="white"
            aria-hidden="true"
          >
            <path d="M3 4h14v2H3V4zm0 5h14v2H3V9zm0 5h9v2H3v-2z" />
          </svg>
        </div>
        <span className="text-[22px] font-normal tracking-[-0.01em] text-(--syn-text-2)">
          <b className="font-medium text-(--syn-blue)">Syntheo</b>
        </span>
      </div>

      <div className="w-full max-w-95 rounded-[14px] border border-(--syn-border) bg-(--syn-surface) p-9 text-center">
        <h1 className="mb-1 text-xl font-medium text-(--syn-text)">
          Inscriptions fermées
        </h1>
        <p className="mb-7 text-[12.5px] text-(--syn-text-2)">
          L&apos;accès à cette démo est réservé à un panel d&apos;utilisateurs
          invités. Contactez votre administrateur pour obtenir un compte.
        </p>

        <Link href="/signin">
          <Button variant="filled" className="w-full justify-center py-2.5">
            Retour à la connexion
          </Button>
        </Link>
      </div>
    </main>
  );
}
