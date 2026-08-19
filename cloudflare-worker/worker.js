/**
 * Cloudflare Worker: Headless CMS Backend Proxy for GitHub REST API (v2.0)
 * 
 * Environment Variables (Set in Cloudflare Worker Dashboard -> Settings -> Variables):
 * - ADMIN_USER: Admin username (e.g. "admin")
 * - ADMIN_PASS: Admin password (e.g. "YourSecurePassword123!")
 * - GITHUB_TOKEN: GitHub Personal Access Token (classic with 'repo' scope or fine-grained with read/write to contents)
 * - REPO_OWNER: GitHub username or organization (default: "select03")
 * - REPO_NAME: Repository name (default: "cindimenswebsite1")
 * - BRANCH: Branch name (default: "main")
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

// 4 筆預設經典作品集資料（當 GitHub content.json 尚為空時自動提供完整範本）
const DEFAULT_INITIAL_PORTFOLIO = [
  {
    id: "zhuqi-farmers-association",
    title: "嘉義縣竹崎地區農會「手機影音實戰班」",
    category: "教育培訓與在地品牌",
    clientOrProject: "嘉義縣竹崎地區農會",
    year: "2023-2024",
    description: "擔任主要講師，帶領在地青農與電商學員，運用手機拍攝高品質農特產品特寫與行銷短影片，打造在地農業數位轉型標竿。",
    role: "影音課程總教練",
    tags: ["手機攝影", "農會內訓", "AI影音應用", "品牌行銷"],
    image: "https://img.youtube.com/vi/_JjmH05QYlU/hqdefault.jpg",
    videoUrl: "https://youtu.be/_JjmH05QYlU",
    highlights: [
      "輔導超過 50 位青農產出自家水果短影片",
      "滿意度高達 98%，學員後續觸及率提升顯著"
    ]
  },
  {
    id: "band-mv-music-video",
    title: "樂團 MV《說不愛就不愛》",
    category: "音樂錄影帶 MV / 電影感敘事",
    clientOrProject: "不寂寞樂團 x 阿京",
    year: "2018",
    description: "一手包辦現場攝影、氛圍燈光與剪輯後製，運用極致的情緒光影與強烈節奏感剪輯，完美詮釋歌曲的情感沉澱與故事張力。",
    role: "導演 / 攝影師 / 剪輯師",
    tags: ["音樂MV", "情緒調色", "節奏剪輯", "電影感視覺"],
    image: "https://img.youtube.com/vi/5p7nMVHx-AE/hqdefault.jpg",
    videoUrl: "https://youtu.be/5p7nMVHx-AE?si=BHl1KkzmHCa2CxKw",
    highlights: [
      "暗色調微光鏡頭極具電影氛圍",
      "流暢的節奏切換使歌曲觀看體驗大幅提升"
    ]
  },
  {
    id: "shell-lubricants-ad",
    title: "Shell 喜力汽車｜官方車輛保修 App 操作指南與情境形象引導片",
    category: "商業形象片 / App 功能情境演示",
    clientOrProject: "台灣殼牌 Shell Lubricants & Digital Solutions",
    year: "2015",
    description: "為全球潤滑油領導品牌 Shell 喜力汽車量身打造「車輛保修 App 官方操作與情境指南」。透過車主保養實境與清晰流暢的 App 介面操作演示，將繁複的預約維修、履歷查詢與保養檢測流程轉化為直覺易懂的影像語言，有效降低車主操作門檻，引導用戶精準掌握 App 核心功能，全面提升品牌數位服務體驗與滿意度。",
    role: "動態導演 / 商業動態攝影 / 介面情境演示指導",
    tags: ["商業形象片", "App操作指南", "情境演示", "保修實境", "降低學習門檻"],
    image: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=800&q=80",
    videoUrl: "",
    highlights: [
      "實境操作無縫結合：將保修廠情境與手機 App 介面無縫串聯",
      "降低學習門檻：以電影感光影與精準節奏演示，將複雜工具型 App 轉化為生動直覺的導覽體驗"
    ]
  },
  {
    id: "wedding-films-collection",
    title: "雲朵婚禮團隊 - 上百場溫暖婚禮電影紀錄",
    category: "婚禮電影記錄 / 人像紀實",
    clientOrProject: "百位新人人生大事紀錄",
    year: "2006-2020",
    description: "在極高壓、不可逆的現場環境下捕捉最真摯的人情溫度，運用敏銳的鏡頭語言與光影美學留下永恆的感動瞬間。",
    role: "資深攝影師 / 動態錄影師",
    tags: ["婚禮紀錄", "人像光影", "情緒捕捉", "現場實戰"],
    image: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=800&q=80",
    videoUrl: "",
    highlights: [
      "跨越靜態至動態錄影百場實戰經驗",
      "深厚的人像情感引導與自然光影敏銳度"
    ]
  }
];

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 2. Health check route
      if (path === '/' || path === '/api/health') {
        return jsonResponse({
          status: 'ok',
          service: 'CineDimension CMS Worker Proxy',
          version: '2.0',
          repo: `${env.REPO_OWNER || 'select03'}/${env.REPO_NAME || 'cindimenswebsite1'}`
        });
      }

      // 3. Public Login Route: POST /api/login
      if (path === '/api/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }

      // 4. Authenticate all other /api/* routes
      if (path.startsWith('/api/')) {
        const isAuth = await verifyAuth(request, env);
        if (!isAuth) {
          return jsonResponse({ error: '未授權：請先登入後台或登入 Token 已過期' }, 401);
        }

        // Route: GET /api/content
        if (path === '/api/content' && request.method === 'GET') {
          return await handleGetContent(env);
        }

        // Route: POST /api/upload (Image upload + Auto old image cleanup)
        if (path === '/api/upload' && request.method === 'POST') {
          return await handleUpload(request, env);
        }

        // Route: POST /api/save (Save content.json to GitHub)
        if (path === '/api/save' && request.method === 'POST') {
          return await handleSaveContent(request, env);
        }

        // Route: POST /api/delete-asset (Delete a file)
        if (path === '/api/delete-asset' && request.method === 'POST') {
          return await handleDeleteAsset(request, env);
        }
      }

      return jsonResponse({ error: 'API 路徑不存在' }, 404);
    } catch (err) {
      console.error('Worker Internal Error:', err);
      return jsonResponse({
        error: '伺服器內部錯誤',
        message: err.message,
        stack: err.stack
      }, 500);
    }
  }
};

// ==========================================
// AUTHENTICATION LOGIC (HMAC-SHA256)
// ==========================================

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;

  const validUser = (env.ADMIN_USER || 'admin').trim();
  const validPass = (env.ADMIN_PASS || 'admin888').trim();

  if (!username || !password || username !== validUser || password !== validPass) {
    return jsonResponse({ error: '帳號或密碼錯誤，請重新輸入' }, 401);
  }

  const timestamp = Date.now();
  const tokenPayload = `${username}:${timestamp}`;
  const token = await generateToken(tokenPayload, validPass);

  return jsonResponse({
    success: true,
    message: '登入成功',
    token: `${timestamp}.${token}`,
    user: username
  });
}

async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const tokenStr = authHeader.replace('Bearer ', '').trim();
  const [timestampStr, tokenHash] = tokenStr.split('.');
  if (!timestampStr || !tokenHash) return false;

  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();
  
  // 7 days token expiry
  if (isNaN(timestamp) || now - timestamp > 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  const validUser = (env.ADMIN_USER || 'admin').trim();
  const validPass = (env.ADMIN_PASS || 'admin888').trim();
  const expectedHash = await generateToken(`${validUser}:${timestamp}`, validPass);

  return tokenHash === expectedHash;
}

async function generateToken(message, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ==========================================
// GITHUB REST API CLIENT & PROXY
// ==========================================

function getRepoConfig(env) {
  const token = env.GITHUB_TOKEN ? env.GITHUB_TOKEN.trim() : '';
  return {
    owner: (env.REPO_OWNER || 'select03').trim(),
    repo: (env.REPO_NAME || 'cindimenswebsite1').trim(),
    branch: (env.BRANCH || 'main').trim(),
    token: token
  };
}

function githubHeaders(token) {
  return {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'CineDimension-CMS-Worker-Proxy/2.0'
  };
}

/**
 * Parses GitHub API error responses into user-friendly Chinese messages
 */
function parseGitHubError(status, errorText, config) {
  let details = errorText;
  try {
    const json = JSON.parse(errorText);
    details = json.message || errorText;
  } catch (e) {}

  if (status === 401) {
    return `GitHub 授權失敗 (401)：請檢查 Worker 的 GITHUB_TOKEN 是否有效且具備 repo 存取權限。`;
  }
  if (status === 404) {
    return `找不到儲存庫或分支 (404)：請確認 GitHub 儲存庫「${config.owner}/${config.repo}」與分支「${config.branch}」是否存在，且 Token 具備該儲存庫權限。原始訊息：${details}`;
  }
  if (status === 403) {
    return `GitHub 存取受限 (403)：可能是 API 速率限制或權限不足。訊息：${details}`;
  }
  if (status === 422) {
    return `GitHub 資料驗證失敗 (422)：${details}`;
  }
  return `GitHub API 回傳錯誤 (${status})：${details}`;
}

/**
 * GET /api/content: Retrieve content.json and files from GitHub
 */
async function handleGetContent(env) {
  const config = getRepoConfig(env);

  if (!config.token) {
    return jsonResponse({
      error: '伺服器未設定 GITHUB_TOKEN 環境變數',
      help: '請在 Cloudflare Worker 後台 -> Settings -> Variables -> 新增 GITHUB_TOKEN Secret'
    }, 500);
  }

  const fileUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/content.json?ref=${config.branch}`;
  const response = await fetch(fileUrl, {
    headers: githubHeaders(config.token)
  });

  // If content.json does not exist yet (404), return default rich data with 4 portfolio items
  if (response.status === 404) {
    return jsonResponse({
      exists: false,
      sha: null,
      content: {
        siteInfo: {
          title: "維度影學 Cine Dimension",
          tagline: "Have Fun 享受創作 ｜ 用手機拍出真實的電影感",
          email: "select03@gmail.com",
          youtube: "@cinedimens",
          facebook: "維度影學 Cine Dimension",
          instagram: ""
        },
        assets: {
          logo: "",
          founderImage: "",
          bannerImage: ""
        },
        portfolio: DEFAULT_INITIAL_PORTFOLIO
      },
      repo: { owner: config.owner, repo: config.repo, branch: config.branch }
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    const friendlyError = parseGitHubError(response.status, errorText, config);
    return jsonResponse({ error: friendlyError, rawDetails: errorText }, response.status);
  }

  const data = await response.json();
  const decodedContent = decodeBase64Utf8(data.content);
  let parsedContent;
  try {
    parsedContent = JSON.parse(decodedContent);
    // If portfolio is empty, fallback to the 4 default portfolio cases
    if (!parsedContent.portfolio || !Array.isArray(parsedContent.portfolio) || parsedContent.portfolio.length === 0) {
      parsedContent.portfolio = DEFAULT_INITIAL_PORTFOLIO;
    }
  } catch (e) {
    parsedContent = {
      siteInfo: {},
      assets: {},
      portfolio: DEFAULT_INITIAL_PORTFOLIO
    };
  }

  return jsonResponse({
    exists: true,
    sha: data.sha,
    content: parsedContent,
    repo: { owner: config.owner, repo: config.repo, branch: config.branch }
  });
}

/**
 * POST /api/upload: Uploads an image base64 to assets/images/ with automatic old image cleanup
 */
async function handleUpload(request, env) {
  const config = getRepoConfig(env);
  if (!config.token) {
    return jsonResponse({
      error: '伺服器未設定 GITHUB_TOKEN',
      help: '請在 Cloudflare Worker 後台 Settings -> Variables 綁定 GITHUB_TOKEN'
    }, 500);
  }

  const body = await request.json().catch(() => ({}));
  let { filename, base64, oldFilePath, replaceAndClean } = body;

  if (!filename || !base64) {
    return jsonResponse({ error: '請提供 filename 與 base64 檔案內容' }, 400);
  }

  // 1. Generate Safe Filename (Handling Chinese / spaces / special chars safely)
  const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').substring(0, 30);
  
  // Format: assets/images/{timestamp}_{cleanName}.{ext}
  const uniqueFilename = `${Date.now()}_${sanitizedName || 'image'}.${ext}`;
  const targetPath = `assets/images/${uniqueFilename}`;

  // Clean raw Base64 data (strip prefix and any whitespace/linebreaks)
  const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '').replace(/[\r\n\s]/g, '');

  // 2. Check if target new file exists
  let targetSha = null;
  const targetCheckUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${targetPath}?ref=${config.branch}`;
  const targetRes = await fetch(targetCheckUrl, { headers: githubHeaders(config.token) });
  if (targetRes.ok) {
    const targetData = await targetRes.json();
    targetSha = targetData.sha;
  }

  // 3. Old Image Auto-Cleanup Mechanism
  let deletedOldFile = null;
  if (replaceAndClean && oldFilePath) {
    // Extract relative path inside repo (e.g. assets/images/old.png)
    let cleanOldPath = oldFilePath;
    if (cleanOldPath.includes('assets/images/')) {
      cleanOldPath = 'assets/images/' + cleanOldPath.split('assets/images/')[1];
    } else if (cleanOldPath.startsWith('/')) {
      cleanOldPath = cleanOldPath.replace(/^\/+/, '');
    }

    // Only delete if it's within assets/images/ and not an external https:// link
    if (cleanOldPath.startsWith('assets/images/') && cleanOldPath !== targetPath) {
      const oldCheckUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${cleanOldPath}?ref=${config.branch}`;
      const oldRes = await fetch(oldCheckUrl, { headers: githubHeaders(config.token) });
      
      if (oldRes.ok) {
        const oldData = await oldRes.json();
        const oldSha = oldData.sha;

        const deleteUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${cleanOldPath}`;
        const deleteRes = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            ...githubHeaders(config.token),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: `[CMS] 自動清理被替換的舊素材: ${cleanOldPath}`,
            sha: oldSha,
            branch: config.branch
          })
        });

        if (deleteRes.ok) {
          deletedOldFile = cleanOldPath;
        }
      }
    }
  }

  // 4. Write new file via GitHub Contents PUT API with automatic branch auto-detection
  const putUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${targetPath}`;
  const putPayload = {
    message: `[CMS] 上傳新素材圖片: ${targetPath}`,
    content: cleanBase64
  };
  if (config.branch) {
    putPayload.branch = config.branch;
  }
  if (targetSha) {
    putPayload.sha = targetSha;
  }

  let putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      ...githubHeaders(config.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(putPayload)
  });

  // If 404, attempt retry without branch param (commits to repo default branch)
  if (putRes.status === 404 && putPayload.branch) {
    delete putPayload.branch;
    putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        ...githubHeaders(config.token),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    });
  }

  if (!putRes.ok) {
    const errorText = await putRes.text();
    const friendlyError = parseGitHubError(putRes.status, errorText, config);
    return jsonResponse({
      error: 'GitHub 圖片上傳失敗',
      details: friendlyError,
      raw: errorText,
      hint: `請確認：1. GitHub Token 是否有 repo 勾選權限。 2. 儲存庫「${config.owner}/${config.repo}」名稱大小寫是否完全正確。`
    }, putRes.status);
  }

  const putData = await putRes.json();
  const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${targetPath}`;
  const jsdelivrUrl = `https://cdn.jsdelivr.net/gh/${config.owner}/${config.repo}@${config.branch}/${targetPath}`;

  return jsonResponse({
    success: true,
    path: targetPath,
    rawUrl: rawUrl,
    cdnUrl: jsdelivrUrl,
    sha: putData.content?.sha,
    deletedOldFile: deletedOldFile,
    message: deletedOldFile ? `上傳成功，並已自動清理舊圖 (${deletedOldFile})` : '上傳成功！'
  });
}

/**
 * POST /api/save: Write updated content.json to GitHub
 */
async function handleSaveContent(request, env) {
  const config = getRepoConfig(env);
  if (!config.token) {
    return jsonResponse({ error: '未設定 GITHUB_TOKEN' }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const { content, message } = body;

  if (!content) {
    return jsonResponse({ error: '缺少 content 資料' }, 400);
  }

  const targetPath = 'content.json';
  
  // 1. Fetch current content.json SHA
  let currentSha = null;
  const checkUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${targetPath}?ref=${config.branch}`;
  const checkRes = await fetch(checkUrl, { headers: githubHeaders(config.token) });
  if (checkRes.ok) {
    const fileData = await checkRes.json();
    currentSha = fileData.sha;
  }

  // 2. Format JSON with 2-space indentation and encode to UTF-8 base64
  const jsonString = JSON.stringify(content, null, 2);
  const base64Content = encodeBase64Utf8(jsonString);

  // 3. Commit to GitHub via PUT
  const commitUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${targetPath}`;
  const commitPayload = {
    message: message || `[CMS] 更新網站內容 (${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })})`,
    content: base64Content,
    branch: config.branch
  };
  if (currentSha) {
    commitPayload.sha = currentSha;
  }

  const commitRes = await fetch(commitUrl, {
    method: 'PUT',
    headers: {
      ...githubHeaders(config.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commitPayload)
  });

  if (!commitRes.ok) {
    const errorText = await commitRes.text();
    const friendlyError = parseGitHubError(commitRes.status, errorText, config);
    return jsonResponse({ error: 'GitHub 儲存失敗', details: friendlyError, raw: errorText }, commitRes.status);
  }

  const commitData = await commitRes.json();

  return jsonResponse({
    success: true,
    message: '發佈成功！GitHub 資料已更新，將自動觸發 Cloudflare Pages 部署',
    sha: commitData.content?.sha,
    commit: commitData.commit?.html_url
  });
}

/**
 * POST /api/delete-asset: Delete a specified file from GitHub
 */
async function handleDeleteAsset(request, env) {
  const config = getRepoConfig(env);
  if (!config.token) return jsonResponse({ error: '未設定 GITHUB_TOKEN' }, 500);

  const body = await request.json().catch(() => ({}));
  const { filePath } = body;

  if (!filePath) return jsonResponse({ error: '請提供 filePath' }, 400);

  const cleanPath = filePath.replace(/^\/+/, '');
  const checkUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${cleanPath}?ref=${config.branch}`;
  const checkRes = await fetch(checkUrl, { headers: githubHeaders(config.token) });
  
  if (!checkRes.ok) {
    return jsonResponse({ error: '檔案不存在或已被刪除' }, 404);
  }

  const fileData = await checkRes.json();
  const deleteUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${cleanPath}`;
  const deleteRes = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      ...githubHeaders(config.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `[CMS] 刪除素材檔案: ${cleanPath}`,
      sha: fileData.sha,
      branch: config.branch
    })
  });

  if (!deleteRes.ok) {
    const errorText = await deleteRes.text();
    return jsonResponse({ error: '刪除失敗', details: errorText }, deleteRes.status);
  }

  return jsonResponse({ success: true, message: `檔案 ${cleanPath} 已成功刪除` });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

function encodeBase64Utf8(str) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64Str) {
  const clean = base64Str.replace(/[\r\n\s]/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}
