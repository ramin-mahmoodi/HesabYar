import { Bank, BankAccount, CategorySummary, LedgerEntry, MonthlyReport } from "../types";
import { getMonthName, getTodayJalali } from "../services/jalali";
import { getCategoryLabel } from "../services/categories";

export class Database {
  constructor(private db: D1Database) {}

  /**
   * ساخت اولیه جدول‌ها در صورت عدم وجود (Migration خودکار)
   */
  async init(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS banks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          name_fa TEXT NOT NULL,
          card_prefixes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `),
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS bank_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          bank_id INTEGER,
          name TEXT NOT NULL,
          account_type TEXT DEFAULT 'bank',
          card_number TEXT,
          account_number TEXT,
          iban TEXT,
          initial_balance INTEGER DEFAULT 0,
          is_archived INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(bank_id) REFERENCES banks(id)
        );
      `),
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          account_id INTEGER NOT NULL,
          tx_type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          description TEXT,
          category TEXT,
          source TEXT DEFAULT 'manual',
          receipt_text TEXT,
          transaction_date TEXT NOT NULL,
          jalali_year INTEGER NOT NULL,
          jalali_month INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(account_id) REFERENCES bank_accounts(id)
        );
      `),
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS pending_transactions (
          token TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `),
      this.db.prepare(`
        INSERT OR IGNORE INTO banks (id, code, name_fa, card_prefixes) VALUES
        (1, 'blu', 'بلوبانک (سامان)', '621986'),
        (2, 'mellat', 'ملت', '610433,991975'),
        (3, 'melli', 'ملی', '603799,170019'),
        (4, 'saman', 'سامان', '621986'),
        (5, 'tejarat', 'تجارت', '585983,627353'),
        (6, 'pasargad', 'پاسارگاد', '502229,639347'),
        (7, 'sepah', 'سپه', '589210'),
        (8, 'keshavarzi', 'کشاورزی', '603770,639217'),
        (9, 'saderat', 'صادرات', '603769'),
        (10, 'parsian', 'پارسیان', '622106,639194'),
        (11, 'refah', 'رفاه', '589463'),
        (12, 'shahr', 'شهر', '502806,504706'),
        (13, 'ayandeh', 'آینده', '636214'),
        (14, 'other', 'سایر / نقدی', '');
      `),
    ]);
  }

  /**
   * تضمین وجود حساب پیش‌فرض برای کاربر
   */
  async ensureDefaultAccount(userId: number, defaultName = "حساب اصلی"): Promise<BankAccount> {
    const existing = await this.db
      .prepare("SELECT * FROM bank_accounts WHERE user_id = ? AND is_archived = 0 ORDER BY id ASC LIMIT 1")
      .bind(userId)
      .first<BankAccount>();

    if (existing) {
      return existing;
    }

    const result = await this.db
      .prepare(`
        INSERT INTO bank_accounts (user_id, name, account_type, initial_balance)
        VALUES (?, ?, 'bank', 0)
      `)
      .bind(userId, defaultName)
      .run();

    const created = await this.db
      .prepare("SELECT * FROM bank_accounts WHERE id = ?")
      .bind(result.meta.last_row_id)
      .first<BankAccount>();

    if (!created) {
      throw new Error("خطا در ایجاد حساب پیش‌فرض");
    }
    return created;
  }

  /**
   * دریافت همه حساب‌های کاربر به همراه محاسبه موجودی لحظه‌ای
   */
  async getAccountsWithBalance(userId: number): Promise<BankAccount[]> {
    const accounts = await this.db
      .prepare("SELECT * FROM bank_accounts WHERE user_id = ? AND is_archived = 0 ORDER BY id ASC")
      .bind(userId)
      .all<BankAccount>();

    const results: BankAccount[] = [];
    for (const acc of accounts.results) {
      const stats = await this.db
        .prepare(`
          SELECT 
            COALESCE(SUM(CASE WHEN tx_type = 'deposit' THEN amount ELSE -amount END), 0) as net_flow
          FROM ledger_entries
          WHERE account_id = ?
        `)
        .bind(acc.id)
        .first<{ net_flow: number }>();

      const netFlow = stats?.net_flow || 0;
      results.push({
        ...acc,
        current_balance: acc.initial_balance + netFlow,
      });
    }

    return results;
  }

  /**
   * افزودن حساب یا کارت جدید
   */
  async createAccount(
    userId: number,
    name: string,
    bankId?: number,
    cardNumber?: string,
    initialBalance = 0,
    accountType: "bank" | "cash" | "wallet" = "bank"
  ): Promise<number> {
    const res = await this.db
      .prepare(`
        INSERT INTO bank_accounts (user_id, bank_id, name, account_type, card_number, initial_balance)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, bankId || null, name, accountType, cardNumber || null, initialBalance)
      .run();

    return res.meta.last_row_id as number;
  }

  /**
   * ثبت یک تراکنش جدید در دفترکل
   */
  async addTransaction(
    userId: number,
    accountId: number,
    txType: "deposit" | "withdraw",
    amount: number,
    description: string,
    category: string,
    source: "manual" | "receipt" | "voice",
    transactionDate: string,
    jalaliYear: number,
    jalaliMonth: number,
    receiptText?: string
  ): Promise<number> {
    const res = await this.db
      .prepare(`
        INSERT INTO ledger_entries (
          user_id, account_id, tx_type, amount, description, category,
          source, receipt_text, transaction_date, jalali_year, jalali_month
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        userId,
        accountId,
        txType,
        amount,
        description,
        category,
        source,
        receiptText || null,
        transactionDate,
        jalaliYear,
        jalaliMonth
      )
      .run();

    return res.meta.last_row_id as number;
  }

  /**
   * گزارش کامل عملکرد مالی یک ماه شمسی
   */
  async getMonthlyReport(userId: number, year: number, month: number): Promise<MonthlyReport> {
    // 1. کل واریزی و برداشتی ماه
    const summary = await this.db
      .prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN tx_type = 'deposit' THEN amount ELSE 0 END), 0) as total_income,
          COALESCE(SUM(CASE WHEN tx_type = 'withdraw' THEN amount ELSE 0 END), 0) as total_expense
        FROM ledger_entries
        WHERE user_id = ? AND jalali_year = ? AND jalali_month = ?
      `)
      .bind(userId, year, month)
      .first<{ total_income: number; total_expense: number }>();

    const totalIncome = summary?.total_income || 0;
    const totalExpense = summary?.total_expense || 0;

    // 2. مخارج به تفکیک دسته
    const expenseCats = await this.db
      .prepare(`
        SELECT 
          category,
          SUM(amount) as total_amount,
          COUNT(*) as count
        FROM ledger_entries
        WHERE user_id = ? AND jalali_year = ? AND jalali_month = ? AND tx_type = 'withdraw'
        GROUP BY category
        ORDER BY total_amount DESC
      `)
      .bind(userId, year, month)
      .all<{ category: string; total_amount: number; count: number }>();

    // 3. درآمد به تفکیک دسته
    const incomeCats = await this.db
      .prepare(`
        SELECT 
          category,
          SUM(amount) as total_amount,
          COUNT(*) as count
        FROM ledger_entries
        WHERE user_id = ? AND jalali_year = ? AND jalali_month = ? AND tx_type = 'deposit'
        GROUP BY category
        ORDER BY total_amount DESC
      `)
      .bind(userId, year, month)
      .all<{ category: string; total_amount: number; count: number }>();

    // 4. لیست تمام تراکنش‌ها
    const entries = await this.db
      .prepare(`
        SELECT * FROM ledger_entries
        WHERE user_id = ? AND jalali_year = ? AND jalali_month = ?
        ORDER BY id DESC
      `)
      .bind(userId, year, month)
      .all<LedgerEntry>();

    return {
      year,
      month,
      month_name: getMonthName(month),
      total_income: totalIncome,
      total_expense: totalExpense,
      net_savings: totalIncome - totalExpense,
      expense_by_category: expenseCats.results.map((r) => ({
        category: r.category,
        category_name: getCategoryLabel(r.category),
        total_amount: r.total_amount,
        count: r.count,
      })),
      income_by_category: incomeCats.results.map((r) => ({
        category: r.category,
        category_name: getCategoryLabel(r.category),
        total_amount: r.total_amount,
        count: r.count,
      })),
      entries: entries.results,
    };
  }

  /**
   * آخرین تراکنش‌های ثبت‌شده
   */
  async getRecentTransactions(userId: number, limit = 5): Promise<LedgerEntry[]> {
    const res = await this.db
      .prepare(`
        SELECT * FROM ledger_entries
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .bind(userId, limit)
      .all<LedgerEntry>();

    return res.results;
  }

  /**
   * ذخیره پیش‌نویس تراکنش معلق
   */
  async saveDraft(token: string, userId: number, data: any): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO pending_transactions (token, user_id, data)
        VALUES (?, ?, ?)
      `)
      .bind(token, userId, JSON.stringify(data))
      .run();
  }

  /**
   * دریافت پیش‌نویس تراکنش معلق
   */
  async getDraft(token: string): Promise<any | null> {
    const row = await this.db
      .prepare("SELECT data FROM pending_transactions WHERE token = ?")
      .bind(token)
      .first<{ data: string }>();

    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  }

  /**
   * حذف پیش‌نویس پس از ثبت نهایی یا لغو
   */
  async deleteDraft(token: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM pending_transactions WHERE token = ?")
      .bind(token)
      .run();
  }
}

