import { Bot, webhookCallback } from "grammy";
import { BotContext } from "./types";
import { Env, isUserAllowed } from "./config";
import { Database } from "./db/database";
import { handleHelp, handleStart } from "./handlers/start";
import { handleAccounts, handleAccountCallbacks, handleNewAccount, startAccountWizard } from "./handlers/accounts";
import {
  handleIncomingText,
  handleManualDeposit,
  handleManualWithdraw,
  handleTransactionCallbacks,
  startTransactionWizard,
} from "./handlers/transaction";
import { handleReceiptPhoto } from "./handlers/receipt";
import { handleVoiceMessage } from "./handlers/voice";
import { handleReport, handleReportCallbacks } from "./handlers/reports";

export default {
  async fetch(request: Request, env: Env, executionCtx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // پاسخ صفحه سلامت برای مرورگر
    if (request.method === "GET") {
      return new Response(
        "🚀 ربات حسابدار هوشمند «حساب‌یار» (HesabYar) بر روی ورکر کلادفلر با موفقیت آنلاین است!\n\n" +
          "وضعیت سیستم: فعال و آماده دریافت وب‌هوک تلگرام.",
        {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      );
    }

    if (!env.BOT_TOKEN) {
      return new Response("خطا: BOT_TOKEN در تنظیمات ورکر تنظیم نشده است.", { status: 500 });
    }

    // مقداردهی اولیه ربات
    const bot = new Bot<BotContext>(env.BOT_TOKEN);

    // مدیریت خطاهای سراسری جهت عدم تکرار وبهوک توسط تلگرام
    bot.catch((err) => {
      console.error("Bot unhandled error:", err);
    });

    // میدلور تزریق env و اعتبارسنجی کاربر
    bot.use(async (ctx, next) => {
      ctx.env = env;
      ctx.executionCtx = executionCtx;
      if (ctx.from && !isUserAllowed(ctx.from.id, env.ALLOWED_USER_IDS)) {
        await ctx.reply("⛔ شما مجاز به استفاده از این ربات حسابداری نیستید.");
        return;
      }
      await next();
    });

    // بررسی دیتابیس
    const db = new Database(env.DB);
    await db.init();

    // ۱. دستورات اصلی
    bot.command("start", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await handleStart(ctx);
    });
    bot.command("help", handleHelp);
    bot.command("cancel", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await ctx.reply(" عملیات جاری لغو شد. می‌توانید از منوی پایین گزینه مورد نظر را انتخاب کنید.");
    });
    bot.command("accounts", handleAccounts);
    bot.command("newaccount", handleNewAccount);
    bot.command("deposit", handleManualDeposit);
    bot.command("withdraw", handleManualWithdraw);
    bot.command("report", handleReport);

    // ۲. دکمه‌های کیبورد پایین (ثبت مرحله به مرحله با دکمه‌های شیشه‌ای)
    bot.hears("➕ ثبت واریز (درآمد)", async (ctx) => {
      await startTransactionWizard(ctx, "deposit");
    });

    bot.hears("➖ ثبت برداشت (خرج)", async (ctx) => {
      await startTransactionWizard(ctx, "withdraw");
    });

    bot.hears("📷 ارسال رسید (عکس)", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await ctx.reply("📷 لطفاً تصویر رسید بانکی یا فاکتور خرید را ارسال کنید.");
    });

    bot.hears("🎙 ثبت با ویس (صدا)", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await ctx.reply(
        "🎙 دکمه ضبط صدا را نگه دارید و خرج یا درآمد خود را بگویید!\n" +
          "مثال: «امروز پنجاه هزار تومن دادم بنزین»"
      );
    });

    bot.hears("📊 گزارش ماه جاری", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await handleReport(ctx);
    });

    bot.hears("💳 حساب‌ها و کارت‌ها", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await handleAccounts(ctx);
    });

    // ۳. ورودی‌های چندرسانه‌ای
    bot.on("message:photo", async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await handleReceiptPhoto(ctx);
    });

    bot.on("message:document", async (ctx) => {
      const mime = ctx.message.document.mime_type || "";
      if (mime.startsWith("image/")) {
        if (ctx.from) await db.clearUserState(ctx.from.id);
        await handleReceiptPhoto(ctx);
      } else {
        await ctx.reply("لطفاً فایل تصویری، پیام صوتی یا متن ارسال کنید.");
      }
    });

    bot.on(["message:voice", "message:audio"], async (ctx) => {
      if (ctx.from) await db.clearUserState(ctx.from.id);
      await handleVoiceMessage(ctx);
    });

    // ۴. متن‌های ارسالی (مراحل ویزارد یا پیامک بانکی)
    bot.on("message:text", handleIncomingText);

    // ۵. کال‌بک‌های دکمه‌های شیشه‌ای (اینلاین)
    bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("rep_")) {
        await handleReportCallbacks(ctx);
      } else if (data.startsWith("wacc_")) {
        await handleAccountCallbacks(ctx);
      } else if (
        data.startsWith("wtx_") ||
        data.startsWith("tx_") ||
        data.startsWith("cat_") ||
        data === "cancel_action"
      ) {
        await handleTransactionCallbacks(ctx);
      }
    });

    // تحویل وب‌هوک به کلادفلر
    return webhookCallback(bot, "cloudflare-mod")(request);
  },
};
