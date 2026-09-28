import { InlineKeyboard, Keyboard } from "grammy";
import { BankAccount } from "../types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../services/categories";
import { formatMoneyTomans } from "../services/jalali";

/**
 * کیبورد اصلی ربات
 */
export function mainReplyKeyboard(): Keyboard {
  return new Keyboard()
    .text("➕ ثبت واریز (درآمد)")
    .text("➖ ثبت برداشت (خرج)")
    .row()
    .text("📷 ارسال رسید (عکس)")
    .text("🎙 ثبت با ویس (صدا)")
    .row()
    .text("📊 گزارش ماه جاری")
    .text("💳 حساب‌ها و کارت‌ها")
    .resized();
}

/**
 * دکمه‌های تایید و ویرایش پیش‌نمایش تراکنش (از روی عکس رسید، ویس یا متن هوشمند)
 */
export function transactionConfirmKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ ثبت در حسابداری", `tx_confirm:${token}`)
    .row()
    .text("🔄 تغییر نوع (واریز/برداشت)", `tx_toggle_type:${token}`)
    .text("🏷 انتخاب دسته", `tx_pick_cat:${token}`)
    .row()
    .text("❌ انصراف", `tx_cancel:${token}`);
}

/**
 * کیبورد انتخاب دسته‌بندی برای پیش‌نمایش عکس/ویس
 */
export function categoriesKeyboard(
  txType: "deposit" | "withdraw",
  token: string
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const list = txType === "deposit" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  for (let i = 0; i < list.length; i += 2) {
    const item1 = list[i];
    const item2 = list[i + 1];

    if (item2) {
      keyboard.text(item1.label, `cat_select:${token}:${item1.key}`).text(
        item2.label,
        `cat_select:${token}:${item2.key}`
      );
    } else {
      keyboard.text(item1.label, `cat_select:${token}:${item1.key}`);
    }
    keyboard.row();
  }

  keyboard.text("🔙 بازگشت به پیش‌نمایش", `tx_back:${token}`);
  return keyboard;
}

/**
 * دکمه‌های زیر گزارش ماهانه (دانلود اکسل و نمودارها)
 */
export function reportActionKeyboard(year: number, month: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("📥 دانلود فایل اکسل (.xlsx)", `rep_excel:${year}:${month}`)
    .row()
    .text("🍩 نمودار دایره‌ای هزینه‌ها", `rep_chart_pie:${year}:${month}`)
    .text("📊 نمودار مقایسه دخل و خرج", `rep_chart_bar:${year}:${month}`);
}

/**
 * دکمه زیر فهرست حساب‌ها برای افزودن حساب جدید
 */
export function accountsListKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("➕ افزودن حساب یا کارت جدید", "wacc_start");
}

/* =========================================================================
   کیبوردهای شیشه‌ای ثبت مرحله به مرحله تراکنش (Transaction Wizard Keyboards)
   ========================================================================= */

/**
 * کیبورد مرحله ورود مبلغ (فقط انصراف، مبلغ توسط کاربر به صورت دستی تایپ می‌شود)
 */
export function wizardAmountKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ انصراف", "wtx_cancel");
}

/**
 * انتخاب دسته‌بندی با دکمه‌های شیشه‌ای مرحله به مرحله
 */
export function wizardCategoryKeyboard(txType: "deposit" | "withdraw"): InlineKeyboard {
  const kb = new InlineKeyboard();
  const list = txType === "deposit" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  for (let i = 0; i < list.length; i += 2) {
    const item1 = list[i];
    const item2 = list[i + 1];

    if (item2) {
      kb.text(item1.label, `wtx_c:${item1.key}`).text(item2.label, `wtx_c:${item2.key}`);
    } else {
      kb.text(item1.label, `wtx_c:${item1.key}`);
    }
    kb.row();
  }

  kb.text("🔙 تغییر مبلغ", "wtx_back_amt").text("❌ انصراف", "wtx_cancel");
  return kb;
}

/**
 * انتخاب حساب بانکی با دکمه‌های شیشه‌ای
 */
export function wizardAccountsKeyboard(accounts: BankAccount[]): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (const acc of accounts) {
    const bal = formatMoneyTomans(acc.current_balance || 0);
    kb.text(`💳 ${acc.name} (${bal})`, `wtx_acc:${acc.id}`).row();
  }

  kb.text("🔙 تغییر دسته‌بندی", "wtx_back_cat").text("❌ انصراف", "wtx_cancel");
  return kb;
}

/**
 * پیش‌نمایش و تایید نهایی تراکنش مرحله‌ای
 */
export function wizardConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ تایید و ثبت در حسابداری", "wtx_confirm")
    .row()
    .text("✍️ افزودن بابت / توضیح", "wtx_add_desc")
    .text("❌ انصراف", "wtx_cancel");
}

/**
 * کیبورد مرحله توضیحات
 */
export function wizardDescKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⏩ ثبت بدون توضیح", "wtx_confirm")
    .row()
    .text("❌ انصراف", "wtx_cancel");
}

/* =========================================================================
   کیبوردهای شیشه‌ای افزودن حساب بانکی جدید (Account Wizard Keyboards)
   ========================================================================= */

export const POPULAR_BANKS = [
  { code: "mellat", label: "🔴 بانک ملت", name: "بانک ملت" },
  { code: "melli", label: "🔵 بانک ملی", name: "بانک ملی" },
  { code: "saderat", label: "🟣 بانک صادرات", name: "بانک صادرات" },
  { code: "pasargad", label: "🟢 پاسارگاد", name: "بانک پاسارگاد" },
  { code: "saman", label: "🟦 سامان", name: "بانک سامان" },
  { code: "blu", label: "🔷 بلوبانک", name: "بلوبانک" },
  { code: "sepah", label: "🟡 بانک سپه", name: "بانک سپه" },
  { code: "tejarat", label: "💠 بانک تجارت", name: "بانک تجارت" },
  { code: "ayandeh", label: "🏛 بانک آینده", name: "بانک آینده" },
  { code: "resalat", label: "🕌 بانک رسالت", name: "بانک رسالت" },
  { code: "parsian", label: "🏬 پارسیان", name: "بانک پارسیان" },
  { code: "keshavarzi", label: "🌾 کشاورزی", name: "بانک کشاورزی" },
  { code: "cash", label: "💵 نقدی / کیف پول", name: "کیف پول نقدی" },
];

/**
 * انتخاب نام بانک برای ساخت حساب جدید
 */
export function wizardBankSelectionKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();

  for (let i = 0; i < POPULAR_BANKS.length; i += 3) {
    const b1 = POPULAR_BANKS[i];
    const b2 = POPULAR_BANKS[i + 1];
    const b3 = POPULAR_BANKS[i + 2];

    kb.text(b1.label, `wacc_b:${b1.code}`);
    if (b2) kb.text(b2.label, `wacc_b:${b2.code}`);
    if (b3) kb.text(b3.label, `wacc_b:${b3.code}`);
    kb.row();
  }

  kb.text("✍️ تایپ نام دلخواه", "wacc_b_custom")
    .row()
    .text("❌ انصراف", "wacc_cancel");

  return kb;
}

/**
 * کیبورد مرحله موجودی اولیه حساب جدید
 */
export function wizardInitialBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("۰ تومان (حساب خالی)", "wacc_bal:0")
    .row()
    .text("🔙 تغییر نام بانک", "wacc_back_bank")
    .text("❌ انصراف", "wacc_cancel");
}

/**
 * شماره کارت اختیاری
 */
export function wizardCardNumberKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("⏩ رد شدن (بدون شماره کارت)", "wacc_card:skip")
    .row()
    .text("🔙 تغییر موجودی", "wacc_back_bal")
    .text("❌ انصراف", "wacc_cancel");
}

/**
 * دکمه لغو عملیات
 */
export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ لغو عملیات", "cancel_action");
}
