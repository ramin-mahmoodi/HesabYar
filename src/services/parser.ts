/**
 * تبدیل اعداد فارسی و عربی به انگلیسی
 */
export function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * تبدیل هوشمند متن مبلغ به تومان و ریال
 * پشتیبانی از مبالغ عددی، با کاما، پسوند «هزار»، «میلیون»، «تومان»، «تومن»، «ریال»
 */
export function parseAmountInput(rawText: string): { tomans: number; rials: number } | null {
  if (!rawText) return null;

  let text = toEnglishDigits(rawText).toLowerCase().trim();

  // بررسی واحد پول
  const isRials = text.includes("ریال");
  text = text.replace(/تومان|تومن|ریال/g, "").trim();

  let multiplier = 1;
  if (text.includes("میلیون")) {
    multiplier = 1_000_000;
    text = text.replace(/میلیون/g, "");
  } else if (text.includes("هزار") || text.includes("ک")) {
    multiplier = 1_000;
    text = text.replace(/هزار|ک/g, "");
  }

  // حذف فاصله‌ها، کاما و خط فاصله
  text = text.replace(/[,\s_]/g, "");

  const num = parseFloat(text);
  if (isNaN(num) || num < 0) return null;

  const total = Math.round(num * multiplier);
  if (isRials) {
    return {
      tomans: Math.round(total / 10),
      rials: total,
    };
  } else {
    return {
      tomans: total,
      rials: total * 10,
    };
  }
}
