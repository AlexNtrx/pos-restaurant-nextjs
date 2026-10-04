import "client-only";

import config from "@/app/config";
import { invalidateCatalogCache } from "@/lib/revalidated-cache";

const sessionKeys = {
  token: config.token,
  name: "next_name",
  userId: "next_user_id",
} as const;

export type AuthSession = {
  token: string;
  name: string;
  userId: string;
  // Enforces the existing authentication and session behavior.
};

// Enforces the existing authentication and session behavior.
export function readAuthSession(): AuthSession | null {
  const token = localStorage.getItem(sessionKeys.token);
  const name = localStorage.getItem(sessionKeys.name);
  const userId = localStorage.getItem(sessionKeys.userId);

  if (!token || name === null || userId === null) {
    return null;
  }

  return { token, name, userId };
  // Enforces the existing authentication and session behavior.
}

// Enforces the existing authentication and session behavior.
export function writeAuthSession(session: AuthSession) {
  invalidateCatalogCache();
  try {
    localStorage.setItem(sessionKeys.token, session.token);
    localStorage.setItem(sessionKeys.name, session.name);
    localStorage.setItem(sessionKeys.userId, session.userId);
  } catch (error) {
    clearAuthSession();
    throw error;
  }
  // Enforces the existing authentication and session behavior.
}

// Enforces the existing authentication and session behavior.
export function clearAuthSession() {
  invalidateCatalogCache();
  localStorage.removeItem(sessionKeys.token);
  localStorage.removeItem(sessionKeys.name);
  localStorage.removeItem(sessionKeys.userId);
  // Enforces the existing authentication and session behavior.
}

// Enforces the existing authentication and session behavior.
export function readAuthToken() {
  return localStorage.getItem(sessionKeys.token);
}
