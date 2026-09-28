import { Env } from "../config";
import { ParsedTransaction } from "../types";
import { getTodayJalali } from "./jalali";
import { guessCategoryFromText } from "./categories";

const RECEIPT_VISION_PROMPT = `تو یک سیستم استخراج هوشمند اطلاعات از رسیدهای بانکی و فاکتورهای ایرانی هستی.
از روی این تصویر فقط و فقط یک JSON خالص و معتبر با این فرمت برگردان:
{
  "amount_rials": <عدد صحیح مبلغ به ریال یا null>,
  "type": "<deposit یا withdraw>",
  "jalali_year": <سال شمسی مثلا 1403 یا null>,
  "jalali_month": <ماه شمسی عدد 1 تا 12 یا null>,
  "jalali_day": <روز شمسی عدد 1 تا 31 یا null>,
  "description": "<خلاصه نام پذیرنده یا انتقال دهنده به فارسی حداکثر 60 کاراکتر>",
  "confidence": <عدد بین 0 تا 1>
}

نکات بسیار مهم:
- اگر مبلغ در رسید به «تومان» نوشته شده است، حتماً آن را تبدیل به ریال کن (ضربدر ۱۰).
- اگر کلماتی مثل واریز، شارژ، دریافت، بستانکار بود، type را deposit بگذار.
- اگر برداشت، خرید، پرداخت، انتقال، بدهکار بود، type را withdraw بگذار.
- هیچ متنی به جز شیء JSON بازنگردان.`;

const TEXT_EXTRACTION_PROMPT = `تو یک دستیار هوشمند حسابداری شخصی برای کاربران ایرانی هستی.
یک متن فارسی (پیامک بانکی یا جمله صوتی کاربر) به تو داده می‌شود. وظیفه داری مشخصات مالی آن را به صورت یک شیء JSON خالص استخراج کنی.
فرمت دقیق خروجی:
{
  "amount_rials": <عدد صحیح مبلغ به ریال یا null>,
  "type": "<deposit یا withdraw>",
  "category": "<یکی از موارد: food, fuel, transport, home, rent_home, water, electricity, gas, internet, health, clothing, education, entertainment, installment, salary, freelance, sales, gift, other_expense, other_income>",
  "description": "<توضیح کوتاه حداکثر 50 کاراکتر>",
  "account_name": "<نام بانک یا کارت ذکر شده یا null>"
}

نکات:
- کاربر ممکن است بگوید مثلا "۵۰ هزار تومن دادم اسنپ" -> type: withdraw, category: transport, amount_rials: 500000.
- تومان را به ریال تبدیل کن (*10).
- فقط JSON برگردان بدون توضیحات اضافی.`;

function extractJsonFromResponse(raw: string): any {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

export async function parseReceiptWithVision(
  env: Env,
  imageBytes: Uint8Array
): Promise<ParsedTransaction> {
  const today = getTodayJalali();
  try {
    const payload = {
      prompt: RECEIPT_VISION_PROMPT,
      image: Array.from(imageBytes),
      max_tokens: 512,
    };

    let response: any;
    try {
      response = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload);
    } catch (aiErr: any) {
      const errStr = String(aiErr?.message || aiErr);
      if (
        errStr.includes("agree") ||
        errStr.includes("license") ||
        errStr.includes("policy") ||
        errStr.includes("5016")
      ) {
        // ثبت تاییدیه و تلاش مجدد در همان لحظه
        try {
          await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { prompt: "agree" } as any);
        } catch {}
        response = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload);
      } else {
        throw aiErr;
      }
    }

    let outputText = response.response || JSON.stringify(response);
    if (outputText.includes("Thank you for agreeing")) {
      // اگر در پاسخ هم تاییدیه آمده بود، یک بار دیگر فراخوانی کن تا تحلیل واقعی را بگیرد
      response = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", payload);
      outputText = response.response || JSON.stringify(response);
    }

    const data = extractJsonFromResponse(outputText);

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
      confidence: data.confidence || 0.85,
      notes: ["خوانده‌شده با هوش مصنوعی کلادفلر (Llama Vision)"],
    };
  } catch (error: any) {
    console.error("Workers AI Vision error:", error);
    return {
      tx_type: "withdraw",
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      notes: ["خطا در تحلیل تصویر رسید: " + (error?.message || "نامشخص")],
    };
  }
}

export async function transcribeVoice(
  env: Env,
  audioBytes: Uint8Array
): Promise<string> {
  try {
    const response: any = await env.AI.run("@cf/openai/whisper", {
      audio: Array.from(audioBytes),
    });
    return (response.text || "").trim();
  } catch (error) {
    console.error("Whisper transcription error:", error);
    throw new Error("خطا در تبدیل صدا به متن با Whisper");
  }
}

export async function parseTransactionFromText(
  env: Env,
  text: string
): Promise<ParsedTransaction> {
  const today = getTodayJalali();
  try {
    const response: any = await env.AI.run("@cf/meta/llama-3.3-70b-instruct", {
      messages: [
        { role: "system", content: TEXT_EXTRACTION_PROMPT },
        { role: "user", content: `متن ورودی:\n${text}` },
      ],
      max_tokens: 300,
    });

    const outputText = response.response || JSON.stringify(response);
    const data = extractJsonFromResponse(outputText);

    const txType: "deposit" | "withdraw" = data.type === "deposit" ? "deposit" : "withdraw";

    return {
      amount_rials: typeof data.amount_rials === "number" ? data.amount_rials : undefined,
      tx_type: txType,
      category: data.category || guessCategoryFromText(text, txType),
      description: data.description || text.slice(0, 50),
      account_name: data.account_name || undefined,
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      raw_text: text,
      notes: ["استخراج‌شده از پیامک/وویس صوتی"],
    };
  } catch (error: any) {
    console.error("Workers AI text extraction error:", error);
    return {
      tx_type: "withdraw",
      jalali_year: today.year,
      jalali_month: today.month,
      jalali_day: today.day,
      raw_text: text,
      description: text.slice(0, 40),
      notes: ["خطا در استخراج هوش مصنوعی"],
    };
  }
}
