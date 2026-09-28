import jalaali from "jalaali-js";

export const JALALI_MONTH_NAMES = [
  "",
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export function getTodayJalali(): { year: number; month: number; day: number } {
  const now = new Date();
  const j = jalaali.toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function toJalali(dateStr: string): { year: number; month: number; day: number } {
  const d = new Date(dateStr);
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return { year: j.jy, month: j.jm, day: j.jd };
}

export function toGregorian(jy: number, jm: number, jd: number): string {
  const g = jalaali.toGregorian(jy, jm, jd);
  const mm = String(g.gm).padStart(2, "0");
  const dd = String(g.gd).padStart(2, "0");
  return `${g.gy}-${mm}-${dd}`;
}

export function getMonthName(monthNumber: number): string {
  return JALALI_MONTH_NAMES[monthNumber] || String(monthNumber);
}

export function formatMoneyTomans(rials: number): string {
  const tomans = Math.round(rials / 10);
  return tomans.toLocaleString("fa-IR") + " تومان";
}

export function formatMoneyRials(rials: number): string {
  return rials.toLocaleString("fa-IR") + " ریال";
}

export function formatJalaliFull(jy: number, jm: number, jd?: number): string {
  const mName = getMonthName(jm);
  if (jd) {
    return `${jd} ${mName} ${jy}`;
  }
  return `${mName} ${jy}`;
}
