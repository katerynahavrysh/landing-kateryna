// Cloudflare Worker: віддає сайт із папки public і приймає заявки на /api/lead
// Пересилає заявку з форми вам на пошту через Resend (resend.com).
// Змінні (Cloudflare → воркер → Settings → Variables and Secrets):
//   RESEND_API_KEY — API-ключ із Resend (тип Secret)
//   LEAD_TO_EMAIL  — пошта, куди падають заявки (та сама, з якою ви
//                    зареєструвалися в Resend)
//   LEAD_FROM      — (необов'язково) відправник. За замовчуванням
//                    "Заявки з сайту <onboarding@resend.dev>"

const LIMITS = { name: 100, contact: 150, message: 2000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function handleLead(request, env) {
  if (!env.RESEND_API_KEY || !env.LEAD_TO_EMAIL) {
    return json({ ok: false, error: "not_configured" }, 500);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  // Пастка для ботів: справжні люди це поле не бачать і не заповнюють.
  if (data.website) return json({ ok: true });

  const clean = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const value = typeof data[key] === "string" ? data[key].trim() : "";
    if (!value) return json({ ok: false, error: `missing_${key}` }, 400);
    clean[key] = value.slice(0, max);
  }

  const text =
    "Нова заявка з сайту\n\n" +
    `Ім’я: ${clean.name}\n` +
    `Контакт: ${clean.contact}\n\n` +
    `${clean.message}\n`;

  const email = {
    from: env.LEAD_FROM || "Заявки з сайту <onboarding@resend.dev>",
    to: [env.LEAD_TO_EMAIL],
    subject: `Заявка з сайту: ${clean.name}`,
    text,
  };
  // Якщо людина лишила email — можна просто натиснути «Відповісти».
  if (EMAIL_RE.test(clean.contact)) email.reply_to = clean.contact;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  if (!res.ok) return json({ ok: false, error: "email_failed" }, 502);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/lead") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "method_not_allowed" }, 405);
      }
      return handleLead(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
