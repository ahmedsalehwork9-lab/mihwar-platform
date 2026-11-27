// آخر الصفحات التي فتحها المستخدم (للرئيسية). تخزين محلي فقط، بلا بيانات حساسة.
export const RECENT_KEY = "mihwar_recent_pages";
export const readRecent = (): string[] => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
export const pushRecent = (p: string): void => { if (p === "dashboard") return; try { const n = [p, ...readRecent().filter((x) => x !== p)].slice(0, 8); localStorage.setItem(RECENT_KEY, JSON.stringify(n)); } catch { /* noop */ } };
export const greetingKey = (h: number): "morning" | "afternoon" | "evening" => (h < 12 ? "morning" : h < 18 ? "afternoon" : "evening");
