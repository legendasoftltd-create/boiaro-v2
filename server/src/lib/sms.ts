import crypto from "crypto";

const API_BASE = "https://smsplus.sslwireless.com/api/v3";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCredentials() {
  const apiToken = process.env.SSL_SMS_API_TOKEN;
  const sid = process.env.SSL_SMS_SID;
  return { apiToken, sid };
}

function makeCsmsId() {
  return `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Normalize to Bangladesh MSISDN format: 88017XXXXXXXX
export function normalizeBdPhone(raw: string): string {
  let phone = raw.trim().replace(/[\s\-()]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("880")) return phone;
  if (phone.startsWith("0")) return "880" + phone.slice(1);
  return "880" + phone;
}

// ── AES-256-CBC + HMAC-SHA256 for Secure OTP ─────────────────────────────────

function encryptOtpSms(plainText: string, secretKey: string): string {
  // Key = first 32 ASCII chars of SHA256(secretKey) hex — matches SSL Wireless spec
  const keyHex = crypto.createHash("sha256").update(secretKey).digest("hex");
  const key = Buffer.from(keyHex.slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encryptedRaw = cipher.update(plainText, "utf8");
  encryptedRaw = Buffer.concat([encryptedRaw, cipher.final()]);
  // base64(raw_iv + base64(ciphertext)) — SSL Wireless double-encoding format
  const encryptedBase64 = encryptedRaw.toString("base64");
  return Buffer.concat([iv, Buffer.from(encryptedBase64)]).toString("base64");
}

function generateOtpSignature(csmsId: string, msisdn: string, sid: string, encryptedSms: string, secretKey: string): string {
  const params: Record<string, string> = { csms_id: csmsId, msisdn, sid, sms: encryptedSms };
  const queryString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  return crypto.createHmac("sha256", secretKey).update(queryString).digest("hex");
}

// ── Send secure OTP via ISMS Plus /secure/otp-sms ────────────────────────────

export async function sendOtpSms(rawPhone: string, otpText: string): Promise<{ success: boolean; error?: string }> {
  const { apiToken, sid } = getCredentials();
  const secretKey = process.env.SSL_SMS_OTP_SECRET;

  if (!apiToken || !sid || !secretKey) {
    return { success: false, error: "SSL Wireless OTP credentials not configured (SSL_SMS_API_TOKEN, SSL_SMS_SID, SSL_SMS_OTP_SECRET)" };
  }

  const msisdn = normalizeBdPhone(rawPhone);
  const csmsId = makeCsmsId();
  const encryptedSms = encryptOtpSms(otpText, secretKey);
  const signature = generateOtpSignature(csmsId, msisdn, sid, encryptedSms, secretKey);

  try {
    const response = await fetch(`${API_BASE}/secure/otp-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": signature,
      },
      body: JSON.stringify({ api_token: apiToken, sid, msisdn, sms: encryptedSms, csms_id: csmsId }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json()) as { status: string; status_code: number; error_message?: string };
    if (data.status === "SUCCESS" && data.status_code === 200) {
      return { success: true };
    }
    return { success: false, error: data.error_message || `API error ${data.status_code}` };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

// ── Bulk SMS for admin sends ──────────────────────────────────────────────────

interface SmsResult {
  phone: string;
  status: "sent" | "failed";
  error?: string;
}

export async function sendSslWirelessSms(phones: string[], message: string): Promise<SmsResult[]> {
  const { apiToken, sid } = getCredentials();

  if (!apiToken || !sid) {
    return phones.map((phone) => ({
      phone,
      status: "failed" as const,
      error: "SSL Wireless credentials not configured (SSL_SMS_API_TOKEN, SSL_SMS_SID)",
    }));
  }

  // Chunk into batches of 100 (API limit)
  const results: SmsResult[] = [];
  const batches: string[][] = [];
  for (let i = 0; i < phones.length; i += 100) batches.push(phones.slice(i, i + 100));

  for (const batch of batches) {
    const msisdns = batch.map(normalizeBdPhone);
    const batchCsmsId = makeCsmsId();

    try {
      const response = await fetch(`${API_BASE}/send-sms/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_token: apiToken, sid, msisdn: msisdns, sms: message, batch_csms_id: batchCsmsId }),
        signal: AbortSignal.timeout(30_000),
      });

      const data = (await response.json()) as {
        status: string;
        status_code: number;
        error_message?: string;
        smsinfo?: { msisdn: string; sms_status: string; status_message: string }[];
      };

      if (data.status === "SUCCESS" && Array.isArray(data.smsinfo)) {
        const infoMap = new Map(data.smsinfo.map((s) => [s.msisdn, s]));
        for (const orig of batch) {
          const normalized = normalizeBdPhone(orig);
          const info = infoMap.get(normalized);
          results.push({
            phone: orig,
            status: info?.sms_status === "SUCCESS" ? "sent" : "failed",
            error: info?.sms_status !== "SUCCESS" ? info?.status_message : undefined,
          });
        }
      } else {
        for (const orig of batch) {
          results.push({ phone: orig, status: "failed", error: data.error_message || `API error ${data.status_code}` });
        }
      }
    } catch (err: unknown) {
      for (const orig of batch) {
        results.push({ phone: orig, status: "failed", error: err instanceof Error ? err.message : "Network error" });
      }
    }
  }

  return results;
}
