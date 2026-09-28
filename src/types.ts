import { Context } from "grammy";
import { Env } from "./config";

export interface BotContext extends Context {
  env: Env;
}

export interface Bank {
  id: number;
  code: string;
  name_fa: string;
  card_prefixes?: string;
}

export interface BankAccount {
  id: number;
  user_id: number;
  bank_id?: number;
  name: string;
  account_type: "bank" | "cash" | "wallet";
  card_number?: string;
  account_number?: string;
  iban?: string;
  initial_balance: number; // Rials
  current_balance?: number; // Rials (محاسبه‌شده)
  is_archived: number;
}

export interface LedgerEntry {
  id: number;
  user_id: number;
  account_id: number;
  tx_type: "deposit" | "withdraw";
  amount: number; // Rials
  description?: string;
  category?: string;
  source: "manual" | "receipt" | "voice";
  receipt_text?: string;
  transaction_date: string; // YYYY-MM-DD
  jalali_year: number;
  jalali_month: number;
  created_at: string;
}

export interface ParsedTransaction {
  amount_rials?: number;
  tx_type?: "deposit" | "withdraw";
  description?: string;
  category?: string;
  account_name?: string;
  jalali_year?: number;
  jalali_month?: number;
  jalali_day?: number;
  raw_text?: string;
  confidence?: number;
  notes?: string[];
}

export interface CategorySummary {
  category: string;
  category_name: string;
  total_amount: number; // Rials
  count: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  month_name: string;
  total_income: number;
  total_expense: number;
  net_savings: number;
  expense_by_category: CategorySummary[];
  income_by_category: CategorySummary[];
  entries: LedgerEntry[];
}
