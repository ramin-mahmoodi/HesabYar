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

  const waitMsg = await ctx.reply("⏳ در حال دریافت و تحلیل هوشمند تصویر رسید با هوش مصنوعی کلادفلر...");

  try {
    const photos = ctx.message?.photo;
    const fileId =
      photos && photos.length > 0
        ? photos[photos.length - 1].file_id
        : ctx.message?.document?.file_id;

    if (!fileId) {
      throw new Error("تصویری در پیام یافت نشد.");
    }

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

    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});

    await ctx.reply(formatTransactionPreview(parsed), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
  } catch (error: any) {
    console.error("Receipt processing failed:", error);
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    const errDetail = error?.message ? `\nجزییات: ${error.message}` : "";
    await ctx.reply(`❌ خطا در پردازش تصویر رسید.${errDetail}\nلطفاً مجدداً ارسال کنید.`);
  }
}
