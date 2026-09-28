import { BotContext, ParsedTransaction } from "../types";
import { Database } from "../db/database";
import { parseReceiptWithVision } from "../services/ai";
import { formatJalaliFull, formatMoneyTomans } from "../services/jalali";
import { getCategoryLabel } from "../services/categories";
import { transactionConfirmKeyboard } from "./keyboards";

export function formatTransactionPreview(tx: ParsedTransaction): string {
  const typeLabel = tx.tx_type === "deposit" ? "🟢 واریز (درآمد)" : "🔴 برداشت (خرج)";
  const amountStr = tx.amount_rials ? formatMoneyTomans(tx.amount_rials) : "⚠️ نامشخص";
  const catStr = getCategoryLabel(tx.category);
  const dateStr =
    tx.jalali_year && tx.jalali_month
      ? formatJalaliFull(tx.jalali_year, tx.jalali_month, tx.jalali_day)
      : "امروز";

  const lines = [
    "📄 **مشخصات تراکنش استخراج‌شده:**",
    "",
    `• **نوع:** ${typeLabel}`,
    `• **مبلغ:** **${amountStr}**`,
    `• **دسته‌بندی:** ${catStr}`,
    `• **تاریخ:** ${dateStr}`,
  ];

  if (tx.description) {
    lines.push(`• **توضیحات:** ${tx.description}`);
  }

  if (tx.notes && tx.notes.length > 0) {
    lines.push("");
    lines.push(`💡 _${tx.notes.join(" | ")}_`);
  }

  lines.push("");
  lines.push("اگر اطلاعات صحیح است، دکمه **ثبت در حسابداری** را بزنید یا آن را ویرایش کنید:");

  return lines.join("\n");
}

export async function handleReceiptPhoto(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const photos = ctx.message?.photo;
  const fileId =
    photos && photos.length > 0
      ? (photos.length >= 3 ? photos[photos.length - 2].file_id : photos[photos.length - 1].file_id)
      : ctx.message?.document?.file_id;

  if (!fileId) {
    await ctx.reply("❌ تصویری در پیام یافت نشد.");
    return;
  }

  // ۱. ارسال سریع پیام انتظار به کاربر
  const waitMsg = await ctx.reply("⏳ در حال دریافت و تحلیل هوشمند تصویر رسید با هوش مصنوعی کلادفلر...");

  // ۲. منطق پردازش تصویر در پس‌زمینه
  const processImageTask = async () => {
    try {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) {
        throw new Error("مسیر فایل از سرور تلگرام دریافت نشد.");
      }

      const fileUrl = `https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.file_path}`;
      const fileRes = await fetch(fileUrl);

      if (!fileRes.ok) {
        throw new Error("خطا در دانلود تصویر رسید از سرور تلگرام");
      }

      const imageBytes = new Uint8Array(await fileRes.arrayBuffer());
      const parsed = await parseReceiptWithVision(ctx.env, imageBytes);

      const token = crypto.randomUUID().slice(0, 10);
      const db = new Database(ctx.env.DB);
      await db.saveDraft(token, user.id, parsed);

      // به‌جای ارسال پیام جدید، همان پیام انتظار را ویرایش می‌کنیم تا هیچ پیامی تکراری نشود
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        formatTransactionPreview(parsed),
        {
          parse_mode: "Markdown",
          reply_markup: transactionConfirmKeyboard(token),
        }
      );
    } catch (error: any) {
      console.error("Receipt processing failed:", error);
      const errDetail = error?.message ? `\nجزییات: ${error.message}` : "";
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ خطا در پردازش تصویر رسید.${errDetail}\nلطفاً مجدداً ارسال کنید.`
      ).catch(() => {});
    }
  };

  // اگر ورکر دارای executionCtx باشد، در پس‌زمینه اجرا کن تا تلگرام معطل نشود و پیام را تکرار نکند
  if (ctx.executionCtx) {
    ctx.executionCtx.waitUntil(processImageTask());
  } else {
    await processImageTask();
  }
}
