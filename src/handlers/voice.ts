import { BotContext } from "../types";
import { Database } from "../db/database";
import { parseTransactionFromText, transcribeVoice } from "../services/ai";
import { formatTransactionPreview } from "./receipt";
import { transactionConfirmKeyboard } from "./keyboards";

export async function handleVoiceMessage(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const waitMsg = await ctx.reply("🎙 در حال شنیدن صدای شما و تبدیل به متن با مدل هوش مصنوعی Whisper...");

  try {
    const voice = ctx.message?.voice || ctx.message?.audio;
    if (!voice) {
      throw new Error("پیام صوتی یافت نشد.");
    }

    const file = await ctx.api.getFile(voice.file_id);
    if (!file.file_path) {
      throw new Error("مسیر فایل صوتی از سرور تلگرام دریافت نشد.");
    }

    const fileUrl = `https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.file_path}`;
    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
      throw new Error("خطا در دانلود ویس صوتی از سرور تلگرام");
    }

    const audioBytes = new Uint8Array(await fileRes.arrayBuffer());

    // 1. تبدیل گفتار به متن
    const transcribedText = await transcribeVoice(ctx.env, audioBytes);

    if (!transcribedText || transcribedText.length < 2) {
      await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
      await ctx.reply("❌ صدایی از وویس شما تشخیص داده نشد. لطفاً واضح‌تر صحبت کنید.");
      return;
    }

    // به‌روزرسانی پیام انتظار به استخراج داده
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `🎙 _متن شنیده‌شده:_\n«${transcribedText}»\n\n⏳ در حال استخراج مبلغ و مشخصات مالی...`,
      { parse_mode: "Markdown" }
    ).catch(() => {});

    // 2. استخراج اطلاعات تراکنش با هوش مصنوعی
    const parsed = await parseTransactionFromText(ctx.env, transcribedText);
    parsed.notes = [`متن شنیده‌شده: «${transcribedText}»`];

    const token = crypto.randomUUID().slice(0, 10);
    const db = new Database(ctx.env.DB);
    await db.saveDraft(token, user.id, parsed);

    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});

    await ctx.reply(formatTransactionPreview(parsed), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
  } catch (error: any) {
    console.error("Voice processing failed:", error);
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    const errDetail = error?.message ? `\nجزییات: ${error.message}` : "";
    await ctx.reply(`❌ خطا در پردازش پیام صوتی.${errDetail}\nلطفاً مجدداً امتحان کنید.`);
  }
}
