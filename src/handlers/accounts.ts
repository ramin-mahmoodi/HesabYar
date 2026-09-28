import { BotContext } from "../types";
import { Database } from "../db/database";
import { formatMoneyTomans } from "../services/jalali";

export async function handleAccounts(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const db = new Database(ctx.env.DB);
  await db.ensureDefaultAccount(user.id);
  const accounts = await db.getAccountsWithBalance(user.id);

  if (accounts.length === 0) {
    await ctx.reply("هیچ حسابی یافت نشد.");
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
      `   💰 موجودی فعلی: **${formatMoneyTomans(balance)}**\n`
    );
  }

  lines.push("──────────────");
  lines.push(`🏦 **مجموع دارایی:** **${formatMoneyTomans(totalWealth)}**\n`);
  lines.push("برای افزودن حساب یا کارت جدید از فرمت زیر استفاده کنید:\n" +
    "`/newaccount نام‌حساب موجودی‌اولیه-به-تومان شماره‌کارت`\n" +
    "مثال: `/newaccount کارت‌ملت 500000 6104337711223344`");

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
}

export async function handleNewAccount(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const text = ctx.message?.text || "";
  const parts = text.trim().split(/\s+/);
  // parts[0] is /newaccount, parts[1] is name, parts[2] is initial balance in tomans, parts[3] is card number
  if (parts.length < 2) {
    await ctx.reply(
      "❌ لطفاً دستور را با مشخصات حساب بفرستید:\n" +
      "فرمت: `/newaccount نام‌حساب موجودی‌اولیه-به-تومان شماره‌کارت`\n" +
      "مثال: `/newaccount بلو‌بانک 250000`",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const name = parts[1];
  const initialTomans = parts[2] ? parseInt(parts[2].replace(/,/g, ""), 10) : 0;
  const initialRials = isNaN(initialTomans) ? 0 : initialTomans * 10;
  const cardNumber = parts[3] ? parts[3].replace(/[-\s]/g, "") : undefined;

  const db = new Database(ctx.env.DB);
  await db.createAccount(user.id, name, undefined, cardNumber, initialRials);

  await ctx.reply(
    `✅ حساب جدید با نام **${name}** و موجودی اولیه **${formatMoneyTomans(initialRials)}** با موفقیت ساخته شد.`,
    { parse_mode: "Markdown" }
  );
}
