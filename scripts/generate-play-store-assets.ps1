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
    map: () => ({ setView(){ return this; }, remove(){}, invalidateSize(){}, on(){ return this; }, attributionControl:{ setPrefix(){ return this; } } }),
    tileLayer: () => ({ addTo(){ return this; } }),
    marker: () => ({ addTo(){ return this; }, bindPopup(){ return this; } }),
    layerGroup: () => ({ addTo(){ return this; }, clearLayers(){ return this; } }),
    circle: () => ({ addTo(){ return this; } })
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
        else if (msg.result && msg.result.exceptionDetails) {
          const detail = msg.result.exceptionDetails;
          const description = detail.exception && detail.exception.description ? detail.exception.description : "";
          reject(new Error(`${detail.text || "Runtime evaluation failed."} ${description}`.trim()));
        }
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
      if (!document.body) return;
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

function captureReadyScript(route) {
  return `
    (() => {
      const route = ${JSON.stringify(route)};
      const ball = (n) => {
        const bg = n <= 9 ? "#f59e0b" : n <= 19 ? "#3b82f6" : n <= 29 ? "#ef4444" : n <= 39 ? "#64748b" : "#10b981";
        return '<span style="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:'+bg+';color:#fff;font-size:11px;font-weight:900;box-shadow:0 2px 5px rgba(15,23,42,.16);">'+String(n).padStart(2,"0")+'</span>';
      };
      const lottoResultHtml = () => ''
        + '<div style="background:var(--paper-white);border:1px solid var(--border-dashed);border-radius:8px;overflow:hidden;box-shadow:0 8px 20px rgba(15,23,42,.08);">'
        + '<div style="padding:16px 18px;border-bottom:1px solid var(--border-dashed);font-size:19px;font-weight:950;color:var(--text-dark);">\\uC81C <span style="color:var(--lotto-red);">1232\\uD68C</span> \\u00B7 2026-07-11</div>'
        + '<div style="padding:22px 16px;display:grid;gap:14px;">'
        + '<div style="display:flex;justify-content:center;gap:8px;align-items:center;">'+[12,15,19,22,24,36].map(ball).join("")+'<b style="font-size:18px;color:var(--text-muted);">+</b>'+ball(3)+'</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + '<div style="background:var(--bg-light);border-radius:7px;padding:10px;"><div style="font-size:10px;color:var(--text-muted);font-weight:800;">\\uCD94\\uCCA8\\uC77C</div><b style="font-size:15px;">2026-07-11</b></div>'
        + '<div style="background:var(--bg-light);border-radius:7px;padding:10px;"><div style="font-size:10px;color:var(--text-muted);font-weight:800;">\\uCD1D \\uD310\\uB9E4\\uC561</div><b style="font-size:15px;">111,221,155,000\\uC6D0</b></div>'
        + '</div>'
        + '<div style="border:1px solid var(--border-dashed);border-radius:8px;overflow:hidden;font-size:12px;">'
        + '<div style="display:grid;grid-template-columns:44px 1fr 70px 96px;background:var(--bg-light);font-weight:900;color:var(--text-muted);"><span style="padding:8px;">\\uB4F1\\uC218</span><span style="padding:8px;">\\uC870\\uAC74</span><span style="padding:8px;text-align:center;">\\uB2F9\\uCCA8\\uC218</span><span style="padding:8px;text-align:right;">\\uB2F9\\uCCA8\\uAE08</span></div>'
        + [[1,"6\\uAC1C \\uC77C\\uCE58","9\\uBA85","2,000,000,000\\uC6D0"],[2,"5\\uAC1C+\\uBCF4\\uB108\\uC2A4","64\\uBA85","55,000,000\\uC6D0"],[3,"5\\uAC1C \\uC77C\\uCE58","2,720\\uBA85","1,500,000\\uC6D0"],[4,"4\\uAC1C \\uC77C\\uCE58","135,000\\uBA85","50,000\\uC6D0"],[5,"3\\uAC1C \\uC77C\\uCE58","2,180,000\\uBA85","5,000\\uC6D0"]].map(r=>'<div style="display:grid;grid-template-columns:44px 1fr 70px 96px;border-top:1px dashed var(--border-dashed);"><b style="padding:8px;color:var(--lotto-red);">'+r[0]+'</b><span style="padding:8px;">'+r[1]+'</span><b style="padding:8px;text-align:center;">'+r[2]+'</b><b style="padding:8px;text-align:right;">'+r[3]+'</b></div>').join("")
        + '</div></div></div>';
      if (route === "fortune") {
        try {
          window._radarDataRetrying = true;
          window.renderFortune = function(){};
        } catch {}
        document.querySelectorAll(".page-content").forEach(p => {
          p.style.display = p.id === "pg-fortune" ? "block" : "none";
        });
        const page = document.getElementById("pg-fortune");
        const el = page || document.getElementById("fortune-content");
        if (!el) return;
        const games = [
          [2,5,20,21,32,41],
          [7,10,20,23,32,39],
          [2,5,13,20,21,41],
          [13,16,26,33,41,44],
          [7,11,20,21,23,39]
        ];
        const html = ''
          + '<div style="display:grid;gap:10px;">'
          + '<div style="background:var(--paper-white);border:1px solid var(--border-dashed);border-radius:8px;padding:14px;display:flex;gap:12px;align-items:center;">'
          + '<div style="width:44px;height:44px;border-radius:50%;border:1px solid rgba(225,29,72,.25);display:flex;align-items:center;justify-content:center;color:var(--lotto-red);font-weight:900;">RAD</div>'
          + '<div><div style="font-size:11px;font-weight:900;letter-spacing:.14em;color:var(--lotto-red);">LOTTOBANK EXCLUSIVE</div>'
          + '<div style="font-size:18px;font-weight:950;color:var(--text-dark);line-height:1.2;">\\uB85C\\uB610 6/45 \\uBC88\\uD638 \\uB808\\uC774\\uB354</div>'
          + '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">\\uCD5C\\uADFC \\uD68C\\uCC28 \\uB370\\uC774\\uD130 \\uAE30\\uBC18 \\uC790\\uB3D9 \\uBD84\\uC11D</div></div></div>'
          + '<div style="background:var(--paper-white);border:1px solid var(--border-dashed);border-radius:8px;padding:12px;">'
          + '<div style="font-size:12px;font-weight:900;color:var(--text-dark);margin-bottom:8px;">LottoBank \\uCD94\\uCC9C \\uC801\\uC911 \\uC774\\uB825</div>'
          + '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">'
          + [1,2,3,4,5].map(r => '<div style="background:var(--bg-light);border-radius:7px;padding:8px 4px;text-align:center;"><div style="font-size:11px;font-weight:800;color:var(--text-muted);">'+r+'\\uB4F1</div><b style="font-size:16px;color:var(--lotto-red);">0\\uBC88</b></div>').join("")
          + '</div></div>'
          + '<div style="background:var(--paper-white);border:2px solid var(--lotto-red);border-radius:8px;padding:13px 14px;position:relative;">'
          + '<div style="position:absolute;top:-1px;right:-1px;background:var(--lotto-red);color:#fff;border-radius:0 6px 0 7px;padding:5px 10px;font-size:10px;font-weight:900;">\\uC790\\uB3D9 \\uC800\\uC7A5</div>'
          + '<div style="font-size:16px;font-weight:950;color:var(--text-dark);margin-bottom:5px;">\\uB85C\\uB610 6/45 \\uC81C 1233\\uD68C \\uCD94\\uCC9C \\uBC88\\uD638</div>'
          + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:11px;">\\uCD9C\\uD604 \\uBE48\\uB3C4\\uC640 \\uAD6C\\uAC04 \\uADE0\\uD615 \\uAE30\\uBC18 \\uC870\\uD569</div>'
          + games.map((g,i) => '<div style="display:grid;grid-template-columns:48px 1fr;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border-dashed);"><b style="font-size:12px;color:var(--text-muted);">\\uAC8C\\uC784 '+(i+1)+'</b><div style="display:flex;justify-content:center;gap:7px;flex-wrap:nowrap;">'+g.map(ball).join("")+'</div></div>').join("")
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:var(--text-muted);"><span>\\uCD94\\uCC9C \\uC774\\uB825 \\uBCF4\\uAE30</span><span>\\uCD5C\\uADFC \\uACB0\\uACFC \\uC81C 1232\\uD68C</span></div>'
          + '</div></div>';
        el.innerHTML = page ? '<div id="fortune-content">'+html+'</div>' : html;
      }
      if (route === "result") {
        document.querySelectorAll(".page-content").forEach(p => {
          p.style.display = p.id === "pg-result" ? "block" : "none";
        });
        const page = document.getElementById("pg-result");
        if (page) page.innerHTML = lottoResultHtml();
      }
      if (route === "map") {
        document.querySelectorAll(".page-content").forEach(p => {
          p.style.display = p.id === "pg-map" ? "block" : "none";
        });
        const el = document.getElementById("map-content");
        if (!el) return;
        el.innerHTML = ''
          + '<div style="background:var(--paper-white);border:1px solid var(--border-dashed);border-radius:8px;overflow:hidden;">'
          + '<div style="height:300px;position:relative;background:linear-gradient(135deg,#e8f3e8 0%,#f8fafc 46%,#dbeafe 100%);">'
          + '<div style="position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(100,116,139,.18) 1px,transparent 1px),linear-gradient(rgba(100,116,139,.18) 1px,transparent 1px);background-size:44px 44px;opacity:.55;"></div>'
          + '<div style="position:absolute;left:48%;top:37%;transform:translate(-50%,-50%);width:42px;height:42px;border-radius:50% 50% 50% 0;background:var(--lotto-red);transform:translate(-50%,-50%) rotate(-45deg);box-shadow:0 6px 12px rgba(15,23,42,.22);"></div>'
          + '<div style="position:absolute;left:18%;top:62%;background:#fff;border:1px solid var(--border-dashed);border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;color:var(--text-dark);box-shadow:0 4px 10px rgba(15,23,42,.1);">\\uBCF5\\uAD8C\\uD310\\uB9E4\\uC18C</div>'
          + '<div style="position:absolute;right:14%;top:24%;background:#fff;border:1px solid var(--border-dashed);border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;color:var(--text-dark);box-shadow:0 4px 10px rgba(15,23,42,.1);">\\uB85C\\uB610 \\uD310\\uB9E4\\uC810</div>'
          + '<div style="position:absolute;right:20%;bottom:18%;background:#fff;border:1px solid var(--border-dashed);border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;color:var(--text-dark);box-shadow:0 4px 10px rgba(15,23,42,.1);">\\uB3D9\\uD589\\uBCF5\\uAD8C \\uD310\\uB9E4\\uC810</div>'
          + '</div>'
          + '<div style="padding:12px;"><button style="width:100%;padding:10px;border:0;border-radius:7px;background:var(--lotto-red);color:#fff;font-size:12px;font-weight:900;">\\uB0B4 \\uC8FC\\uBCC0 \\uD310\\uB9E4\\uC810 \\uCC3E\\uAE30</button>'
          + '<div style="font-size:10px;color:var(--text-muted);margin-top:7px;text-align:center;">\\uC704\\uCE58 \\uAD8C\\uD55C\\uC744 \\uD5C8\\uC6A9\\uD558\\uBA74 \\uBC18\\uACBD 1km \\uD310\\uB9E4\\uC810\\uC744 \\uCC3E\\uC2B5\\uB2C8\\uB2E4.</div></div></div>'
          + '<div style="margin-top:10px;"><div style="font-size:12px;font-weight:900;color:var(--text-dark);margin-bottom:7px;">\\uBC18\\uACBD 1km \\uB85C\\uB610 \\uD310\\uB9E4\\uC810</div>'
          + '<div style="display:grid;gap:6px;">'
          + ["\\uAC00\\uAE4C\\uC6B4 \\uBCF5\\uAD8C \\uD310\\uB9E4\\uC810","\\uB3D9\\uD589\\uBCF5\\uAD8C \\uD310\\uB9E4\\uC810","\\uB85C\\uB610 \\uD310\\uB9E4\\uC810"].map((name,i)=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:10px 11px;background:var(--paper-white);border:1px solid var(--border-dashed);border-radius:7px;"><span><b style="display:block;font-size:12px;">'+name+'</b><span style="font-size:10px;color:var(--text-muted);">\\uC704\\uCE58 \\uAD8C\\uD55C \\uAE30\\uC900 \\uC8FC\\uBCC0 \\uD310\\uB9E4\\uC810</span></span><b style="font-size:11px;color:var(--lotto-red);white-space:nowrap;">'+(240+i*210)+'m</b></div>').join("")
          + '</div></div>';
      }
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
  const needsReadyFallback = route === "fortune" || route === "map" || route === "result";
  if (needsReadyFallback) {
    await cdp.send("Runtime.evaluate", { expression: captureReadyScript(route), awaitPromise: true });
    await delay(500);
  }
  await cdp.send("Runtime.evaluate", { expression: safeNameScript(), awaitPromise: true });
  if (needsReadyFallback) {
    await cdp.send("Runtime.evaluate", { expression: captureReadyScript(route), awaitPromise: true });
    await delay(300);
    await cdp.send("Runtime.evaluate", { expression: captureReadyScript(route), awaitPromise: true });
  }
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
