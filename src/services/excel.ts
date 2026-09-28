import * as XLSX from "xlsx";
import { MonthlyReport } from "../types";
import { getCategoryLabel } from "./categories";
import { formatMoneyTomans, formatJalaliFull } from "./jalali";

export function generateExcelReport(report: MonthlyReport): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. برگه خلاصه عملکرد مالی
  const summaryRows: any[][] = [
    ["گزارش عملکرد مالی ماهانه - ربات حساب‌یار"],
    [`دوره گزارش: ${report.month_name} ${report.year}`],
    [],
    ["شاخص مالی", "مبلغ (تومان)", "مبلغ (ریال)"],
    ["مجموع درآمدها (واریزی)", Math.round(report.total_income / 10), report.total_income],
    ["مجموع هزینه‌ها (مخارج)", Math.round(report.total_expense / 10), report.total_expense],
    [
      "تراز مالی / پس‌انداز خالص",
      Math.round(report.net_savings / 10),
      report.net_savings,
    ],
    [],
    ["سهم هزینه‌ها به تفکیک دسته‌بندی"],
    ["ردیف", "عنوان دسته", "مجموع هزینه (تومان)", "درصد از کل هزینه‌ها", "تعداد تراکنش"],
  ];

  let rowIndex = 1;
  for (const cat of report.expense_by_category) {
    const tomans = Math.round(cat.total_amount / 10);
    const percent =
      report.total_expense > 0
        ? ((cat.total_amount / report.total_expense) * 100).toFixed(1) + "%"
        : "0%";
    summaryRows.push([
      rowIndex++,
      getCategoryLabel(cat.category),
      tomans,
      percent,
      cat.count,
    ]);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  // تنظیم عرض ستون‌ها
  wsSummary["!cols"] = [
    { wch: 6 },
    { wch: 25 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "خلاصه عملکرد");

  // 2. برگه ریز تراکنش‌ها
  const txRows: any[][] = [
    [
      "ردیف",
      "تاریخ شمسی",
      "نوع تراکنش",
      "دسته‌بندی",
      "مبلغ (تومان)",
      "مبلغ (ریال)",
      "بابت / توضیحات",
      "روش ثبت",
    ],
  ];

  let txIndex = 1;
  for (const tx of report.entries) {
    const typeLabel = tx.tx_type === "deposit" ? "واریز" : "برداشت";
    const sourceLabel =
      tx.source === "voice"
        ? "دستیار صوتی"
        : tx.source === "receipt"
        ? "رسید (هوش مصنوعی)"
        : "دستی";

    txRows.push([
      txIndex++,
      tx.transaction_date,
      typeLabel,
      getCategoryLabel(tx.category),
      Math.round(tx.amount / 10),
      tx.amount,
      tx.description || "—",
      sourceLabel,
    ]);
  }

  const wsTransactions = XLSX.utils.aoa_to_sheet(txRows);
  wsTransactions["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 12 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 35 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTransactions, "ریز تراکنش‌ها");

  // خروجی باینری
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}
