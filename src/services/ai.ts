import { Env } from "../config";
import { ParsedTransaction } from "../types";
import { getTodayJalali } from "./jalali";
import { guessCategoryFromText } from "./categories";

const RECEIPT_VISION_PROMPT = `تو یک سیستم استخراج هوشمند اطلاعات از رسیدهای بانکی و فاکتورهای ایرانی هستی (دقیقاً مثل سیستم حسابداری).
از روی این تصویر فقط و فقط یک شیء JSON خالص و معتبر با این فرمت برگردان (بدون markdown و بدون هیچ توضیح اضافه):
{
  "amount_rials": <عدد صحیح مبلغ به ریال یا null>,
  "type": "<deposit یا withdraw>",
  "jalali_year": <سال شمسی مثلا 1403 یا null>,
  "jalali_month": <ماه شمسی عدد 1 تا 12 یا null>,
  "jalali_day": <روز شمسی عدد 1 تا 31 یا null>,
  "description": "<خلاصه کوتاه فارسی نام پذیرنده یا بابت حداکثر 60 کاراکتر>",
  "category": "<یکی از: food, fuel, transport, home, rent_home, water, electricity, gas, internet, health, clothing, education, entertainment, installment, salary, freelance, sales, gift, other_expense, other_income یا null>",
  "confidence": <عدد بین 0 تا 1>
}

قواعد حیاتی:
- deposit = واریز / شارژ / دریافت / بستانکار
- withdraw = برداشت / پرداخت / خرید / انتقال از حساب / بدهکار
- اگر مبلغ در رسید به «تومان» بود، حتماً آن را معادل ریال کن (ضربدر ۱۰).
- اگر مبلغ به ریال بود همان را بگذار.
- تاریخ را ترجیحاً شمسی استخراج کن.`;

const VOICE_EXTRACTION_PROMPT = `این یک فایل صوتی به زبان فارسی از یک کاربر است که یک تراکنش مالی، هزینه یا درآمد را به صورت محاوره‌ای بیان می‌کند.
به صوت با دقت گوش بده و یک شیء JSON با این ساختار دقیق بازگردان:
{
  "transcribed_text": "<متن دقیق پیاده‌شده از صوت به فارسی>",
  "amount_rials": <عدد صحیح مبلغ به ریال یا null>,
  "type": "<deposit یا withdraw>",
  "category": "<یکی از: food, fuel, transport, home, rent_home, water, electricity, gas, internet, health, clothing, education, entertainment, installment, salary, freelance, sales, gift, other_expense, other_income>",
  "description": "<خلاصه کوتاه خرج یا واریزی حداکثر 40 کاراکتر>"
}

نکات:
- اگر کاربر گفت مثلاً "پنجاه تومن بنزین زدم" یعنی type: withdraw, category: fuel, amount_rials: 500000.
- مبالغ تومان را به ریال تبدیل کن (*10).
- فقط شیء JSON برگردان.`;

const TEXT_EXTRACTION_PROMPT = `تو یک دستیار هوشمند حسابداری ایرانی هستی.
متن پیامک بانکی یا جمله کاربر را تحلیل کن و یک شیء JSON با مشخصات مالی زیر برگردان:
{
  "amount_rials": <عدد صحیح مبلغ به ریال یا null>,
  "type": "<deposit یا withdraw>",
  "category": "<یکی از: food, fuel, transport, home, rent_home, water, electricity, gas, internet, health, clothing, education, entertainment, installment, salary, freelance, sales, gift, other_expense, other_income>",
  "description": "<خلاصه کوتاه حداکثر 50 کاراکتر>"
}`;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extractJson(rawText: string): any {
  let cleaned = rawText.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    cleaned = fence[1].trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

let cachedModel: string | null = null;

async function getAvailableModel(apiKey: string): Promise<string> {
  if (cachedModel) return cachedModel;

  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (listRes.ok) {
      const data: any = await listRes.json();
      const models: any[] = data.models || [];
      const validModels = models.filter((m) =>
        m.supportedGenerationMethods?.includes("generateContent")
      );

      const flash = validModels.find(
        (m) => m.name?.includes("flash") && !m.name?.includes("deprecated")
      );
      if (flash && flash.name) {
        const name = String(flash.name).replace(/^models\//, "");
        cachedModel = name;
        return name;
      }

      if (validModels.length > 0 && validModels[0].name) {
        const name = String(validModels[0].name).replace(/^models\//, "");
        cachedModel = name;
        return name;
      }
    } else {
      const err = await listRes.text();
      if (listRes.status === 400 || listRes.status === 403) {
        throw new Error(`کلید GEMINI_API_KEY نامعتبر است: ${err.slice(0, 100)}`);
      }
    }
  } catch (e: any) {
    if (e.message?.includes("کلید")) throw e;
  }

  return "gemini-1.5-flash-latest";
}

async function callGemini(apiKey: string, parts: any[]): Promise<any> {
  const model = await getAvailableModel(apiKey);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404 && cachedModel !== "gemini-1.5-flash-latest") {
      cachedModel = "gemini-1.5-flash-latest";
      return callGemini(apiKey, parts);
    }
    throw new Error(`خطای سرور گوگل (${res.status} مدل ${model}): ${errText.slice(0, 120)}`);
  }

  const json: any = await res.json();
  const candidate = json.candidates?.[0];
  const responseText = candidate?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error("پاسخی از مدل Gemini دریافت نشد.");
  }
  return extractJson(responseText);
}

export async function parseReceiptWithVision(
  env: Env,
  imageBytes: Uint8Array,
  mimeType = "image/jpeg"
): Promise<ParsedTransaction> {
  const today = getTodayJalali();

  if (!env.GEMINI_API_KEY) {
    return {
      tx_type: "withdraw",
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      notes: ["⚠️ کلید GEMINI_API_KEY در تنظیمات کلادفلر ست نشده است."],
    };
  }

  try {
    const base64Data = uint8ArrayToBase64(imageBytes);
    const parts = [
      {
        inline_data: {
          mime_type: mimeType,
          data: base64Data,
        },
      },
      { text: RECEIPT_VISION_PROMPT },
    ];

    const data = await callGemini(env.GEMINI_API_KEY, parts);
    const txType: "deposit" | "withdraw" = data.type === "deposit" ? "deposit" : "withdraw";
    const category = data.category || guessCategoryFromText(data.description || "", txType);

    return {
      amount_rials: typeof data.amount_rials === "number" ? data.amount_rials : undefined,
      tx_type: txType,
      jalali_year: data.jalali_year || today.year,
      jalali_month: data.jalali_month || today.month,
      jalali_day: data.jalali_day || today.day,
      description: data.description || "رسید بانکی",
      category,
      confidence: data.confidence || 0.95,
      notes: ["استخراج هوشمند با Google Gemini Flash ⚡"],
    };
  } catch (error: any) {
    console.error("Gemini Vision error:", error);
    return {
      tx_type: "withdraw",
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      notes: ["خطا در خواندن تصویر: " + (error?.message || "نامشخص")],
    };
  }
}

export async function parseVoiceWithGemini(
  env: Env,
  audioBytes: Uint8Array,
  mimeType = "audio/ogg"
): Promise<{ parsed: ParsedTransaction; transcribedText: string }> {
  const today = getTodayJalali();

  if (!env.GEMINI_API_KEY) {
    throw new Error("کلید GEMINI_API_KEY در تنظیمات ست نشده است.");
  }

  const base64Data = uint8ArrayToBase64(audioBytes);
  const parts = [
    {
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      },
    },
    { text: VOICE_EXTRACTION_PROMPT },
  ];

  const data = await callGemini(env.GEMINI_API_KEY, parts);
  const txType: "deposit" | "withdraw" = data.type === "deposit" ? "deposit" : "withdraw";
  const transcribedText = data.transcribed_text || "صدای کاربر";

  const parsed: ParsedTransaction = {
    amount_rials: typeof data.amount_rials === "number" ? data.amount_rials : undefined,
    tx_type: txType,
    category: data.category || guessCategoryFromText(transcribedText, txType),
    description: data.description || transcribedText.slice(0, 40),
    jalali_year: today.year,
    jalali_month: today.month,
    jalali_day: today.day,
    notes: [`متن شنیده‌شده: «${transcribedText}»`],
  };

  return { parsed, transcribedText };
}

export async function parseTransactionFromText(
  env: Env,
  text: string
): Promise<ParsedTransaction> {
  const today = getTodayJalali();

  if (!env.GEMINI_API_KEY) {
    const txType = text.includes("واریز") ? "deposit" : "withdraw";
    return {
      tx_type: txType,
      category: guessCategoryFromText(text, txType),
      description: text.slice(0, 40),
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      raw_text: text,
      notes: ["ثبت بر اساس متن"],
    };
  }

  try {
    const parts = [
      { text: TEXT_EXTRACTION_PROMPT + `\n\nمتن ورودی:\n${text}` },
    ];
    const data = await callGemini(env.GEMINI_API_KEY, parts);
    const txType: "deposit" | "withdraw" = data.type === "deposit" ? "deposit" : "withdraw";

    return {
      amount_rials: typeof data.amount_rials === "number" ? data.amount_rials : undefined,
      tx_type: txType,
      category: data.category || guessCategoryFromText(text, txType),
      description: data.description || text.slice(0, 50),
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      raw_text: text,
      notes: ["تحلیل متن با هوش مصنوعی"],
    };
  } catch (error) {
    const txType = text.includes("واریز") ? "deposit" : "withdraw";
    return {
      tx_type: txType,
      category: guessCategoryFromText(text, txType),
      description: text.slice(0, 40),
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      raw_text: text,
    };
  }
}
