import { InputFile } from "grammy";
import { BotContext } from "../types";
import { Database } from "../db/database";
import { formatMoneyTomans, getTodayJalali } from "../services/jalali";
import { reportActionKeyboard } from "./keyboards";
import { generateExcelReport } from "../services/excel";
import { generateCategoryPieChart, generateIncomeVsExpenseChart } from "../services/charts";

export async function handleReport(ctx: BotContext): Promise<void> {
  const user = ctx.from;
  if (!user) return;

  const today = getTodayJalali();
  const db = new Database(ctx.env.DB);
  const report = await db.getMonthlyReport(user.id, today.year, today.month);

  const lines = [
    `📊 **گزارش عملکرد مالی: ${report.month_name} ${report.year}**`,
    "──────────────",
    `🟢 **کل واریزی‌ها (درآمد):** **${formatMoneyTomans(report.total_income)}**`,
    `🔴 **کل برداشت‌ها (مخارج):** **${formatMoneyTomans(report.total_expense)}**`,
    `💎 **تراز / پس‌انداز ماه:** **${formatMoneyTomans(report.net_savings)}**`,
    "",
  ];

  if (report.expense_by_category.length > 0) {
    lines.push("📌 **بیشترین مخارج به تفکیک دسته:**");
    for (const cat of report.expense_by_category.slice(0, 5)) {
      const tomans = formatMoneyTomans(cat.total_amount);
      const percent =
        report.total_expense > 0
          ? ((cat.total_amount / report.total_expense) * 100).toFixed(0) + "%"
          : "0%";
      lines.push(`• ${cat.category_name}: **${tomans}** (${percent})`);
    }
  } else {
    lines.push("ℹ️ _در این ماه هنوز هزینه‌ای ثبت نشده است._");
  }

  lines.push("");
  lines.push("برای دریافت گزارش گرافیکی و فایل حسابداری از دکمه‌های زیر استفاده کنید:");

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: reportActionKeyboard(report.year, report.month),
  });
}

export async function handleReportCallbacks(ctx: BotContext): Promise<void> {
  const query = ctx.callbackQuery;
  const data = query?.data;
  const user = ctx.from;
  if (!query || !data || !user) return;

  const db = new Database(ctx.env.DB);

  // دانلود فایل اکسل
  if (data.startsWith("rep_excel:")) {
    const [, yStr, mStr] = data.split(":");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    await ctx.answerCallbackQuery({ text: "⏳ در حال ساخت فایل اکسل..." });

    try {
      const report = await db.getMonthlyReport(user.id, year, month);
      const excelBytes = generateExcelReport(report);
      const fileName = `HesabYar_${year}_${month}.xlsx`;

      await ctx.replyWithDocument(new InputFile(excelBytes, fileName), {
        caption: `📊 فایل اکسل حسابداری ماه **${report.month_name} ${year}**\nشامل خلاصه عملکرد و ریز تمام تراکنش‌ها.`,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Excel generation error:", error);
      await ctx.reply("❌ خطا در تولید فایل اکسل.");
    }
    return;
  }

  // دریافت نمودار دایره‌ای هزینه‌ها
  if (data.startsWith("rep_chart_pie:")) {
    const [, yStr, mStr] = data.split(":");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    await ctx.answerCallbackQuery({ text: "⏳ در حال تولید نمودار..." });

    try {
      const report = await db.getMonthlyReport(user.id, year, month);
      if (report.total_expense === 0) {
        await ctx.reply("ℹ️ برای این ماه هزینه‌ای ثبت نشده تا نمودار رسم شود.");
        return;
      }

      const chartBytes = await generateCategoryPieChart(report);
      await ctx.replyWithPhoto(new InputFile(chartBytes, "pie_chart.png"), {
        caption: `🍩 **نمودار سهم مخارج در ${report.month_name} ${year}**`,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Chart generation error:", error);
      await ctx.reply("❌ خطا در رسم نمودار.");
    }
    return;
  }

  // دریافت نمودار میله‌ای مقایسه‌ای
  if (data.startsWith("rep_chart_bar:")) {
    const [, yStr, mStr] = data.split(":");
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    await ctx.answerCallbackQuery({ text: "⏳ در حال تولید نمودار..." });

    try {
      const report = await db.getMonthlyReport(user.id, year, month);
      const chartBytes = await generateIncomeVsExpenseChart(report);

      await ctx.replyWithPhoto(new InputFile(chartBytes, "income_expense_chart.png"), {
        caption: `📊 **مقایسه درآمد و مخارج ${report.month_name} ${year}**`,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error("Comparison chart error:", error);
      await ctx.reply("❌ خطا در رسم نمودار مقایسه.");
    }
    return;
  }
}
