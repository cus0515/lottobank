# Google Play 등록용 실제 서비스 화면을 크롬 헤드리스로 캡처합니다.
param(
    [string]$SiteUrl = "",
    [string]$OutDir = "play-store-assets"
)

$ErrorActionPreference = "Stop"

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) {
    throw "Chrome 또는 Edge 실행 파일을 찾지 못했습니다."
}

$nodeCandidates = @(
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"),
    ".tools\node\node.exe"
)

$node = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $node) {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
}
if (-not $node) {
    throw "Node.js 실행 파일을 찾지 못했습니다."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$captureScript = @'
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

const chromePath = process.env.LOTTOBANK_CHROME;
const externalSiteUrl = process.env.LOTTOBANK_SITE_URL || "";
const outDir = path.resolve(process.env.LOTTOBANK_OUT_DIR);
const appRoot = path.resolve(process.env.LOTTOBANK_APP_ROOT);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "lottobank-capture-"));
const chromePort = 9333 + Math.floor(Math.random() * 1000);
const appPort = 4300 + Math.floor(Math.random() * 1000);

fs.mkdirSync(outDir, { recursive: true });

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
}

function closeServer(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8"
  }[ext] || "application/octet-stream";
}

function captureHtmlFallback(html) {
  const stubs = `
<script>
(() => {
  const makeQuery = () => new Proxy(function(){}, {
    get(_target, prop) {
      if (prop === "then") return (resolve) => resolve({ data: [], error: null, count: 0 });
      return () => makeQuery();
    },
    apply() { return makeQuery(); }
  });
  window.supabase = window.supabase || {
    createClient() {
      return {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
          signInWithPassword: async () => ({ data: null, error: null }),
          signUp: async () => ({ data: null, error: null }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
        },
        from: () => makeQuery(),
        rpc: async () => ({ data: null, error: null }),
        storage: { from: () => makeQuery() }
      };
    }
  };
  window.Chart = window.Chart || function(){ return { destroy() {}, update() {} }; };
  window.jsQR = window.jsQR || function(){ return null; };
  window.Tesseract = window.Tesseract || { recognize: async () => ({ data: { text: "" } }) };
  window.L = window.L || {
    map: () => ({ setView(){ return this; }, remove(){}, invalidateSize(){}, on(){ return this; } }),
    tileLayer: () => ({ addTo(){ return this; } }),
    marker: () => ({ addTo(){ return this; }, bindPopup(){ return this; } })
  };
})();
</script>`;
  return html
    .replace(/<script[^>]+src="https:\/\/[^"]+"[^>]*><\/script>/g, "")
    .replace("</head>", `${stubs}</head>`);
}

const appServer = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${appPort}`);
    const cleanPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const fullPath = path.resolve(appRoot, cleanPath);
    if (!fullPath.startsWith(appRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      if (path.basename(fullPath).toLowerCase() === "index.html") {
        data = Buffer.from(captureHtmlFallback(data.toString("utf8")), "utf8");
      }
      res.writeHead(200, { "content-type": mimeType(fullPath), "cache-control": "no-store" });
      res.end(data);
    });
  } catch (err) {
    res.writeHead(500);
    res.end(String(err && err.message || err));
  }
});

async function json(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`);
  return res.json();
}

async function waitForEndpoint(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { return await json(url); } catch { await delay(150); }
  }
  throw new Error("Chrome debugging endpoint timed out.");
}

class Cdp {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result || {});
      }
    };
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

function safeNameScript() {
  return `
    (() => {
      const blocked = ["\uC724\uC11D\uC5F4", "allonsy__@naver.com", "allonsy__"];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        let text = node.nodeValue || "";
        for (const word of blocked) text = text.split(word).join("회원");
        node.nodeValue = text;
      }
    })();
  `;
}

function routeScript(route) {
  return `
    (() => {
      const wanted = ${JSON.stringify(route)};
      if (typeof window.go === "function") window.go(wanted);
      window.scrollTo(0, 0);
    })();
  `;
}

async function capturePage(cdp, file, metrics, route, url) {
  console.log(`capture ${file}`);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: metrics.width,
    height: metrics.height,
    deviceScaleFactor: metrics.dpr || 1,
    mobile: !!metrics.mobile
  });
  await cdp.send("Page.navigate", { url });
  await delay(metrics.initialWait || 2400);
  await cdp.send("Runtime.evaluate", { expression: routeScript(route), awaitPromise: true });
  await delay(metrics.routeWait || 1500);
  await cdp.send("Runtime.evaluate", { expression: safeNameScript(), awaitPromise: true });
  await delay(200);
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
}

async function main() {
  await listen(appServer, appPort);
  const localUrl = `http://127.0.0.1:${appPort}/index.html`;
  const captureUrl = externalSiteUrl || localUrl;
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--mute-audio",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let cdp;
  try {
    await waitForEndpoint(`http://127.0.0.1:${chromePort}/json/version`);
    const tabs = await json(`http://127.0.0.1:${chromePort}/json/list`);
    const target = tabs.find(tab => tab.type === "page") || tabs[0];
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const phone = { width: 432, height: 768, dpr: 2.5, mobile: true, initialWait: 3200, routeWait: 1500 };
    const tablet7 = { width: 1280, height: 720, dpr: 1, mobile: false, initialWait: 2800, routeWait: 1200 };
    const tablet10 = { width: 1920, height: 1080, dpr: 1, mobile: false, initialWait: 2800, routeWait: 1200 };
    const feature = { width: 1024, height: 500, dpr: 1, mobile: false, initialWait: 2800, routeWait: 1200 };

    const captures = [
      ["feature-graphic-1024x500.png", feature, "result"],
      ["screenshot-01-record-dashboard.png", phone, "home"],
      ["screenshot-02-qr-history.png", phone, "ticket"],
      ["screenshot-03-number-radar.png", phone, "fortune"],
      ["screenshot-04-community.png", phone, "community"],
      ["screenshot-05-results.png", phone, "result"],
      ["screenshot-06-lab.png", phone, "lab"],
      ["screenshot-07-ranking.png", phone, "rank"],
      ["screenshot-08-map.png", phone, "map"],
      ["tablet-7-01-dashboard.png", tablet7, "home"],
      ["tablet-7-02-radar.png", tablet7, "fortune"],
      ["tablet-7-03-lab.png", tablet7, "lab"],
      ["tablet-7-04-community.png", tablet7, "community"],
      ["tablet-10-01-dashboard.png", tablet10, "home"],
      ["tablet-10-02-radar.png", tablet10, "fortune"],
      ["tablet-10-03-lab.png", tablet10, "lab"],
      ["tablet-10-04-community.png", tablet10, "community"]
    ];

    for (const [file, metrics, route] of captures) {
      await capturePage(cdp, file, metrics, route, captureUrl);
    }
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
    await closeServer(appServer).catch(() => {});
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch {}
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
'@

$env:LOTTOBANK_CHROME = $chrome
$env:LOTTOBANK_SITE_URL = $SiteUrl
$env:LOTTOBANK_OUT_DIR = (Resolve-Path $OutDir).Path
$env:LOTTOBANK_APP_ROOT = (Resolve-Path ".").Path
$captureScript | & $node -
if ($LASTEXITCODE -ne 0) {
    throw "Play Store 이미지 캡처에 실패했습니다."
}

Write-Host "Play Store 이미지 캡처 완료: $OutDir"
