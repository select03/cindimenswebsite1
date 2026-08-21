import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper function to safely update local content.json files
function writeLocalContentJson(data: any) {
  const contentPath = path.join(process.cwd(), "content.json");
  const publicContentPath = path.join(process.cwd(), "public", "content.json");

  const jsonStr = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(contentPath, jsonStr, "utf-8");
  } catch (err) {
    console.warn("Failed to write /content.json:", err);
  }

  try {
    if (!fs.existsSync(path.join(process.cwd(), "public"))) {
      fs.mkdirSync(path.join(process.cwd(), "public"), { recursive: true });
    }
    fs.writeFileSync(publicContentPath, jsonStr, "utf-8");
  } catch (err) {
    console.warn("Failed to write /public/content.json:", err);
  }
}

// Helper function to fetch and sync latest GitHub content.json
async function syncFromGitHubRepo() {
  const repos = [
    "https://raw.githubusercontent.com/select03/cindimenswebsite1/main/content.json",
    "https://raw.githubusercontent.com/select03/cindimenswebsite/main/content.json"
  ];

  for (const url of repos) {
    try {
      const res = await fetch(`${url}?_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const remoteData = await res.json();
        if (remoteData && (remoteData.portfolio || remoteData.assets || remoteData.siteInfo)) {
          // Read current local content if available
          let localData: any = {};
          try {
            const current = fs.readFileSync(path.join(process.cwd(), "content.json"), "utf-8");
            localData = JSON.parse(current);
          } catch (e) {}

          // Ensure valid assets with stable local backups
          const mergedAssets = {
            logo: (remoteData.assets?.logo || localData.assets?.logo || "/images/logo.svg").trim() || "/images/logo.svg",
            founderImage: (remoteData.assets?.founderImage || remoteData.assets?.avatar || localData.assets?.founderImage || "/images/avatar.svg").trim() || "/images/avatar.svg"
          };

          // Ensure Shell portfolio image isn't the stale placeholder
          let mergedPortfolio = remoteData.portfolio || localData.portfolio || [];
          if (Array.isArray(mergedPortfolio)) {
            mergedPortfolio = mergedPortfolio.map((item: any) => {
              if (item.id === "shell-lubricants-ad" || (item.title && item.title.includes("Shell"))) {
                if (!item.image || item.image.includes("photo-1486006920555")) {
                  return { ...item, image: "/images/shell.svg" };
                }
              }
              return item;
            });
          }

          const finalData = {
            ...localData,
            ...remoteData,
            assets: mergedAssets,
            portfolio: mergedPortfolio
          };

          writeLocalContentJson(finalData);
          console.log(`[GitHub Sync] Successfully synced latest content from ${url}`);
          return { success: true, url, data: finalData };
        }
      }
    } catch (err) {
      console.warn(`[GitHub Sync Warning] Failed to fetch from ${url}:`, err);
    }
  }
  return { success: false, error: "Could not fetch from remote GitHub repositories" };
}

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint to force pull & sync latest GitHub content.json to local filesystem
app.get("/api/sync-github-content", async (_req, res) => {
  const result = await syncFromGitHubRepo();
  res.json(result);
});

// Endpoint to save CMS content directly to local filesystem
app.post("/api/save-local-content", (req, res) => {
  try {
    const data = req.body.content || req.body;
    if (!data) {
      return res.status(400).json({ success: false, error: "Missing content payload" });
    }

    // Ensure fallback assets are preserved
    const sanitizedData = {
      ...data,
      assets: {
        logo: (data.assets?.logo || "/images/logo.svg").trim() || "/images/logo.svg",
        founderImage: (data.assets?.founderImage || data.assets?.avatar || "/images/avatar.svg").trim() || "/images/avatar.svg"
      }
    };

    writeLocalContentJson(sanitizedData);
    return res.json({
      success: true,
      message: "本機 content.json 與 public/content.json 已同步寫入更新！",
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to check diff between local and GitHub
app.get("/api/github-diff-check", async (_req, res) => {
  try {
    let localData = {};
    try {
      localData = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content.json"), "utf-8"));
    } catch (e) {}

    const remoteRes = await fetch(`https://raw.githubusercontent.com/select03/cindimenswebsite1/main/content.json?_t=${Date.now()}`);
    let remoteData = null;
    if (remoteRes.ok) {
      remoteData = await remoteRes.json();
    }

    return res.json({
      success: true,
      hasRemote: !!remoteData,
      localAssets: (localData as any).assets,
      remoteAssets: remoteData?.assets,
      localPortfolioCount: (localData as any).portfolio?.length || 0,
      remotePortfolioCount: remoteData?.portfolio?.length || 0
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
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
    // Auto-sync latest content from GitHub in background
    syncFromGitHubRepo().catch(e => console.warn("Initial GitHub sync error:", e));
  });
}

startServer();
