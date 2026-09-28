import { InlineKeyboard, Keyboard } from "grammy";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../services/categories";

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
 * دکمه‌های تایید و ویرایش پیش‌نمایش تراکنش
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
 * کیبورد انتخاب دسته‌بندی
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
 * دکمه لغو عملیات
 */
export function cancelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("❌ لغو عملیات", "cancel_action");
}
