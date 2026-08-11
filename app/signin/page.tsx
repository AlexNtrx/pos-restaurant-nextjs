"use client";
import type { SubmitEventHandler } from "react";
import { useState } from "react";
import Swal from "sweetalert2";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import { publicApi } from "@/lib/api";
import { writeAuthSession } from "@/lib/auth-session";

type SignInResponse = {
  token: string;
  name: string;
  id: string | number;
  // Enforces the existing authentication and session behavior.
};

// Enforces the existing authentication and session behavior.
function isSignInResponse(data: unknown): data is SignInResponse {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const candidate = data as Record<string, unknown>;

  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    typeof candidate.name === "string" &&
    (typeof candidate.id === "string" || typeof candidate.id === "number")
  );
  // Enforces the existing authentication and session behavior.
}

// Enforces the existing authentication and session behavior.
function getSignInErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) {
      return "Virheellinen käyttäjätunnus tai salasana.";
    }

    if (!error.response) {
      return "Yhteyttä API-palvelimeen ei voitu muodostaa. Yritä uudelleen.";
    }

    return `Kirjautuminen epäonnistui (HTTP ${error.response.status}).`;
  }

  if (error instanceof Error && error.message === "Invalid sign-in response") {
    return "API palautti virheellisen kirjautumisvastauksen.";
  }

  return "Tapahtui odottamaton virhe. Yritä uudelleen.";
}

function SignInBranding({
  compact = false,
  showMeta = false,
}: {
  compact?: boolean;
  showMeta?: boolean;
}) {
  return (
    <>
      <div className={compact ? "flex items-center gap-4" : ""}>
        <div
          className={`flex items-center justify-center rounded-full bg-[#a68c62] text-[17px] font-semibold text-[#fbfaf7] ${compact ? "size-11 shrink-0" : "size-[52px]"}`}
        >
          RP
        </div>
        <div>
          <p
            className={`signin-display leading-none tracking-[-0.02em] ${compact ? "text-[24px]" : "mt-7 text-[25px]"}`}
          >
            Ravintola POS
          </p>
          <p
            className={`text-[#e7e5de] ${compact ? "mt-2 max-w-[240px] text-[14px] leading-[1.3]" : "mt-6 max-w-[170px] text-[17px] leading-[1.25]"}`}
          >
            Sujuva palvelu kassalta keittiöön
          </p>
        </div>
      </div>

      {showMeta && (
        <div className="mt-auto hidden space-y-5 text-[11px] leading-[1.35] text-[#d8d4cc] md:block">
          <p className="tracking-[0.08em]">KASSA · QR · KEITTIÖ</p>
          <p>v0.1 · kehitysversio</p>
        </div>
      )}
    </>
  );
}

export default function SignInPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Enforces the existing authentication and session behavior.
  const signIn: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      await Swal.fire({
        title: "Tietoja puuttuu",
        text: "Anna käyttäjätunnus ja salasana.",
        icon: "warning",
        confirmButtonText: "Selvä",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        username: normalizedUsername,
        password,
      };

      const { data } = await publicApi.post<unknown>("/user/signIn", payload);

      if (!isSignInResponse(data)) {
        throw new Error("Invalid sign-in response");
      }

      writeAuthSession({
        token: data.token,
        name: data.name,
        userId: String(data.id),
      });

      router.replace("/backoffice");
    } catch (error: unknown) {
      await Swal.fire({
        title: "Kirjautuminen epäonnistui",
        text: getSignInErrorMessage(error),
        icon: "error",
        confirmButtonText: "Selvä",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[#f5f3ef] text-[#1f201d] md:grid md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[228px_minmax(0,1fr)]">
      <div className="bg-[#1f201d] px-5 py-7 text-[#fbfaf7] sm:px-8 sm:py-8 md:hidden">
        <SignInBranding compact />
      </div>

      <aside className="hidden min-h-screen flex-col bg-[#1f201d] px-6 py-10 text-[#fbfaf7] md:flex lg:px-10 lg:py-[54px]">
        <SignInBranding showMeta />
      </aside>

      <main className="flex min-w-0 flex-1 items-start justify-center px-5 py-10 sm:px-8 sm:py-12 md:min-h-screen md:px-8 md:py-16 lg:justify-center lg:px-14 lg:py-24">
        <div className="min-w-0 w-full max-w-full sm:max-w-[360px] lg:max-w-[296px]">
          <header>
            <h1 className="text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-[#1f201d]">
              Kirjaudu sisään
            </h1>
            <p className="mt-2 text-[15px] leading-[1.3] text-[#767168]">
              Ravintolan henkilökunnalle
            </p>
          </header>

          <form className="mt-12 space-y-6" onSubmit={signIn}>
            <div className="space-y-2">
              <label
                className="block text-[13px] font-medium text-[#4f4c45]"
                htmlFor="username"
              >
                Käyttäjätunnus
              </label>
              <input
                id="username"
                type="text"
                name="username"
                className="h-12 w-full rounded-lg border border-[#d8d4cc] bg-[#fbfaf7] px-4 text-[14px] text-[#1f201d] outline-none transition placeholder:text-[#9b978e] focus:border-[#706f5e] focus:ring-2 focus:ring-[#706f5e]/20"
                placeholder="esim. kassa01"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label
                className="block text-[13px] font-medium text-[#4f4c45]"
                htmlFor="password"
              >
                Salasana
              </label>
              <input
                id="password"
                type="password"
                name="password"
                className="h-12 w-full rounded-lg border border-[#d8d4cc] bg-[#fbfaf7] px-4 text-[14px] text-[#1f201d] outline-none transition placeholder:text-[#9b978e] focus:border-[#706f5e] focus:ring-2 focus:ring-[#706f5e]/20"
                placeholder="••••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="pt-1 text-right text-[13px] leading-[1.2] text-[#767168]">
                Unohditko salasanasi?
              </p>
            </div>

            <button
              type="submit"
              className="h-12 w-full rounded-lg bg-[#706f5e] px-4 text-[16px] font-semibold text-[#fbfaf7] transition hover:bg-[#626254] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#706f5e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f3ef] disabled:cursor-wait disabled:opacity-70"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Kirjaudutaan…" : "Kirjaudu"}
            </button>
          </form>

          <div className="mt-12 space-y-12 text-[13px] leading-[1.25] text-[#767168]">
            <p>Asiakkaan QR-tilaaminen ei käytä henkilökunnan tiliä.</p>
            <p>Tarvitsetko apua? Ota yhteys ylläpitäjään.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
