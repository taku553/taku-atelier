/**
 * Cloudflare Worker entry point for the taku-atelier site.
 *
 * Serves the static site from `static/` via the ASSETS binding and handles
 * the `/api/contact` route for the contact form, sending submissions to
 * support@taku-atelier.com using the Cloudflare Email Sending Workers API
 * (`send_email` binding, configured in wrangler.toml). Cloudflare Email
 * Routing then forwards that mailbox as already configured for the domain.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DESTINATION_ADDRESS = "support@taku-atelier.com";
// Sender address must belong to a domain onboarded with Cloudflare Email
// Service (taku-atelier.com). It does not need its own mailbox.
const SENDER_ADDRESS = "contact-form@taku-atelier.com";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleContact(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: "リクエストの形式が正しくありません。" }, 400);
  }

  const email = typeof data.email === "string" ? data.email.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  // Honeypot: real users never fill this hidden field in.
  const company = typeof data.company === "string" ? data.company.trim() : "";

  if (company) {
    // Pretend success so bots don't learn their submission was rejected.
    return jsonResponse({ ok: true });
  }

  const errors = {};
  if (!email) {
    errors.email = "メールアドレスを入力してください。";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "メールアドレスの形式が正しくありません。";
  }
  if (!message) {
    errors.message = "お問い合わせ内容を入力してください。";
  }

  if (Object.keys(errors).length > 0) {
    return jsonResponse({ errors }, 400);
  }

  try {
    await env.EMAIL.send({
      to: DESTINATION_ADDRESS,
      from: SENDER_ADDRESS,
      replyTo: email,
      subject: "【Takuのアトリエ】お問い合わせフォームより",
      text:
        "お問い合わせフォームより送信がありました。\n\n" +
        `送信者メールアドレス: ${email}\n\n` +
        "--- お問い合わせ内容 ---\n" +
        `${message}\n`,
    });
  } catch (err) {
    console.error("Email send failed:", err && err.code, err && err.message);
    return jsonResponse(
      { error: "送信に失敗しました。時間をおいて再度お試しください。" },
      502
    );
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
