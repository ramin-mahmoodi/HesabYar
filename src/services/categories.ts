export interface CategoryItem {
  key: string;
  label: string;
}

export const EXPENSE_CATEGORIES: CategoryItem[] = [
  { key: "food", label: "🍔 خوراک و سوپرمارکت" },
  { key: "fuel", label: "⛽ بنزین و سوخت" },
  { key: "transport", label: "🚕 حمل‌ونقل و اسنپ" },
  { key: "home", label: "🏠 مخارج منزل" },
  { key: "rent_home", label: "🔑 اجاره مسکن" },
  { key: "water", label: "💧 قبض آب" },
  { key: "electricity", label: "⚡ قبض برق" },
  { key: "gas", label: "🔥 قبض گاز" },
  { key: "internet", label: "📱 اینترنت و شارژ" },
  { key: "health", label: "💊 دارو و درمان" },
  { key: "clothing", label: "👕 پوشاک" },
  { key: "education", label: "📚 آموزش" },
  { key: "entertainment", label: "☕ کافه و تفریح" },
  { key: "installment", label: "💳 وام و اقساط" },
  { key: "other_expense", label: "📦 سایر هزینه‌ها" },
];

export const INCOME_CATEGORIES: CategoryItem[] = [
  { key: "salary", label: "💼 حقوق و دستمزد" },
  { key: "freelance", label: "💻 پروژه و فریلنس" },
  { key: "sales", label: "💰 فروش کالا/خدمات" },
  { key: "gift", label: "🎁 هدیه و عیدی" },
  { key: "other_income", label: "💵 سایر درآمدها" },
];

export const ALL_CATEGORIES_MAP: Record<string, string> = {
  ...Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c.label])),
  ...Object.fromEntries(INCOME_CATEGORIES.map((c) => [c.key, c.label])),
};

export function getCategoryLabel(key?: string): string {
  if (!key) return "بدون دسته";
  return ALL_CATEGORIES_MAP[key] || key;
}

export function guessCategoryFromText(text: string, txType?: "deposit" | "withdraw"): string | undefined {
  const t = text.replace(/ي/g, "ی").replace(/ك/g, "ک").toLowerCase();

  const rules: [string[], string][] = [
    [["بنزین", "سوخت", "گازوئیل", "cng", "جایگاه"], "fuel"],
    [["اجاره خانه", "اجاره منزل", "رهن"], "rent_home"],
    [["اجاره دفتر", "اجاره مغازه"], "home"],
    [["آبفا", "قبض آب", "آب بها"], "water"],
    [["برق", "توانیر", "قبض برق"], "electricity"],
    [["گاز", "شرکت گاز", "قبض گاز"], "gas"],
    [["اینترنت", "همراه اول", "ایرانسل", "رایتل", "مخابرات", "شارژ"], "internet"],
    [["سوپر", "نان", "خواربار", "رستوران", "غذا", "خوراک", "اسنک", "فست فود", "میوه"], "food"],
    [["اسنپ", "تپسی", "تاکسی", "مترو", "اتوبوس", "کرایه"], "transport"],
    [["دارو", "دکتر", "بیمارستان", "درمان", "آزمایش", "کلینیک", "پزشک"], "health"],
    [["شهریه", "کلاس", "آموزش", "دانشگاه", "کتاب"], "education"],
    [["لباس", "پوشاک", "کفش", "شلوار", "پیراهن"], "clothing"],
    [["سینما", "تفریح", "سفر", "گردش", "کافه", "قهوه"], "entertainment"],
    [["قسط", "وام", "اقساط", "چک"], "installment"],
    [["حقوق", "کارانه", "پاداش", "حق الزحمه"], "salary"],
    [["پروژه", "فریلنس", "طراحی", "برنامه‌نویسی"], "freelance"],
    [["فروش", "مشتری"], "sales"],
    [["هدیه", "عیدی", "شاباش"], "gift"],
  ];

  for (const [keywords, cat] of rules) {
    if (keywords.some((kw) => t.includes(kw))) {
      return cat;
    }
  }

  return txType === "withdraw" ? "other_expense" : "other_income";
}
