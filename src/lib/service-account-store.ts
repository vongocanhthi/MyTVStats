const STORAGE_KEY = "mytvstats:service-account-json";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

function isValidCredentials(value: unknown): value is ServiceAccountCredentials {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.client_email === "string" && typeof record.private_key === "string";
}

export function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("File JSON không hợp lệ.");
  }
  if (!isValidCredentials(parsed)) {
    throw new Error("File JSON thiếu client_email hoặc private_key.");
  }
  return parsed;
}

export function loadCustomServiceAccount(): ServiceAccountCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseServiceAccountJson(raw);
  } catch {
    return null;
  }
}

export function saveCustomServiceAccount(credentials: ServiceAccountCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function clearCustomServiceAccount(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getServiceAccountLabel(): string {
  const credentials = loadCustomServiceAccount();
  return credentials ? `custom (${credentials.client_email})` : "snapshot";
}
