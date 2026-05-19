const SSL_WIRELESS_URL = "https://sms.sslwireless.com/pushapi/dynamic/server.php";

interface SmsResult {
  phone: string;
  status: "sent" | "failed";
  provider_response?: unknown;
  error?: string;
}

export async function sendSslWirelessSms(phones: string[], message: string): Promise<SmsResult[]> {
  const apiToken = process.env.SSL_SMS_API_TOKEN;
  const sid = process.env.SSL_SMS_SID;

  if (!apiToken || !sid) {
    return phones.map((phone) => ({
      phone,
      status: "failed" as const,
      error: "SSL Wireless credentials not configured (SSL_SMS_API_TOKEN, SSL_SMS_SID)",
    }));
  }

  const results: SmsResult[] = [];

  for (const phone of phones) {
    const csmsid = `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    try {
      const params = new URLSearchParams({
        api_token: apiToken,
        sid,
        msisdn: phone,
        sms: message,
        csmsid,
      });

      const response = await fetch(SSL_WIRELESS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      const raw = await response.text();
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      const dataObj = data as Record<string, unknown>;
      // SSL Wireless returns status 200/4xx or a JSON body with "status_code" or "error"
      const isSuccess = response.ok && !dataObj.error && dataObj.status_code !== 4 && dataObj.status_code !== 5;

      results.push({
        phone,
        status: isSuccess ? "sent" : "failed",
        provider_response: data,
        error: isSuccess ? undefined : String(dataObj.error || dataObj.message || "Delivery failed"),
      });
    } catch (err: unknown) {
      results.push({
        phone,
        status: "failed",
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return results;
}
