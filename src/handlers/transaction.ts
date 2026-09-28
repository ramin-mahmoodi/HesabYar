import { BotContext, ParsedTransaction } from "../types";
import { Database } from "../db/database";
import { formatTransactionPreview } from "./receipt";
import { categoriesKeyboard, transactionConfirmKeyboard } from "./keyboards";
import { formatMoneyTomans, getTodayJalali, toGregorian } from "../services/jalali";
import { getCategoryLabel, guessCategoryFromText } from "../services/categories";
import { parseTransactionFromText } from "../services/ai";

export async function handleManualDeposit(ctx: BotContext): Promise<void> {
  await handleManualCommand(ctx, "deposit");
}

export async function handleManualWithdraw(ctx: BotContext): Promise<void> {
  await handleManualCommand(ctx, "withdraw");
}

async function handleManualCommand(ctx: BotContext, txType: "deposit" | "withdraw"): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const text = (ctx.message?.text || "").trim();
  const parts = text.split(/\s+/);
  // parts[0] is /deposit or /withdraw, parts[1] is amount in tomans, parts[2..] is description
  if (parts.length < 2) {
    const cmd = txType === "deposit" ? "/deposit" : "/withdraw";
    const label = txType === "deposit" ? "واریز (درآمد)" : "برداشت (هزینه)";
    await ctx.reply(
      `✍️ جهت ثبت دستی ${label} از فرمت زیر استفاده کنید:\n` +
      `\`${cmd} مبلغ-به-تومان بابت/توضیح\`\n\n` +
      `مثال:\n\`${cmd} 150000 بنزین\``,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const rawAmount = parts[1].replace(/[,_]/g, "");
  const tomans = parseInt(rawAmount, 10);
  if (isNaN(tomans) || tomans <= 0) {
    await ctx.reply("❌ مبلغ واردشده نامعتبر است.");
    return;
  }

  const amountRials = tomans * 10;
  const description = parts.slice(2).join(" ") || (txType === "deposit" ? "واریزی دستی" : "هزینه دستی");
  const category = guessCategoryFromText(description, txType);
  const today = getTodayJalali();

  const parsed: ParsedTransaction = {
    amount_rials: amountRials,
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
 * پردازش متن پیامک‌های بانکی یا جملات کاربر
 */
export async function handleIncomingText(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  const text = (ctx.message?.text || "").trim();
  if (!user || !text) return;

  // فیلتر کردن دکمه‌های کیبورد اصلی
  if (text.startsWith("➕") || text.startsWith("➖") || text.startsWith("📷") || 
      text.startsWith("🎙") || text.startsWith("📊") || text.startsWith("💳")) {
    return;
  }

  const waitMsg = await ctx.reply("⏳ در حال تحلیل هوشمند متن با هوش مصنوعی...");

  try {
    const parsed = await parseTransactionFromText(ctx.env, text);

    const token = crypto.randomUUID().slice(0, 10);
    const db = new Database(ctx.env.DB);
    await db.saveDraft(token, user.id, parsed);

    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});

    await ctx.reply(formatTransactionPreview(parsed), {
      parse_mode: "Markdown",
      reply_markup: transactionConfirmKeyboard(token),
    });
  } catch (err) {
    await ctx.api.deleteMessage(ctx.chat!.id, waitMsg.message_id).catch(() => {});
    await ctx.reply("❌ متوجه اطلاعات مالی این پیام نشدم. لطفاً با فرمت /deposit یا /withdraw وارد کنید.");
  }
}

/**
 * مدیریت کلیک‌های اینلاین مربوط به تراکنش
 */
export async function handleTransactionCallbacks(ctx: BotContext): Promise<void> {
  const query = ctx.callbackQuery;
  const data = query?.data;
  const user = ctx.from;
  if (!query || !data || !user) return;

  const db = new Database(ctx.env.DB);

  // 1. تایید نهایی
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
      draft.notes?.[0]?.includes("عکس") ? "receipt" : draft.notes?.[0]?.includes("وویس") ? "voice" : "manual",
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

• **نوع:** ${draft.tx_type === "deposit" ? "واریز (درآمد)" : "برداشت (هزینه)"}
• **مبلغ:** **${formatMoneyTomans(draft.amount_rials)}**
• **دسته‌بندی:** ${getCategoryLabel(draft.category)}
• **حساب:** ${account.name}
• **موجودی جدید حساب:** **${formatMoneyTomans(updatedAcc.current_balance || 0)}**
    `.trim();

    await ctx.editMessageText(resultMessage, { parse_mode: "Markdown" });
    return;
  }

  // 2. تغییر نوع (واریز / برداشت)
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

  // 3. انتخاب دسته‌بندی
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

  // 4. ثبت دسته انتخابی
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

  // 5. بازگشت
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

  // 6. لغو
  if (data.startsWith("tx_cancel:")) {
    const token = data.split(":")[1];
    await db.deleteDraft(token);
    await ctx.answerCallbackQuery({ text: "عملیات لغو شد." });
    await ctx.editMessageText("❌ ثبت تراکنش لغو شد.");
    return;
  }
}
