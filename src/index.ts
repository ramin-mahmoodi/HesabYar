import { Bot, webhookCallback } from "grammy";
import { BotContext } from "./types";
import { Env, isUserAllowed } from "./config";
import { Database } from "./db/database";
import { handleHelp, handleStart } from "./handlers/start";
import { handleAccounts, handleNewAccount } from "./handlers/accounts";
import {
  handleIncomingText,
  handleManualDeposit,
  handleManualWithdraw,
  handleTransactionCallbacks,
} from "./handlers/transaction";
import { handleReceiptPhoto } from "./handlers/receipt";
import { handleVoiceMessage } from "./handlers/voice";
import { handleReport, handleReportCallbacks } from "./handlers/reports";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // میدلور تزریق env و اعتبارسنجی کاربر
    bot.use(async (ctx, next) => {
      ctx.env = env;
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
    bot.command("start", handleStart);
    bot.command("help", handleHelp);
    bot.command("accounts", handleAccounts);
    bot.command("newaccount", handleNewAccount);
    bot.command("deposit", handleManualDeposit);
    bot.command("withdraw", handleManualWithdraw);
    bot.command("report", handleReport);

    // ۲. دکمه‌های کیبورد پایین
    bot.hears("➕ ثبت واریز (درآمد)", async (ctx) => {
      await ctx.reply("مبلغ و بابت واریز را بفرستید.\nمثال: `/deposit 2000000 حقوق`", {
        parse_mode: "Markdown",
      });
    });

    bot.hears("➖ ثبت برداشت (خرج)", async (ctx) => {
      await ctx.reply("مبلغ و بابت هزینه را بفرستید.\nمثال: `/withdraw 150000 بنزین`", {
        parse_mode: "Markdown",
      });
    });

    bot.hears("📷 ارسال رسید (عکس)", async (ctx) => {
      await ctx.reply("📷 لطفاً تصویر رسید بانکی یا فاکتور خرید را ارسال کنید.");
    });

    bot.hears("🎙 ثبت با ویس (صدا)", async (ctx) => {
      await ctx.reply(
        "🎙 دکمه ضبط صدا را نگه دارید و خرجتان را بگویید!\n" +
          "مثال: «امروز پنجاه هزار تومن دادم کرایه اسنپ»"
      );
    });

    bot.hears("📊 گزارش ماه جاری", handleReport);
    bot.hears("💳 حساب‌ها و کارت‌ها", handleAccounts);

    // ۳. ورودی‌های چندرسانه‌ای
    bot.on("message:photo", handleReceiptPhoto);
    bot.on("message:document", async (ctx) => {
      const mime = ctx.message.document.mime_type || "";
      if (mime.startsWith("image/")) {
        await handleReceiptPhoto(ctx);
      } else {
        await ctx.reply("لطفاً فایل تصویری، پیام صوتی یا متن ارسال کنید.");
      }
    });

    bot.on(["message:voice", "message:audio"], handleVoiceMessage);

    // ۴. متن‌های ارسالی (پیامک بانکی یا جملات آزاد)
    bot.on("message:text", handleIncomingText);

    // ۵. کال‌بک‌های اینلاین
    bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      if (data.startsWith("rep_")) {
        await handleReportCallbacks(ctx);
      } else if (
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
