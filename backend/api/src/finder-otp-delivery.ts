export class FinderOtpDeliveryError extends Error {
  constructor() {
    super(
      "Could not send the verification code right now. Please try again later.",
    );
  }
}

/** Delivery only: challenges, hashes, verification and abuse budgets stay in MySQL. */
export async function deliverFinderOtp(
  phone: string,
  code: string,
  ttlSeconds: number,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<void> {
  const provider = (env.FINDER_OTP_PROVIDER || "console").toLowerCase();
  const message =
    "Your PetConnect finder verification code is " +
    code +
    ". It expires in " +
    Math.ceil(ttlSeconds / 60) +
    " minutes.";
  if (provider === "console" && env.NODE_ENV !== "production") {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "finder_otp_dev",
        phoneSuffix: phone.slice(-4),
        code,
      }) + "\n",
    );
    return;
  }
  try {
    let url: string;
    let authorization: string | undefined;
    let payload: object;
    if (provider === "smsgate") {
      if (
        !env.SMSGATE_BASE_URL ||
        !env.SMSGATE_USERNAME ||
        !env.SMSGATE_PASSWORD
      )
        throw new Error();
      url = env.SMSGATE_BASE_URL.replace(/\/+$/, "") + "/messages";
      authorization =
        "Basic " +
        Buffer.from(env.SMSGATE_USERNAME + ":" + env.SMSGATE_PASSWORD).toString(
          "base64",
        );
      payload = {
        textMessage: { text: message },
        phoneNumbers: [phone],
        ttl: ttlSeconds,
        ...(env.SMSGATE_DEVICE_ID?.trim()
          ? { deviceId: env.SMSGATE_DEVICE_ID.trim() }
          : {}),
      };
    } else if (provider === "webhook" && env.FINDER_OTP_WEBHOOK_URL) {
      url = env.FINDER_OTP_WEBHOOK_URL;
      authorization = env.FINDER_OTP_WEBHOOK_TOKEN
        ? "Bearer " + env.FINDER_OTP_WEBHOOK_TOKEN
        : undefined;
      payload = {
        to: phone,
        message,
        purpose: "petconnect_finder_verification",
      };
    } else {
      throw new Error();
    }
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    if (provider === "smsgate") {
      const receipt = (await response.json()) as {
        id?: unknown;
        state?: unknown;
      } | null;
      if (
        !receipt ||
        typeof receipt.id !== "string" ||
        !receipt.id.trim() ||
        typeof receipt.state !== "string" ||
        !["Pending", "Processed", "Sent", "Delivered"].includes(receipt.state)
      )
        throw new Error();
    } else {
      await response.body?.cancel();
    }
  } catch {
    // Never propagate provider bodies, credentials, numbers or OTPs into logs/UI.
    throw new FinderOtpDeliveryError();
  }
}
