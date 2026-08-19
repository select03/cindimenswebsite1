import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint for contact form submissions with Telegram & Anti-Bot
app.post(["/api/submit-form", "/api/contact"], async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      organization,
      serviceType,
      budgetRange,
      preferredTime,
      message,
      formData,
      turnstileToken,
      hp_website,
      hp_company_ref
    } = req.body;

    // Normalizing payload format
    const actualData = formData || {
      name,
      email,
      phone,
      organization,
      serviceType,
      budgetRange,
      preferredTime,
      message
    };

    // 1. Honeypot check
    if (hp_website || hp_company_ref || (formData && formData.hp_website)) {
      console.warn("[Anti-Bot] Honeypot triggered, discarding silently.");
      return res.json({
        success: true,
        message: "預約諮詢單已收到！我們將盡速與您聯繫。"
      });
    }

    // 2. Required fields
    if (!actualData.name || !actualData.email || !actualData.phone || !actualData.message) {
      return res.status(400).json({
        success: false,
        error: "請完整填寫姓名、Email、聯絡電話與需求說明"
      });
    }

    const timestamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
    const leadId = `LEAD-${Date.now().toString(36).toUpperCase()}`;

    // 3. Optional Telegram Notification from server if configured
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    let telegramNotified = false;

    if (botToken && chatId) {
      try {
        const text = [
          `🎬 <b>【維度影學 收到新諮詢預約單】</b>`,
          `━━━━━━━━━━━━━━━━━━`,
          `👤 <b>預約稱呼：</b> ${actualData.name}`,
          `📞 <b>聯絡電話：</b> <code>${actualData.phone}</code>`,
          `✉️ <b>電子郵件：</b> ${actualData.email}`,
          `🏢 <b>單位/品牌：</b> ${actualData.organization || '個人諮詢'}`,
          `🎯 <b>意向項目：</b> <b>${actualData.serviceType || '一般諮詢'}</b>`,
          `💰 <b>預算範圍：</b> ${actualData.budgetRange || '未填寫'}`,
          `⏰ <b>期望時間：</b> ${actualData.preferredTime || '未指定'}`,
          `━━━━━━━━━━━━━━━━━━`,
          `📝 <b>需求說明：</b>\n<i>${actualData.message}</i>`,
          `━━━━━━━━━━━━━━━━━━`,
          `⏱️ <b>提交時間：</b> ${timestamp}`,
          `🆔 <b>單據編號：</b> <code>${leadId}</code>`
        ].join('\n');

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML"
          })
        });
        telegramNotified = true;
      } catch (tgErr) {
        console.warn("[Telegram Push Warning]:", tgErr);
      }
    }

    return res.json({
      success: true,
      id: leadId,
      timestamp,
      telegramNotified,
      message: "🎉 預約諮詢單已成功送出！悟哥與維度影學團隊已收到通知，將於 24 小時內親自與您聯繫。"
    });
  } catch (err) {
    console.error("Contact submit error:", err);
    return res.status(500).json({ success: false, error: "伺服器處理失敗，請重試" });
  }
});

// Vite Development or Static Production Server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
