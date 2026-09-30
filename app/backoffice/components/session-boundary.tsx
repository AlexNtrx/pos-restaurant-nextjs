"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { usePathname, useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  canAccessBackofficePath,
  getBackofficeLanding,
  isUserLevel,
  type UserLevel,
} from "@/lib/access-control";
import {
  clearAuthSession,
  readAuthSession,
  type AuthSession,
} from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import StaffShell from "./staff-shell";
import { StaffRoleContext } from "@/lib/staff-role-context";

//Types
type SessionState =
  | { status: "checking" }
  | { status: "authenticated"; session: AuthSession; level: UserLevel }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "verification-error"; message: string };

//Timer
// Validates is user level response before it is used.
const VERIFY_SESSION_TIMEOUT_MS = 10_000;

//Helper functions
function isUserLevelResponse(data: unknown): data is { level: UserLevel } {
  return (
    typeof data === "object" &&
    data !== null &&
    isUserLevel((data as Record<string, unknown>).level)
  );
  // Loads verification error for the current workflow.
}

// Loads verification error for the current workflow.
function getVerificationError(error: unknown) {
  if (isAxiosError(error) && !error.response) {
    return "Cannot connect to the API server. Your stored session was retained.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while verifying your session.";
  // Renders the session boundary interface.
}

//Main Component
export default function SessionBoundary({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>({ status: "checking" });
  const verificationStartedRef = useRef(false);
  const activeVerificationRef = useRef<AbortController | null>(null); //cancellation
  const verificationRequestIdRef = useRef(0);

  //Main Action
  const verifySession = useCallback(
    async (retry = false) => {
      if (verificationStartedRef.current && !retry) return;
      verificationStartedRef.current = true;

      activeVerificationRef.current?.abort(); //cancellation

      const controller = new AbortController(); // controller for cancelling this verification request
      activeVerificationRef.current = controller;

      const requestId = ++verificationRequestIdRef.current; //request #1,2,3

      //timer cancellation 10ms
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, VERIFY_SESSION_TIMEOUT_MS); //10ms

      const session = readAuthSession(); //token, name, userID

      if (!session) {
        //no session
        window.clearTimeout(timeoutId); //stop timer
        activeVerificationRef.current = null; //clear request
        clearAuthSession(); //clear session
        setState({ status: "unauthenticated" });
        router.replace("/signin"); //redirect
        return;
      }

      //Verify session with the api and handle verification errors

      try {
        const { data } = await api.get<unknown>("/user/getLevelByToken", {
          signal: controller.signal,
        });

        if (requestId !== verificationRequestIdRef.current) return;

        if (!isUserLevelResponse(data)) {
          throw new Error("The API returned an invalid user level.");
        }

        setState({ status: "authenticated", session, level: data.level }); //store  token,name,userID and role
      } catch (error: unknown) {
        if (requestId !== verificationRequestIdRef.current) return;

        if (isAxiosError(error) && error.response?.status === 401) {
          clearAuthSession();
          setState({ status: "unauthenticated" });
          router.replace("/signin");
          return;
        }

        if (isAxiosError(error) && error.response?.status === 403) {
          setState({ status: "forbidden" });
          return;
        }

        setState({
          status: "verification-error",
          message: timedOut
            ? "Session verification timed out. Please try again."
            : getVerificationError(error),
        });
      } finally {
        //clean timer + controller
        window.clearTimeout(timeoutId);

        if (activeVerificationRef.current === controller) {
          activeVerificationRef.current = null;
        }
      }
    },
    [router],
  );

  //Effects
  useEffect(() => {
    const scheduledVerificationId = window.setTimeout(() => {
      void verifySession();
    }, 0);

    return () => {
      window.clearTimeout(scheduledVerificationId);
      verificationRequestIdRef.current += 1;
      verificationStartedRef.current = false;
      activeVerificationRef.current?.abort();
      activeVerificationRef.current = null;
    };
  }, [verifySession]);

  useEffect(() => {
    if (state.status !== "authenticated") return;

    if (
      pathname === "/backoffice" ||
      !canAccessBackofficePath(pathname, state.level)
    ) {
      router.replace(getBackofficeLanding(state.level));
    }
  }, [pathname, router, state]);

  // Retry session verification
  // Preserves retry verification sequencing and retry behavior.
  const retryVerification = () => {
    setState({ status: "checking" });
    void verifySession(true);
  };

  //  UI guards
  if (state.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-4 font-sans">
        <p role="status" className="text-sm text-muted-foreground">
          Istuntoa tarkistetaan…
        </p>
      </main>
    );
  }

  if (state.status === "verification-error") {
    return (
      <main className="min-h-screen bg-canvas p-6 font-sans" role="alert">
        <h1 className="font-heading text-2xl font-semibold">
          Istuntoa ei voitu vahvistaa
        </h1>
        <p>{state.message}</p>
        <Button className="mt-4" onClick={retryVerification}>
          Yritä uudelleen
        </Button>
      </main>
    );
  }

  if (state.status === "forbidden") {
    return (
      <main className="min-h-screen bg-canvas p-6 font-sans" role="alert">
        <h1 className="font-heading text-2xl font-semibold">Pääsy estetty</h1>
        <p>Käyttäjätilillä ei ole tuettua henkilökunnan roolia.</p>
        <Button
          className="mt-4"
          onClick={() => {
            clearAuthSession();
            router.replace("/signin");
          }}
        >
          Kirjaudu ulos
        </Button>
      </main>
    );
  }

  if (state.status === "unauthenticated") {
    return null;
  }

  if (
    pathname === "/backoffice" ||
    !canAccessBackofficePath(pathname, state.level)
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas p-4 font-sans">
        <p role="status" className="text-sm text-muted-foreground">
          Käyttöoikeutta tarkistetaan…
        </p>
      </main>
    );
  }

  // EN: The approved Kitchen frame is full-screen; keep this same authenticated boundary without the backoffice rail.
  // FI: Hyväksytty keittiönäkymä on koko näytön kokoinen; käytä samaa tunnistettua rajaa ilman sivupalkkia.
  if (pathname === "/backoffice/kitchen")
    return (
      <StaffRoleContext.Provider value={state.level}>
        {children}
      </StaffRoleContext.Provider>
    );

  // Main UI
  return (
    <StaffShell name={state.session.name} userLevel={state.level}>
      {children}
    </StaffShell>
  );
}
