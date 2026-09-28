import { BotContext } from "../types";
import { Database } from "../db/database";
import { mainReplyKeyboard } from "./keyboards";

export async function handleStart(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const db = new Database(ctx.env.DB);
  await db.ensureDefaultAccount(user.id, ctx.env.DEFAULT_ACCOUNT_NAME || "حساب اصلی");

  const welcomeMessage = `
👋 سلام ${user.first_name || "کاربر گرامی"}! به **حساب‌یار (HesabYar)** خوش آمدید.

من دستیار هوشمند حسابداری شخصی شما روی کلادفلر هستم.

✨ **امکانات در یک نگاه:**
• 📷 **خواندن عکس رسید:** فقط کافیست عکس رسید بانکی یا فاکتور را بفرستید تا هوش مصنوعی مبلغ، تاریخ و دسته‌بندی را استخراج کند.
• 🎙 **دستیار صوتی (وویس):** فقط دکمه ویس را نگه دارید و خرجتان را بگویید (مثلاً: *"۵۰ تومن دادم بنزین"*).
• ✉️ **پیامک بانکی:** متن پیامک بانک را فوروارد یا کپی کنید تا خودش واریز/برداشت را تشخیص دهد.
• 💳 **مدیریت کارت‌ها:** ثبت کارت و بانک با موجودی اولیه و محاسبه مانده لحظه‌ای.
• 📊 **گزارش‌گیری پیشرفته:** دریافت خلاصه ماهانه با **خروجی اکسل (.xlsx)** و **نمودارهای تصویری**.

برای شروع از منوی زیر استفاده کنید یا عکس/ویس بفرستید:
  `.trim();

  await ctx.reply(welcomeMessage, {
    parse_mode: "Markdown",
    reply_markup: mainReplyKeyboard(),
  });
}

export async function handleHelp(ctx: BotContext): Promise<void> {
  const helpText = `
📖 **راهنمای استفاده از حساب‌یار:**

۱. **ثبت با عکس:** هر عکس رسیدی بفرستید، مستقیماً توسط هوش مصنوعی پردازش می‌شود.
۲. **ثبت با وویس:** یک پیام صوتی بفرستید و بگویید چه مبلغی بابت چه کاری پرداخت یا دریافت کردید.
۳. **ثبت دستی:** می‌توانید از دستورات زیر استفاده کنید:
   • \`/deposit 500000 حقوق\` (واریز ۵۰ هزار تومان)
   • \`/withdraw 120000 ناهار\` (برداشت ۱۲ هزار تومان)
۴. **گزارش‌ها:** با دستور \`/report\` وضعیت ماه جاری را ببینید و فایل اکسل یا نمودار بگیرید.
۵. **حساب‌ها:** با دستور \`/accounts\` موجودی و لیست کارت‌هایتان را مدیریت کنید.
  `.trim();

  await ctx.reply(helpText, { parse_mode: "Markdown" });
}
