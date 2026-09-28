export interface Env {
  BOT_TOKEN: string;
  DB: D1Database;
  AI?: Ai;
  GEMINI_API_KEY?: string;
  ALLOWED_USER_IDS?: string;
  DEFAULT_ACCOUNT_NAME?: string;
}

export function isUserAllowed(userId: number, allowedList?: string): boolean {
  if (!allowedList || !allowedList.trim()) {
    return true; // اگر خالی باشد یعنی همه مجاز هستند
  }
  const ids = allowedList
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  return ids.includes(userId);
}
