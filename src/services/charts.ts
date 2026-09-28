import { MonthlyReport } from "../types";
import { getCategoryLabel } from "./categories";

const CHART_COLORS = [
  "#FF6384",
  "#36A2EB",
  "#FFCE56",
  "#4BC0C0",
  "#9966FF",
  "#FF9F40",
  "#C9CBCF",
  "#2ecc71",
  "#e74c3c",
  "#3498db",
  "#9b59b6",
  "#f1c40f",
  "#1abc9c",
  "#e67e22",
  "#34495e",
];

export async function generateCategoryPieChart(report: MonthlyReport): Promise<Uint8Array> {
  const topExpenses = report.expense_by_category.slice(0, 10);
  const labels = topExpenses.map((c) => getCategoryLabel(c.category));
  const data = topExpenses.map((c) => Math.round(c.total_amount / 10)); // تومان

  if (labels.length === 0) {
    labels.push("بدون هزینه");
    data.push(1);
  }

  const chartConfig = {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: CHART_COLORS.slice(0, labels.length),
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `سهم هزینه‌های ${report.month_name} ${report.year} (تومان)`,
          font: { size: 20 },
        },
        legend: {
          position: "bottom",
          labels: { font: { size: 14 } },
        },
      },
    },
  };

  const response = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: chartConfig,
      width: 700,
      height: 600,
      format: "png",
      devicePixelRatio: 2,
    }),
  });

  if (!response.ok) {
    throw new Error(`خطا در تولید چارت: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function generateIncomeVsExpenseChart(report: MonthlyReport): Promise<Uint8Array> {
  const incomeTomans = Math.round(report.total_income / 10);
  const expenseTomans = Math.round(report.total_expense / 10);

  const chartConfig = {
    type: "bar",
    data: {
      labels: ["درآمدها (واریزی)", "هزینه‌ها (مخارج)"],
      datasets: [
        {
          label: "مبلغ به تومان",
          data: [incomeTomans, expenseTomans],
          backgroundColor: ["#2ecc71", "#e74c3c"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `مقایسه درآمد و مخارج ${report.month_name} ${report.year}`,
          font: { size: 20 },
        },
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 14 } },
        },
      },
    },
  };

  const response = await fetch("https://quickchart.io/chart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: chartConfig,
      width: 650,
      height: 450,
      format: "png",
      devicePixelRatio: 2,
    }),
  });

  if (!response.ok) {
    throw new Error(`خطا در تولید چارت مقایسه: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
