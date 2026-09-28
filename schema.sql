-- کاتالوگ بانک‌های ایران
CREATE TABLE IF NOT EXISTS banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name_fa TEXT NOT NULL,
    card_prefixes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- حساب‌ها و کارت‌های بانکی کاربران
CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bank_id INTEGER,
    name TEXT NOT NULL,
    account_type TEXT DEFAULT 'bank', -- bank | cash | wallet
    card_number TEXT,
    account_number TEXT,
    iban TEXT,
    initial_balance INTEGER DEFAULT 0, -- Rials
    is_archived INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_id) REFERENCES banks(id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON bank_accounts(user_id);

-- اسناد دفترکل (تراکنش‌ها)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    tx_type TEXT NOT NULL, -- deposit | withdraw
    amount INTEGER NOT NULL, -- Rials
    description TEXT,
    category TEXT,
    source TEXT DEFAULT 'manual', -- manual | receipt | voice
    receipt_text TEXT,
    transaction_date TEXT NOT NULL, -- YYYY-MM-DD
    jalali_year INTEGER NOT NULL,
    jalali_month INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES bank_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_month ON ledger_entries(user_id, jalali_year, jalali_month);
CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id);

-- پیش‌نویس تراکنش‌های معلق تایید (عکس و صوت)
CREATE TABLE IF NOT EXISTS pending_transactions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- وضعیت تعاملی مرحله به مرحله کاربر (Session Wizard)
CREATE TABLE IF NOT EXISTS user_states (
    user_id INTEGER PRIMARY KEY,
    state TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- درج کاتالوگ پیش‌فرض بانک‌ها
INSERT OR IGNORE INTO banks (code, name_fa, card_prefixes) VALUES
('blu', 'بلوبانک (سامان)', '621986'),
('mellat', 'ملت', '610433,991975'),
('melli', 'ملی', '603799,170019'),
('saman', 'سامان', '621986'),
('tejarat', 'تجارت', '585983,627353'),
('pasargad', 'پاسارگاد', '502229,639347'),
('sepah', 'سپه', '589210'),
('keshavarzi', 'کشاورزی', '603770,639217'),
('saderat', 'صادرات', '603769'),
('parsian', 'پارسیان', '622106,639194'),
('refah', 'رفاه', '589463'),
('shahr', 'شهر', '502806,504706'),
('ayandeh', 'آینده', '636214'),
('sina', 'سینا', '639346'),
('sarmayeh', 'سرمایه', '639607'),
('maskan', 'مسکن', '628023'),
('other', 'سایر / متفرقه', '');
