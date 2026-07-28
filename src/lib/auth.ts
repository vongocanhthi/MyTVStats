const AUTH_STORAGE_KEY = "mytvstats.auth.session";

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "123";

export interface AuthSession {
  username: string;
  loggedInAt: number;
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.username || typeof parsed.loggedInAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getStoredSession() !== null;
}

export function login(username: string, password: string): boolean {
  const user = username.trim();
  if (user === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
    const session: AuthSession = {
      username: user,
      loggedInAt: Date.now(),
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
