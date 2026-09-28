import { BotContext, ParsedTransaction } from "../types";
import { Database } from "../db/database";
import { formatTransactionPreview } from "./receipt";
import {
  categoriesKeyboard,
  transactionConfirmKeyboard,
  wizardAccountsKeyboard,
  wizardAmountKeyboard,
  wizardCategoryKeyboard,
  wizardConfirmKeyboard,
  wizardDescKeyboard,
} from "./keyboards";
import { formatJalaliFull, formatMoneyTomans, getTodayJalali, toGregorian } from "../services/jalali";
import { getCategoryLabel, guessCategoryFromText } from "../services/categories";
import { parseTransactionFromText } from "../services/ai";
import { parseAmountInput } from "../services/parser";
import { handleAccountTextStep } from "./accounts";

/**
 * شروع ویزارد ثبت تراکنش مرحله به مرحله (مرحله ۱: تعیین مبلغ)
 */
export async function startTransactionWizard(
  ctx: BotContext,
  txType: "deposit" | "withdraw"
): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const db = new Database(ctx.env.DB);
  await db.setUserState(user.id, "w_tx_amount", { tx_type: txType });

  const isDeposit = txType === "deposit";
  const icon = isDeposit ? "➕" : "➖";
  const label = isDeposit ? "واریز (درآمد)" : "برداشت (هزینه)";

  const text =
    `${icon} **ثبت ${label} - مرحله ۱ از ۳**\n\n` +
    "لطفاً مبلغ را به تومان تایپ و ارسال کنید:\n" +
    "*(مثلاً: `۷۵۰۰۰` یا `150 هزار` یا `۱.۵ میلیون`)*";

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: wizardAmountKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: wizardAmountKeyboard(),
    });
  }
}

export async function handleManualDeposit(ctx: BotContext): Promise<void> {
  const text = (ctx.message?.text || "").trim();
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await startTransactionWizard(ctx, "deposit");
    return;
  }
  await handleQuickTextCommand(ctx, "deposit", parts);
}

export async function handleManualWithdraw(ctx: BotContext): Promise<void> {
  const text = (ctx.message?.text || "").trim();
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    await startTransactionWizard(ctx, "withdraw");
    return;
  }
  await handleQuickTextCommand(ctx, "withdraw", parts);
}

/**
 * در صورتی که کاربر مستقیماً دستور تک‌خطی فرستاد (مثلاً /withdraw 50000 بنزین)
 */
async function handleQuickTextCommand(
  ctx: BotContext,
  txType: "deposit" | "withdraw",
  parts: string[]
): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const parsedAmount = parseAmountInput(parts[1]);
  if (!parsedAmount) {
    await ctx.reply("❌ مبلغ واردشده نامعتبر است.");
    return;
  }

  const description = parts.slice(2).join(" ") || (txType === "deposit" ? "واریزی دستی" : "هزینه دستی");
  const category = guessCategoryFromText(description, txType);
  const today = getTodayJalali();

  const parsed: ParsedTransaction = {
    amount_rials: parsedAmount.rials,
    tx_type: txType,
    category,
    description,
    jalali_year: today.year,
    jalali_month: today.month,
    jalali_day: today.day,
    notes: ["ثبت دستی با دستور متنی"],
  };

  const token = crypto.randomUUID().slice(0, 10);
  const db = new Database(ctx.env.DB);
  await db.saveDraft(token, user.id, parsed);

  await ctx.reply(formatTransactionPreview(parsed), {
    parse_mode: "Markdown",
    reply_markup: transactionConfirmKeyboard(token),
  });
}

/**
 * مدیریت کلیک‌های اینلاین مربوط به تراکنش‌ها (هم ویزارد و هم پیش‌نمایش رسید و ویس)
 */
export async function handleTransactionCallbacks(ctx: BotContext): Promise<void> {
  const query = ctx.callbackQuery;
  const data = query?.data;
  const user = ctx.from;
  if (!query || !data || !user) return;

  const db = new Database(ctx.env.DB);

  /* -------------------------------------------------------------------------
     ۱. فرآیند مرحله به مرحله (Transaction Wizard Callbacks)
     ------------------------------------------------------------------------- */

  // ۱.۱ انصراف از ویزارد
  if (data === "wtx_cancel") {
    await db.clearUserState(user.id);
    await ctx.answerCallbackQuery({ text: "عملیات لغو شد." });
    await ctx.editMessageText("❌ ثبت تراکنش لغو شد.");
    return;
  }

  // ۱.۲ بازگشت به مرحله مبلغ
  if (data === "wtx_back_amt") {
    const session = await db.getUserState(user.id);
    const txType: "deposit" | "withdraw" = session?.data?.tx_type || "withdraw";
    await db.setUserState(user.id, "w_tx_amount", { tx_type: txType });

    const isDeposit = txType === "deposit";
    const icon = isDeposit ? "➕" : "➖";
    const label = isDeposit ? "واریز (درآمد)" : "برداشت (هزینه)";

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${icon} **ثبت ${label} - مرحله ۱ از ۳**\n\n` +
      "لطفاً مبلغ را به تومان تایپ و ارسال کنید:\n" +
      "*(مثلاً: `۷۵۰۰۰` یا `150 هزار` یا `۱.۵ میلیون`)*",
      {
        parse_mode: "Markdown",
        reply_markup: wizardAmountKeyboard(),
      }
    );
    return;
  }

  // ۱.۳ انتخاب مبلغ از دکمه‌های آماده
  if (data.startsWith("wtx_a:")) {
    const amountTomans = parseInt(data.split(":")[1], 10) || 0;
    const session = await db.getUserState(user.id);
    const txType: "deposit" | "withdraw" = session?.data?.tx_type || "withdraw";

    const stateData = {
      tx_type: txType,
      amount_tomans: amountTomans,
      amount_rials: amountTomans * 10,
    };
    await db.setUserState(user.id, "w_tx_category", stateData);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🏷 **مرحله ۲ از ۳: انتخاب دسته‌بندی**\n\n` +
      `💰 مبلغ: **${formatMoneyTomans(stateData.amount_rials)}**\n\n` +
      "لطفاً دسته‌بندی این تراکنش را از دکمه‌های شیشه‌ای زیر انتخاب کنید:",
      {
        parse_mode: "Markdown",
        reply_markup: wizardCategoryKeyboard(txType),
      }
    );
    return;
  }

  // ۱.۴ بازگشت به انتخاب دسته‌بندی
  if (data === "wtx_back_cat") {
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};
    const txType: "deposit" | "withdraw" = stateData.tx_type || "withdraw";
    await db.setUserState(user.id, "w_tx_category", stateData);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🏷 **مرحله ۲ از ۳: انتخاب دسته‌بندی**\n\n` +
      `💰 مبلغ: **${formatMoneyTomans(stateData.amount_rials || 0)}**\n\n` +
      "لطفاً دسته‌بندی مناسب را انتخاب کنید:",
      {
        parse_mode: "Markdown",
        reply_markup: wizardCategoryKeyboard(txType),
      }
    );
    return;
  }

  // ۱.۵ انتخاب دسته‌بندی
  if (data.startsWith("wtx_c:")) {
    const catKey = data.split(":")[1];
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};
    stateData.category = catKey;

    await db.ensureDefaultAccount(user.id);
    const accounts = await db.getAccountsWithBalance(user.id);

    await db.setUserState(user.id, "w_tx_account", stateData);

    const isDeposit = stateData.tx_type === "deposit";
    const targetPrompt = isDeposit ? "این مبلغ به کدام حساب شما واریز شد؟" : "این مبلغ از کدام حساب شما کسر شد؟";

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `💳 **مرحله ۳ از ۳: انتخاب حساب یا کارت**\n\n` +
      `• مبلغ: **${formatMoneyTomans(stateData.amount_rials || 0)}**\n` +
      `• دسته‌بندی: **${getCategoryLabel(catKey)}**\n\n` +
      `${targetPrompt}`,
      {
        parse_mode: "Markdown",
        reply_markup: wizardAccountsKeyboard(accounts),
      }
    );
    return;
  }

  // ۱.۶ انتخاب حساب و نمایش پیش‌نمایش تایید
  if (data.startsWith("wtx_acc:")) {
    const accId = parseInt(data.split(":")[1], 10);
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};
    stateData.account_id = accId;

    const account = await db.getAccount(accId);
    stateData.account_name = account ? account.name : "حساب بانکی";

    await db.setUserState(user.id, "w_tx_confirm", stateData);

    const isDeposit = stateData.tx_type === "deposit";
    const typeLabel = isDeposit ? "🟢 واریز (درآمد)" : "🔴 برداشت (هزینه)";
    const today = getTodayJalali();
    const desc = stateData.description || "-";

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📋 **پیش‌نمایش تراکنش آماده ثبت:**\n\n` +
      `• **نوع:** ${typeLabel}\n` +
      `• **مبلغ:** **${formatMoneyTomans(stateData.amount_rials || 0)}**\n` +
      `• **دسته‌بندی:** ${getCategoryLabel(stateData.category)}\n` +
      `• **حساب:** ${stateData.account_name}\n` +
      `• **تاریخ:** امروز (${formatJalaliFull(today.year, today.month, today.day)})\n` +
      `• **بابت:** ${desc}\n\n` +
      `اگر اطلاعات صحیح است، دکمه تایید و ثبت را بزنید:`,
      {
        parse_mode: "Markdown",
        reply_markup: wizardConfirmKeyboard(),
      }
    );
    return;
  }

  // ۱.۷ درخواست افزودن توضیح/بابت
  if (data === "wtx_add_desc") {
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};

    await db.setUserState(user.id, "w_tx_desc", stateData);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      "✍️ **افزودن بابت یا توضیح:**\n\n" +
      "لطفاً متن توضیح را تایپ و ارسال کنید (مثلاً: `ناهار رستوران` یا `خرید بنزین جایگاه`)\n" +
      "یا اگر توضیحی ندارید دکمه «ثبت بدون توضیح» را بزنید:",
      {
        parse_mode: "Markdown",
        reply_markup: wizardDescKeyboard(),
      }
    );
    return;
  }

  // ۱.۸ تایید نهایی تراکنش مرحله‌ای و ثبت در دیتابیس
  if (data === "wtx_confirm") {
    const session = await db.getUserState(user.id);
    const stateData = session?.data || {};

    if (!stateData.amount_rials || !stateData.tx_type) {
      await ctx.answerCallbackQuery({ text: "اطلاعات منقضی شده است.", show_alert: true });
      return;
    }

    const today = getTodayJalali();
    const gregDate = toGregorian(today.year, today.month, today.day);

    let account = null;
    if (stateData.account_id) {
      account = await db.getAccount(stateData.account_id);
    }
    if (!account) {
      account = await db.ensureDefaultAccount(user.id);
    }

    const isDeposit = stateData.tx_type === "deposit";
    const defaultDesc = isDeposit ? "واریزی" : "هزینه";
    const description = stateData.description || defaultDesc;
    const category = stateData.category || (isDeposit ? "other_income" : "other_expense");

    await db.addTransaction(
      user.id,
      account.id,
      stateData.tx_type,
      stateData.amount_rials,
      description,
      category,
      "manual",
      gregDate,
      today.year,
      today.month,
      description
    );

    await db.clearUserState(user.id);
    await ctx.answerCallbackQuery({ text: "✅ با موفقیت ثبت شد!" });

    const accounts = await db.getAccountsWithBalance(user.id);
    const updatedAcc = accounts.find((a) => a.id === account!.id) || account;

    const resultMessage = `
✅ **تراکنش با موفقیت در حسابداری ثبت شد!**

• **نوع:** ${isDeposit ? "🟢 واریز (درآمد)" : "🔴 برداشت (هزینه)"}
• **مبلغ:** **${formatMoneyTomans(stateData.amount_rials)}**
• **دسته‌بندی:** ${getCategoryLabel(category)}
• **حساب:** ${account.name}
• **بابت:** ${description}
• **موجودی جدید حساب:** **${formatMoneyTomans(updatedAcc.current_balance || 0)}**
    `.trim();

    await ctx.editMessageText(resultMessage, { parse_mode: "Markdown" });
    return;
  }

  /* -------------------------------------------------------------------------
     ۲. فرآیند تایید و ویرایش پیش‌نویس رسید و ویس (Draft Callbacks)
     ------------------------------------------------------------------------- */

  // ۲.۱ تایید نهایی رسید یا ویس
  if (data.startsWith("tx_confirm:")) {
    const token = data.split(":")[1];
    const draft: ParsedTransaction = await db.getDraft(token);

    if (!draft || !draft.amount_rials || !draft.tx_type) {
      await ctx.answerCallbackQuery({ text: "اطلاعات منقضی شده یا ناقص است.", show_alert: true });
      return;
    }

    const today = getTodayJalali();
    const jy = draft.jalali_year || today.year;
    const jm = draft.jalali_month || today.month;
    const jd = draft.jalali_day || today.day;
    const gregDate = toGregorian(jy, jm, jd);

    const account = await db.ensureDefaultAccount(user.id);

    await db.addTransaction(
      user.id,
      account.id,
      draft.tx_type,
      draft.amount_rials,
      draft.description || "تراکنش",
      draft.category || (draft.tx_type === "deposit" ? "other_income" : "other_expense"),
      draft.notes?.[0]?.includes("عکس") ? "receipt" : draft.notes?.[0]?.includes("ویس") ? "voice" : "manual",
      gregDate,
      jy,
      jm,
      draft.raw_text
    );

    await db.deleteDraft(token);
    await ctx.answerCallbackQuery({ text: "✅ با موفقیت در دفترکل ثبت شد!" });

    const accounts = await db.getAccountsWithBalance(user.id);
    const updatedAcc = accounts.find((a) => a.id === account.id) || account;

    const resultMessage = `
✅ **تراکنش با موفقیت ثبت شد!**

• **نوع:** ${draft.tx_type === "deposit" ? "🟢 واریز (درآمد)" : "🔴 برداشت (هزینه)"}
• **مبلغ:** **${formatMoneyTomans(draft.amount_rials)}**
• **دسته‌بندی:** ${getCategoryLabel(draft.category)}
• **حساب:** ${account.name}
• **موجودی جدید حساب:** **${formatMoneyTomans(updatedAcc.current_balance || 0)}**
    `.trim();

    await ctx.editMessageText(resultMessage, { parse_mode: "Markdown" });
    return;
  }

  // ۲.۲ تغییر نوع (واریز / برداشت) در پیش‌نمایش
  if (data.startsWith("tx_toggle_type:")) {
    const token = data.split(":")[1];
    const draft: ParsedTransaction = await db.getDraft(token);
    if (!draft) {
      await ctx.answerCallbackQuery({ text: "نشست منقضی شده است." });
      return;
    }

    draft.tx_type = draft.tx_type === "deposit" ? "withdraw" : "deposit";
    draft.category = guessCategoryFromText(draft.description || "", draft.tx_type);
    await db.saveDraft(token, user.id, draft);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(formatTransactionPreview(draft), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
    return;
  }

  // ۲.۳ باز کردن منوی دسته‌بندی در پیش‌نمایش
  if (data.startsWith("tx_pick_cat:")) {
    const token = data.split(":")[1];
    const draft: ParsedTransaction = await db.getDraft(token);
    if (!draft) return;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("🏷 لطفاً دسته‌بندی مناسب را انتخاب کنید:", {
      reply_markup: categoriesKeyboard(draft.tx_type || "withdraw", token),
    });
    return;
  }

  // ۲.۴ انتخاب دسته در پیش‌نمایش
  if (data.startsWith("cat_select:")) {
    const [, token, catKey] = data.split(":");
    const draft: ParsedTransaction = await db.getDraft(token);
    if (!draft) return;

    draft.category = catKey;
    await db.saveDraft(token, user.id, draft);

    await ctx.answerCallbackQuery({ text: `دسته تغییر کرد به: ${getCategoryLabel(catKey)}` });
    await ctx.editMessageText(formatTransactionPreview(draft), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
    return;
  }

  // ۲.۵ بازگشت به پیش‌نمایش
  if (data.startsWith("tx_back:")) {
    const token = data.split(":")[1];
    const draft: ParsedTransaction = await db.getDraft(token);
    if (!draft) return;

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(formatTransactionPreview(draft), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
    return;
  }

  // ۲.۶ لغو پیش‌نویس
  if (data.startsWith("tx_cancel:")) {
    const token = data.split(":")[1];
    await db.deleteDraft(token);
    await ctx.answerCallbackQuery({ text: "عملیات لغو شد." });
    await ctx.editMessageText("❌ ثبت تراکنش لغو شد.");
    return;
  }
}

/**
 * پردازش متن پیام‌های ورودی کاربر
 * ۱. بررسی وضعیت‌های مرحله‌ای (ویزارد ثبت تراکنش یا ویزارد حساب)
 * ۲. تحلیل هوشمند پیامک بانکی یا جملات کاربر با Gemini
 */
export async function handleIncomingText(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  const text = (ctx.message?.text || "").trim();
  if (!user || !text) return;

  const db = new Database(ctx.env.DB);
  const session = await db.getUserState(user.id);

  // ۱. بررسی مراحل ویزارد حساب بانکی
  if (session && session.state.startsWith("w_acc_")) {
    const handled = await handleAccountTextStep(ctx, session.state, session.data);
    if (handled) return;
  }

  // ۲. بررسی مراحل ویزارد ثبت تراکنش
  if (session && session.state.startsWith("w_tx_")) {
    // ۲.۱ در مرحله وارد کردن مبلغ دلخواه
    if (session.state === "w_tx_amount") {
      const parsedAmount = parseAmountInput(text);
      if (!parsedAmount) {
        await ctx.reply("❌ مبلغ نامعتبر است. لطفاً مبلغ را به تومان ارسال کنید (مثلاً: `۷۵۰۰۰` یا `150 هزار`).");
        return;
      }

      const txType: "deposit" | "withdraw" = session.data.tx_type || "withdraw";
      const stateData = {
        tx_type: txType,
        amount_tomans: parsedAmount.tomans,
        amount_rials: parsedAmount.rials,
      };
      await db.setUserState(user.id, "w_tx_category", stateData);

      await ctx.reply(
        `🏷 **مرحله ۲ از ۳: انتخاب دسته‌بندی**\n\n` +
        `💰 مبلغ: **${formatMoneyTomans(parsedAmount.rials)}**\n\n` +
        "لطفاً دسته‌بندی این تراکنش را از دکمه‌های شیشه‌ای زیر انتخاب کنید:",
        {
          parse_mode: "Markdown",
          reply_markup: wizardCategoryKeyboard(txType),
        }
      );
      return;
    }

    // ۲.۲ در مرحله وارد کردن بابت / توضیح
    if (session.state === "w_tx_desc") {
      const stateData = session.data || {};
      stateData.description = text;

      const today = getTodayJalali();
      const gregDate = toGregorian(today.year, today.month, today.day);

      let account = null;
      if (stateData.account_id) {
        account = await db.getAccount(stateData.account_id);
      }
      if (!account) {
        account = await db.ensureDefaultAccount(user.id);
      }

      const isDeposit = stateData.tx_type === "deposit";
      const category = stateData.category || (isDeposit ? "other_income" : "other_expense");

      await db.addTransaction(
        user.id,
        account.id,
        stateData.tx_type,
        stateData.amount_rials,
        text,
        category,
        "manual",
        gregDate,
        today.year,
        today.month,
        text
      );

      await db.clearUserState(user.id);

      const accounts = await db.getAccountsWithBalance(user.id);
      const updatedAcc = accounts.find((a) => a.id === account!.id) || account;

      const resultMessage = `
✅ **تراکنش با موفقیت در حسابداری ثبت شد!**

• **نوع:** ${isDeposit ? "🟢 واریز (درآمد)" : "🔴 برداشت (هزینه)"}
• **مبلغ:** **${formatMoneyTomans(stateData.amount_rials)}**
• **دسته‌بندی:** ${getCategoryLabel(category)}
• **حساب:** ${account.name}
• **بابت:** ${text}
• **موجودی جدید حساب:** **${formatMoneyTomans(updatedAcc.current_balance || 0)}**
      `.trim();

      await ctx.reply(resultMessage, { parse_mode: "Markdown" });
      return;
    }
  }

  // ۳. در صورتی که در ویزارد نیستیم: پردازش هوشمند پیامک بانکی یا جملات کاربر با هوش مصنوعی
  const waitMsg = await ctx.reply("⏳ در حال تحلیل متن با هوش مصنوعی...");

  try {
    const parsed = await parseTransactionFromText(ctx.env, text);

    const token = crypto.randomUUID().slice(0, 10);
    await db.saveDraft(token, user.id, parsed);

    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});

    await ctx.reply(formatTransactionPreview(parsed), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
  } catch (err) {
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    await ctx.reply("❌ متوجه اطلاعات مالی این پیام نشدم. می‌توانید با دکمه‌های «➕ ثبت واریز» یا «➖ ثبت برداشت» مرحله به مرحله ثبت کنید.");
  }
}
