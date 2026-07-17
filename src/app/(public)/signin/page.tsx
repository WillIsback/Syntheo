import { redirect } from "next/navigation";
import AuthError from "next-auth";
import { Button } from "@/components";
import { auth, signIn } from "@/lib/auth";

type SignInPageProps = {
  readonly searchParams?: Promise<{ error?: string }>;
};

async function authenticate(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      redirect("/signin?error=AuthError");
    }

    throw error;
  }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};

  const showError =
    params.error === "InvalidCredentials" || params.error === "AuthError";

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

      <div className="w-full max-w-95 rounded-[14px] border border-(--syn-border) bg-(--syn-surface) p-9">
        <h1 className="mb-1 text-center text-xl font-medium text-(--syn-text)">
          Connexion
        </h1>
        <p className="mb-7 text-center text-[12.5px] text-(--syn-text-2)">
          Transcription et comptes rendus augmentés par IA
        </p>

        {showError ? (
          <p className="mb-4 rounded-(--syn-radius-sm) bg-(--syn-status-recording-bg) p-2.5 text-[12px] text-(--syn-status-recording-fg)">
            Échec de la connexion. Vérifiez vos identifiants.
          </p>
        ) : null}

        <form action={authenticate} className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[.04em] text-(--syn-text-2)"
              htmlFor="email"
            >
              Email professionnel
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="prenom.nom@entreprise.fr"
              className="w-full rounded-(--syn-radius-sm) border border-(--syn-border) px-3 py-2.5 text-sm text-(--syn-text) outline-none focus:border-(--syn-blue)"
            />
          </div>

          <div>
            <label
              className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-[.04em] text-(--syn-text-2)"
              htmlFor="password"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-(--syn-radius-sm) border border-(--syn-border) px-3 py-2.5 text-sm text-(--syn-text) outline-none focus:border-(--syn-blue)"
            />
          </div>

          <Button
            type="submit"
            variant="filled"
            className="w-full justify-center py-2.5"
          >
            Se connecter
          </Button>
        </form>

        <div className="mt-6 flex items-start gap-2 border-t border-(--syn-border-soft) pt-5 text-[11px] leading-relaxed text-(--syn-text-3)">
          <svg
            width="13"
            height="13"
            viewBox="0 0 20 20"
            fill="#9AA0A6"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          >
            <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm1 11H9V9h2v4zm0-6H9V5h2v2z" />
          </svg>
          <span>
            Aucun fichier audio n&apos;est conservé sur nos serveurs. Les voix
            des participants sont traitées comme données biométriques,
            conformément au RGPD.
          </span>
        </div>
      </div>
    </main>
  );
}
