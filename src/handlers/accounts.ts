import { BotContext } from "../types";
import { Database } from "../db/database";
import { formatMoneyTomans } from "../services/jalali";
import { parseAmountInput } from "../services/parser";
import {
  accountsListKeyboard,
  POPULAR_BANKS,
  wizardBankSelectionKeyboard,
  wizardCardNumberKeyboard,
  wizardInitialBalanceKeyboard,
} from "./keyboards";

const BANK_ID_MAP: Record<string, number> = {
  blu: 1,
  mellat: 2,
  melli: 3,
  saman: 4,
  tejarat: 5,
  pasargad: 6,
  sepah: 7,
  keshavarzi: 8,
  saderat: 9,
  parsian: 10,
  refah: 11,
  shahr: 12,
  ayandeh: 13,
  cash: 14,
};

/**
 * نمایش لیست حساب‌ها و کارت‌های کاربر به همراه دکمه شیشه‌ای افزودن حساب
 */
export async function handleAccounts(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const db = new Database(ctx.env.DB);
  await db.ensureDefaultAccount(user.id);
  const accounts = await db.getAccountsWithBalance(user.id);

  if (accounts.length === 0) {
    await ctx.reply("هیچ حسابی یافت نشد.", {
      reply_markup: accountsListKeyboard(),
    });
    return;
  }

  let totalWealth = 0;
  const lines: string[] = ["💳 **لیست حساب‌ها و کارت‌های شما:**\n"];

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const balance = acc.current_balance || 0;
    totalWealth += balance;

    const cardInfo = acc.card_number ? ` (کارت: \`${acc.card_number.slice(-4)}\`)` : "";
    lines.push(
      `${i + 1}. **${acc.name}**${cardInfo}\n` +
      `   💰 موجودی: **${formatMoneyTomans(balance)}**\n`
    );
  }

  lines.push("──────────────");
  lines.push(`🏦 **مجموع دارایی:** **${formatMoneyTomans(totalWealth)}**\n`);
  lines.push("برای افزودن حساب جدید روی دکمه زیر کلیک کنید:");

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: accountsListKeyboard(),
  });
}

/**
 * شروع ثبت حساب مرحله به مرحله (مرحله ۱: انتخاب بانک)
 */
export async function startAccountWizard(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const db = new Database(ctx.env.DB);
  await db.setUserState(user.id, "w_acc_bank", {});

  const text =
    "🏦 **افزودن حساب یا کارت جدید (مرحله ۱ از ۳)**\n\n" +
    "لطفاً بانک خود را از لیست زیر انتخاب کنید یا گزینه «✍️ تایپ نام دلخواه» را بزنید:";

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: wizardBankSelectionKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: wizardBankSelectionKeyboard(),
    });
  }
}

/**
 * مدیریت دستور متنی /newaccount
 */
export async function handleNewAccount(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const text = (ctx.message?.text || "").trim();
  const parts = text.split(/\s+/);

  // اگر پارامتری داده نشده بود، فرآیند مرحله به مرحله شروع شود
  if (parts.length < 2) {
    await startAccountWizard(ctx);
    return;
  }

  // سازگاری با دستور تک‌خطی در صورت تمایل
  const name = parts[1];
  const initialTomans = parts[2] ? parseInt(parts[2].replace(/,/g, ""), 10) : 0;
  const initialRials = isNaN(initialTomans) ? 0 : initialTomans * 10;
  const cardNumber = parts[3] ? parts[3].replace(/[-\s]/g, "") : undefined;

  const db = new Database(ctx.env.DB);
  await db.createAccount(user.id, name, undefined, cardNumber, initialRials);

  await ctx.reply(
    `✅ حساب جدید با نام **${name}** و موجودی اولیه **${formatMoneyTomans(initialRials)}** با موفقیت ساخته شد.`,
    {
      parse_mode: "Markdown",
      reply_markup: accountsListKeyboard(),
    }
  );
}

/**
 * مدیریت کلیک‌های اینلاین ثبت حساب (Account Wizard Callbacks)
 */
export async function handleAccountCallbacks(ctx: BotContext): Promise<void> {
  const query = ctx.callbackQuery;
  const data = query?.data;
  const user = ctx.from;
  if (!query || !data || !user) return;

  const db = new Database(ctx.env.DB);

  // ۱. شروع ویزارد
  if (data === "wacc_start") {
    await startAccountWizard(ctx);
    return;
  }

  // ۲. لغو
  if (data === "wacc_cancel") {
    await db.clearUserState(user.id);
    await ctx.answerCallbackQuery({ text: "عملیات لغو شد." });
    await ctx.editMessageText("❌ فرآیند ساخت حساب لغو شد.");
    return;
  }

  // ۳. بازگشت به انتخاب بانک
  if (data === "wacc_back_bank") {
    await startAccountWizard(ctx);
    return;
  }

  // ۴. تایپ نام دلخواه بانک
  if (data === "wacc_b_custom") {
    await db.setUserState(user.id, "w_acc_name_custom", {});
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "✍️ **نام دلخواه برای حساب خود را بفرستید:**\n\n" +
      "مثلاً: `کارت دوم ملت`، `کیف پول نقدی`، `صندوق خانوادگی`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ۵. انتخاب یک بانک از لیست
  if (data.startsWith("wacc_b:")) {
    const code = data.split(":")[1];
    const found = POPULAR_BANKS.find((b) => b.code === code);
    const bankName = found ? found.name : "حساب بانکی";
    const bankId = BANK_ID_MAP[code];

    await db.setUserState(user.id, "w_acc_balance", {
      bank_name: bankName,
      bank_id: bankId,
      code,
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💰 **مرحله ۲ از ۳: موجودی اولیه حساب «${bankName}»**\n\n` +
      "لطفاً موجودی اولیه این حساب را به تومان تایپ و ارسال کنید:\n" +
      "*(اگر حساب خالی است، دکمه «۰ تومان» زیر را بزنید یا عدد 0 را بفرستید)*",
      {
        parse_mode: "Markdown",
        reply_markup: wizardInitialBalanceKeyboard(),
      }
    );
    return;
  }

  // ۶. بازگشت به انتخاب موجودی
  if (data === "wacc_back_bal") {
    const session = await db.getUserState(user.id);
    const bankName = session?.data?.bank_name || "حساب جدید";

    await db.setUserState(user.id, "w_acc_balance", session?.data || {});
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💰 **مرحله ۲ از ۳: موجودی اولیه حساب «${bankName}»**\n\n` +
      "لطفاً موجودی اولیه این حساب را به تومان تایپ و ارسال کنید:\n" +
      "*(اگر حساب خالی است، دکمه «۰ تومان» زیر را بزنید یا عدد 0 را بفرستید)*",
      {
        parse_mode: "Markdown",
        reply_markup: wizardInitialBalanceKeyboard(),
      }
    );
    return;
  }

  // ۷. انتخاب موجودی از دکمه‌های آماده
  if (data.startsWith("wacc_bal:")) {
    const rawBal = parseInt(data.split(":")[1], 10) || 0;
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};

    stateData.initial_tomans = rawBal;
    stateData.initial_rials = rawBal * 10;

    await db.setUserState(user.id, "w_acc_card", stateData);
    await ctx.answerCallbackQuery();

    const bankName = stateData.bank_name || "حساب جدید";
    await ctx.editMessageText(
      `💳 **مرحله ۳ از ۳: شماره کارت (اختیاری)**\n\n` +
      `• حساب: **${bankName}**\n` +
      `• موجودی اولیه: **${formatMoneyTomans(stateData.initial_rials)}**\n\n` +
      "شماره ۱۶ رقمی کارت یا ۴ رقم آخر را بفرستید (جهت تشخیص خودکار در رسیدها)\n" +
      "یا اگر مایل نیستید، دکمه «رد شدن» را بزنید:",
      {
        parse_mode: "Markdown",
        reply_markup: wizardCardNumberKeyboard(),
      }
    );
    return;
  }

  // ۸. رد شدن از شماره کارت و ثبت نهایی حساب
  if (data === "wacc_card:skip") {
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};
    const bankName = stateData.bank_name || "حساب بانکی جدید";
    const initialRials = stateData.initial_rials || 0;
    const bankId = stateData.bank_id;

    await db.createAccount(user.id, bankName, bankId, undefined, initialRials);
    await db.clearUserState(user.id);

    await ctx.answerCallbackQuery({ text: "✅ حساب با موفقیت ایجاد شد!" });
    await ctx.editMessageText(
      `🎉 **حساب با موفقیت اضافه شد!**\n\n` +
      `🏦 نام حساب: **${bankName}**\n` +
      `💰 موجودی اولیه: **${formatMoneyTomans(initialRials)}**\n` +
      `💳 شماره کارت: _ثبت نشده_\n\n` +
      `از این پس می‌توانید مبالغ واریز و برداشت را به این حساب متصل کنید.`,
      {
        parse_mode: "Markdown",
        reply_markup: accountsListKeyboard(),
      }
    );
    return;
  }
}

/**
 * پردازش ورودی‌های متنی مربوط به ساخت حساب در حالت ویزارد
 */
export async function handleAccountTextStep(
  ctx: BotContext,
  state: string,
  stateData: any
): Promise<boolean> {
  const user = ctx.from;
  const text = (ctx.message?.text || "").trim();
  if (!user || !text) return false;

  const db = new Database(ctx.env.DB);

  // ۱. دریافت نام دلخواه
  if (state === "w_acc_name_custom") {
    stateData.bank_name = text;
    await db.setUserState(user.id, "w_acc_balance", stateData);

    await ctx.reply(
      `💰 **مرحله ۲ از ۳: موجودی اولیه حساب «${text}»**\n\n` +
      "لطفاً موجودی اولیه این حساب را به تومان تایپ و ارسال کنید:\n" +
      "*(اگر حساب خالی است، دکمه «۰ تومان» زیر را بزنید یا عدد 0 را بفرستید)*",
      {
        parse_mode: "Markdown",
        reply_markup: wizardInitialBalanceKeyboard(),
      }
    );
    return true;
  }

  // ۲. دریافت مبلغ دلخواه موجودی اولیه
  if (state === "w_acc_balance") {
    const parsed = parseAmountInput(text);
    if (!parsed) {
      await ctx.reply("❌ مبلغ نامعتبر است. لطفاً عدد معتبری به تومان وارد کنید یا یکی از دکمه‌ها را بزنید.");
      return true;
    }

    stateData.initial_tomans = parsed.tomans;
    stateData.initial_rials = parsed.rials;
    await db.setUserState(user.id, "w_acc_card", stateData);

    const bankName = stateData.bank_name || "حساب جدید";
    await ctx.reply(
      `💳 **مرحله ۳ از ۳: شماره کارت (اختیاری)**\n\n` +
      `• حساب: **${bankName}**\n` +
      `• موجودی اولیه: **${formatMoneyTomans(parsed.rials)}**\n\n` +
      "شماره ۱۶ رقمی کارت یا ۴ رقم آخر را بفرستید\n" +
      "یا اگر مایل نیستید، دکمه «رد شدن» را بزنید:",
      {
        parse_mode: "Markdown",
        reply_markup: wizardCardNumberKeyboard(),
      }
    );
    return true;
  }

  // ۳. دریافت شماره کارت
  if (state === "w_acc_card") {
    const cardNumber = text.replace(/[-\s]/g, "");
    const bankName = stateData.bank_name || "حساب جدید";
    const initialRials = stateData.initial_rials || 0;
    const bankId = stateData.bank_id;

    await db.createAccount(user.id, bankName, bankId, cardNumber, initialRials);
    await db.clearUserState(user.id);

    await ctx.reply(
      `🎉 **حساب با موفقیت اضافه شد!**\n\n` +
      `🏦 نام حساب: **${bankName}**\n` +
      `💰 موجودی اولیه: **${formatMoneyTomans(initialRials)}**\n` +
      `💳 شماره کارت: \`${cardNumber}\`\n\n` +
      `اکنون حساب شما آماده ثبت تراکنش است.`,
      {
        parse_mode: "Markdown",
        reply_markup: accountsListKeyboard(),
      }
    );
    return true;
  }

  return false;
}
