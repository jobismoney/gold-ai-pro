console.log("APP JS VERSION 36 STEP2 CLEAN ATP LAYOUT LOADED");

const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";
let autoRefreshTimer = null;
let countdownTimer = null;
let nextApiUpdateAt = null;

const API_REFRESH_SECONDS = 30;
const MAX_MANUAL_ATP = 10;
const MANUAL_ATP_KEY = "gold_ai_manual_atp_v1";

let previousPrice = null;
let previousSignal = null;
let soundEnabled = true;

let latestChartData = [];
let latestData = null;
let latestAnalysis = null;

let builderSide = "BUY";
let manualAtpPlans = [];

let chartIndicators = {
  ema: true,
  bollinger: true,
  fvg: false,
  sr: false,
  rsi: false,
  macd: false
};

let editorIndicatorState = {
  ema: true,
  rsi: false,
  macd: false,
  bollinger: true,
  fvg: true,
  sr: true,
  fib: true,
  atr: true
};

let detailIndicatorState = {
  ema: true,
  rsi: true,
  macd: false,
  bollinger: true,
  fvg: true,
  sr: true,
  fib: true,
  atr: true,
  levels: true
};

/* =========================
   BASIC HELPERS
========================= */

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
}

function setHtml(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = value ?? "";
}

function getSettingValue(id, fallback) {
  const node = document.getElementById(id);
  return node?.value || fallback;
}

function getNumberValue(id, fallback = 0) {
  const node = document.getElementById(id);
  const value = Number(node?.value);
  return Number.isFinite(value) ? value : fallback;
}

function setInputValue(id, value) {
  const node = document.getElementById(id);
  if (node) node.value = value ?? "";
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function signed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatThaiDateTime(value) {
  if (!value || value === "-") return "-";

  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);

    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch (e) {
    return String(value);
  }
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatSource(source) {
  if (!source) return "-";
  if (source.includes("binance_vision_spot")) return "Binance Vision Spot PAXGUSDT";
  if (source.includes("binance_main_spot")) return "Binance Main Spot PAXGUSDT";
  if (source.includes("binance_futures")) return "Binance Futures PAXGUSDT";
  if (source.includes("binance_proxy")) return "Binance Proxy Cache";
  if (source.includes("binance_paxgusdt")) return "Binance PAXGUSDT";
  if (source.includes("demo")) return "Demo/Fallback";
  return source;
}

function formatQuality(q) {
  if (!q) return "-";
  if (q === "A_STRONG") return "A | Strong";
  if (q === "B_MEDIUM") return "B | Medium";
  if (q === "C_WEAK") return "C | Weak";
  if (q === "C_WAIT") return "C | Wait";
  return q;
}

function formatYesNo(value) {
  return value === true ? "YES" : "NO";
}

function formatFvg(fvg) {
  if (!fvg) return "-";

  const type =
    fvg.type === "bullish" ? "Bullish" :
    fvg.type === "bearish" ? "Bearish" :
    fvg.type;

  const status = fvg.status ? ` | ${fvg.status}` : "";
  const distance = fvg.distanceFromPrice !== undefined ? ` | Δ ${fvg.distanceFromPrice}` : "";

  return `${type} ${fvg.bottom}-${fvg.top}${status}${distance}`;
}

function formatTelegramReason(reason) {
  const map = {
    sent: "ส่งสัญญาณ VIP เข้า Telegram แล้ว",
    vip_disabled: "ยังไม่ได้เปิด VIP",
    unauthorized_admin_key: "Admin Key ไม่ถูกต้อง หรือไม่ได้กรอก",
    demo_mode_no_vip_alert: "ไม่ส่ง เพราะระบบอยู่ใน Demo/Fallback",
    wait_signal: "ไม่ส่ง เพราะตอนนี้เป็น WAIT",
    confidence_too_low: "ไม่ส่ง เพราะ Confidence ต่ำกว่าเกณฑ์",
    too_many_contradictions: "ไม่ส่ง เพราะสัญญาณขัดแย้งหลายจุด",
    duplicate_signal_cooldown: "ไม่ส่ง เพราะเป็นสัญญาณซ้ำและยังอยู่ใน Cooldown",
    telegram_config_missing_or_failed: "ส่งไม่สำเร็จ: Telegram config ไม่ครบหรือผิดพลาด",
    vip_quality_filter_blocked: "ไม่ส่ง เพราะ Smart Filter ยังไม่อนุญาตให้ส่ง VIP",
    active_plan_running: "ไม่ส่ง เพราะมี Active Trade Plan กำลังทำงานอยู่",
    current_signal_wait: "ไม่ส่ง เพราะตอนนี้เป็น WAIT",
    quality_not_allowed: "ไม่ส่ง เพราะคุณภาพสัญญาณยังไม่ผ่าน",
    active_plan_not_created: "ไม่ส่ง เพราะยังไม่ได้สร้าง Active Plan"
  };

  return map[reason] || reason || "ไม่ทราบสาเหตุ";
}

function formatPlanReason(reason) {
  const map = {
    active_plan_created: "Created",
    active_plan_running: "Locked: Active plan running",
    current_signal_wait: "No plan: Current signal is WAIT",
    demo_no_active_plan: "No plan: Demo/Fallback",
    quality_not_allowed: "No plan: Quality not allowed",
    missing_trade_plan: "No plan: Missing Entry/SL/TP"
  };

  return map[reason] || reason || "-";
}

function getCurrentPrice() {
  const p = Number(latestData?.price || latestAnalysis?.price);
  return Number.isFinite(p) ? p : null;
}

function renderBulletListHtml(items, emptyText = "-") {
  if (!items || !items.length) {
    return `<div class="mini-bullet-empty">${escapeHtml(emptyText)}</div>`;
  }

  return items
    .map(item => `<div class="mini-bullet-item">• ${escapeHtml(item)}</div>`)
    .join("");
}

/* =========================
   UI
========================= */

function showToast(title, message = "", type = "warning") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    <div>${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = "0.2s ease";
    setTimeout(() => toast.remove(), 220);
  }, 2600);
}

function renderList(id, items) {
  const box = document.getElementById(id);
  if (!box) return;

  box.innerHTML = "";

  if (!items || !items.length) {
    box.innerText = "-";
    return;
  }

  items.forEach(item => {
    const div = document.createElement("div");
    div.innerText = "• " + item;
    box.appendChild(div);
  });
}

function toggleSection(bodyId, btn) {
  const body = document.getElementById(bodyId);
  if (!body) return;

  body.classList.toggle("closed");
  if (btn) btn.innerText = body.classList.contains("closed") ? "รายละเอียด" : "ย่อ";
}

/* =========================
   HOME CLEAN FLOW
========================= */

function applyHomeCleanFlow() {
  const aiSection = document.getElementById("section-plan");
  const builderSection = document.getElementById("section-builder");

  if (aiSection) aiSection.style.display = "none";
  if (builderSection) builderSection.style.display = "none";

  injectHomeCleanCurrentAnalysis();
  injectAdvancedBuilderButton();
  upgradeIndicatorButtons();
  injectModalCssV36();
}

function injectHomeCleanCurrentAnalysis() {
  const analysisBody = document.getElementById("analysisBody");
  if (!analysisBody) return;
  if (document.getElementById("homeCleanSummary")) return;

  const summary = document.createElement("div");
  summary.id = "homeCleanSummary";
  summary.className = "home-clean-summary";
  summary.style.marginBottom = "16px";

  summary.innerHTML = `
    <div class="mini-grid">
      <div class="mini-card"><span>Signal</span><b id="analysisSignal">-</b></div>
      <div class="mini-card"><span>Confidence</span><b id="analysisConfidence">-</b></div>
      <div class="mini-card"><span>AI Score</span><b id="analysisAiScore">-</b></div>
      <div class="mini-card"><span>Quality</span><b id="analysisQuality">-</b></div>
      <div class="mini-card"><span>VIP</span><b id="analysisVip">-</b></div>
      <div class="mini-card"><span>ATP Lock</span><b id="analysisAtpLock">-</b></div>
    </div>
  `;

  analysisBody.prepend(summary);
}

function injectAdvancedBuilderButton() {
  const quickTrade = document.querySelector(".quick-trade-flow");
  if (!quickTrade) return;
  if (document.getElementById("advancedBuilderToggle")) return;

  const box = document.createElement("div");
  box.style.marginTop = "14px";
  box.innerHTML = `
    <button id="advancedBuilderToggle" class="btn-main ghost" type="button" onclick="openAdvancedBuilder()">
      🧩 Advanced Plan Builder
    </button>
  `;

  quickTrade.appendChild(box);
}

function openAdvancedBuilder() {
  const builderSection = document.getElementById("section-builder");
  if (!builderSection) return;

  builderSection.style.display = "block";
  builderSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("เปิด Advanced Plan Builder", "ใช้สำหรับแก้ Entry / SL / TP เองแบบละเอียด", "warning");
}

function upgradeIndicatorButtons() {
  const row = document.querySelector(".indicator-toggle-row");
  if (!row) return;

  if (!document.getElementById("toggleFvg")) {
    const btn = document.createElement("button");
    btn.id = "toggleFvg";
    btn.className = "indicator-toggle";
    btn.type = "button";
    btn.onclick = () => toggleChartIndicator("fvg");
    btn.innerText = "FVG";
    row.insertBefore(btn, document.getElementById("toggleRsi") || null);
  }

  if (!document.getElementById("toggleSr")) {
    const btn = document.createElement("button");
    btn.id = "toggleSr";
    btn.className = "indicator-toggle";
    btn.type = "button";
    btn.onclick = () => toggleChartIndicator("sr");
    btn.innerText = "Support / Resistance";
    row.insertBefore(btn, document.getElementById("toggleRsi") || null);
  }

  syncIndicatorButtons();
}

function updateHomeCleanSummary(s) {
  setText("analysisSignal", s.signal || "-");

  const conf = Number(s.confidence || 0);
  const confText =
    conf >= 80 ? `${conf}% | Strong` :
    conf >= 70 ? `${conf}% | Medium` :
    conf > 0 ? `${conf}% | Weak` : "-";

  setText("analysisConfidence", confText);
  setText("analysisAiScore", s.aiScore !== undefined ? `${s.aiScore}/100` : "-");
  setText("analysisQuality", formatQuality(s.signalQuality));
  setText("analysisVip", formatYesNo(s.vipAllowed));
  setText("analysisAtpLock", formatPlanReason(s.activePlanReason));
}

/* =========================
   SOUND
========================= */

function playTone(kind = "info") {
  if (!soundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (kind === "success") osc.frequency.value = 880;
    else if (kind === "danger") osc.frequency.value = 320;
    else osc.frequency.value = 620;

    gain.gain.value = 0.001;
    osc.start();

    gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

    osc.stop(ctx.currentTime + 0.28);
  } catch (e) {
    console.log("Sound blocked:", e);
  }
}

function loadSoundSetting() {
  const saved = localStorage.getItem("gold_ai_sound_enabled");
  soundEnabled = saved !== "off";

  const icon = document.getElementById("soundIcon");
  const select = document.getElementById("soundEnabledSelect");

  if (icon) icon.innerText = soundEnabled ? "🔊" : "🔇";
  if (select) select.value = soundEnabled ? "on" : "off";
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("gold_ai_sound_enabled", soundEnabled ? "on" : "off");
  loadSoundSetting();

  showToast(
    soundEnabled ? "เปิดเสียงแจ้งเตือน" : "ปิดเสียงแจ้งเตือน",
    soundEnabled ? "ระบบจะมีเสียงเบา ๆ เมื่อเกิด event สำคัญ" : "ระบบจะเงียบทั้งหมด",
    "warning"
  );
}

function applySoundSettingFromSelect() {
  const select = document.getElementById("soundEnabledSelect");
  if (!select) return;

  soundEnabled = select.value === "on";
  localStorage.setItem("gold_ai_sound_enabled", soundEnabled ? "on" : "off");
  loadSoundSetting();
}

/* =========================
   ADMIN
========================= */

function getAdminKey() {
  return getSettingValue("adminKey", "").trim();
}

function requireAdminKey() {
  const key = getAdminKey();

  if (!key) {
    showToast("กรุณาใส่ Admin Key ก่อน", "กรอก Admin Key ใน Admin Panel", "warning");
    return null;
  }

  return key;
}

function toggleAdminPanel() {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;

  const isHidden = panel.style.display === "none" || panel.style.display === "";
  panel.style.display = isHidden ? "block" : "none";

  if (isHidden) {
    showToast("เปิด Admin Panel", "ตั้งค่า Price Calibration / Telegram / VIP ได้ที่นี่", "warning");
  }
}

function toggleAdminKey() {
  const input = document.getElementById("adminKey");
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

/* =========================
   COUNTDOWN
========================= */

function updateApiCountdown() {
  const el = document.getElementById("autoRefreshStatus");
  const miniEl = document.getElementById("refreshCountdown");

  if (!nextApiUpdateAt) return;

  const remainMs = nextApiUpdateAt - Date.now();
  const text = formatCountdown(remainMs);

  if (el) el.innerText = `Next API update in ${text} | TV-Calibrated Proxy`;
  if (miniEl) miniEl.innerText = text;

  if (remainMs <= 0) loadSignal();
}

function setNextApiUpdate(value) {
  if (value) {
    const t = new Date(value).getTime();
    if (!isNaN(t)) {
      nextApiUpdateAt = t;
      updateApiCountdown();
      return;
    }
  }

  nextApiUpdateAt = Date.now() + API_REFRESH_SECONDS * 1000;
  updateApiCountdown();
}

/* =========================
   API
========================= */

async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();
    console.log("SIGNAL DATA:", data);

    render(data);
    setNextApiUpdate(data.nextApiUpdate || data.signal?.nextCheck || data.currentAnalysis?.nextCheck);

  } catch (err) {
    console.error("Signal error:", err);
    setText("marketStatus", "ERROR");
    showToast("โหลดสัญญาณไม่สำเร็จ", "กรุณาลองใหม่อีกครั้ง", "danger");
  }
}

async function sendVipSignal() {
  const statusEl = document.getElementById("vipAlertStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  const minConf = getSettingValue("minConfidence", "75");
  const cooldown = getSettingValue("cooldownMinutes", "30");

  try {
    if (statusEl) statusEl.innerText = `VIP Alert: checking signal... | Min ${minConf}% | Cooldown ${cooldown}m`;

    const url =
      `${API_URL}?mode=${currentMode}` +
      `&vip=true` +
      `&min_conf=${encodeURIComponent(minConf)}` +
      `&cooldown=${encodeURIComponent(cooldown)}` +
      `&admin_key=${encodeURIComponent(adminKey)}` +
      `&t=${Date.now()}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.reason === "unauthorized_admin_key") {
      if (statusEl) statusEl.innerText = "VIP Alert: ❌ Admin Key ไม่ถูกต้อง";
      showToast("Admin Key ไม่ถูกต้อง", "ตรวจสอบรหัสอีกครั้ง", "danger");
      playTone("danger");
      return;
    }

    render(data);
    setNextApiUpdate(data.nextApiUpdate || data.signal?.nextCheck || data.currentAnalysis?.nextCheck);

    const reasonText = formatTelegramReason(data.telegramReason);

    if (data.telegram === true) {
      if (statusEl) statusEl.innerText = `VIP Alert: ✅ sent | Min ${minConf}% | Cooldown ${cooldown}m`;
      showToast("ส่ง VIP Alert สำเร็จ", "ส่งเข้า Telegram แล้ว", "success");
      playTone("success");
    } else {
      if (statusEl) statusEl.innerText = "VIP Alert: " + reasonText;
      showToast("ยังไม่ส่ง Telegram", reasonText, "warning");
    }

  } catch (err) {
    console.error("VIP alert error:", err);
    if (statusEl) statusEl.innerText = "VIP Alert: ❌ connection error";
    showToast("VIP Alert error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function testTelegram() {
  const statusEl = document.getElementById("telegramTestStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) statusEl.innerText = "Telegram: sending test...";

    const res = await fetch(`${API_URL}?mode=test-telegram&admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.reason === "unauthorized_admin_key") {
      if (statusEl) statusEl.innerText = "Telegram: ❌ Admin Key ไม่ถูกต้อง";
      showToast("Admin Key ไม่ถูกต้อง", "ตรวจสอบรหัสอีกครั้ง", "danger");
      playTone("danger");
      return;
    }

    if (data.ok === true) {
      if (statusEl) statusEl.innerText = "Telegram: ✅ test sent successfully";
      showToast("Telegram Test สำเร็จ", "ส่งข้อความทดสอบแล้ว", "success");
      playTone("success");
    } else {
      if (statusEl) statusEl.innerText = `Telegram: ❌ ${data.reason || "test failed"}`;
      showToast("ส่ง Telegram ไม่สำเร็จ", data.reason || data.message || "unknown", "danger");
      playTone("danger");
    }

  } catch (err) {
    console.error("Telegram test error:", err);
    if (statusEl) statusEl.innerText = "Telegram: ❌ connection error";
    showToast("Telegram test error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function resetActivePlan() {
  const statusEl = document.getElementById("resetActiveStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) statusEl.innerText = "Active Plan Reset: resetting...";

    const res = await fetch(`${API_URL}/reset-active-plan?admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.ok === true) {
      if (statusEl) statusEl.innerText = "Active Plan Reset: ✅ done";
      showToast("Reset AI Active Plan สำเร็จ", "ระบบล้างแผน AI ที่ล็อกไว้แล้ว", "success");
      playTone("success");
      loadSignal();
    } else {
      if (statusEl) statusEl.innerText = `Active Plan Reset: ❌ ${data.reason || "failed"}`;
      showToast("Reset ไม่สำเร็จ", data.reason || data.message || "unknown", "danger");
      playTone("danger");
    }

  } catch (err) {
    console.error("Reset active plan error:", err);
    if (statusEl) statusEl.innerText = "Active Plan Reset: ❌ connection error";
    showToast("Reset Active Plan error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

/* =========================
   CALIBRATION
========================= */

function updateCalibrationUiFromData(data) {
  if (!data) return;

  const raw = Number(data.rawPrice);
  const offset = Number(data.priceOffset);
  const adjusted = Number(data.adjustedPrice || data.price);

  if (Number.isFinite(raw)) {
    setText("calibrationRawPrice", money(raw));
    setText("adminRawPrice", money(raw));
  }

  if (Number.isFinite(offset)) {
    setText("calibrationOffsetText", signed(offset));
    const input = document.getElementById("calibrationOffsetInput");
    if (input && document.activeElement !== input) input.value = offset.toFixed(2);
  }

  if (Number.isFinite(adjusted)) {
    setText("calibrationAdjustedPrice", money(adjusted));
    setText("adminAdjustedPrice", money(adjusted));
  }

  if (data.calibration) {
    setText("calibrationMode", data.calibration.mode || "-");
    setText("calibrationSource", data.calibration.source || "-");
  }
}

async function loadCalibrationInfo() {
  try {
    const res = await fetch(`${API_URL}/calibration?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.ok && data.calibration) {
      const offset = Number(data.calibration.priceOffset);
      const input = document.getElementById("calibrationOffsetInput");
      if (input && Number.isFinite(offset)) input.value = offset.toFixed(2);

      setText("calibrationMode", data.calibration.mode || "-");
      setText("calibrationSource", data.calibration.source || "-");
      setText("calibrationStatus", `Price Calibration: loaded offset ${signed(offset)}`);
    }

  } catch (err) {
    console.error("Load calibration error:", err);
    setText("calibrationStatus", "Price Calibration: load error");
  }
}

async function saveCalibrationOffset() {
  const statusEl = document.getElementById("calibrationStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  const input = document.getElementById("calibrationOffsetInput");
  const offset = Number(input?.value);

  if (!Number.isFinite(offset) || offset < -50 || offset > 50) {
    showToast("Offset ไม่ถูกต้อง", "กรุณาใส่ค่าระหว่าง -50 ถึง +50", "danger");
    if (statusEl) statusEl.innerText = "Price Calibration: invalid offset";
    return;
  }

  try {
    if (statusEl) statusEl.innerText = `Price Calibration: saving offset ${signed(offset)}...`;

    const url =
      `${API_URL}/calibration` +
      `?action=save` +
      `&offset=${encodeURIComponent(offset.toFixed(2))}` +
      `&admin_key=${encodeURIComponent(adminKey)}` +
      `&t=${Date.now()}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.ok === true) {
      if (statusEl) statusEl.innerText = `Price Calibration: ✅ saved offset ${signed(offset)}`;
      showToast("บันทึก Offset สำเร็จ", `Offset ใหม่ = ${signed(offset)}`, "success");
      playTone("success");
      await loadSignal();
      await loadCalibrationInfo();
      return;
    }

    if (statusEl) statusEl.innerText = `Price Calibration: ❌ ${data.reason || "save failed"}`;
    showToast("บันทึก Offset ไม่สำเร็จ", data.message || data.reason || "unknown", "danger");
    playTone("danger");

  } catch (err) {
    console.error("Save calibration error:", err);
    if (statusEl) statusEl.innerText = "Price Calibration: ❌ connection error";
    showToast("Calibration error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function resetCalibrationOffset() {
  const statusEl = document.getElementById("calibrationStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) statusEl.innerText = "Price Calibration: resetting to +6.50...";

    const url =
      `${API_URL}/calibration` +
      `?action=reset` +
      `&admin_key=${encodeURIComponent(adminKey)}` +
      `&t=${Date.now()}`;

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    if (data.ok === true) {
      const offset = Number(data.calibration?.priceOffset ?? 6.5);
      const input = document.getElementById("calibrationOffsetInput");
      if (input) input.value = offset.toFixed(2);

      if (statusEl) statusEl.innerText = `Price Calibration: ✅ reset to ${signed(offset)}`;
      showToast("Reset Offset สำเร็จ", `กลับไปใช้ค่า default ${signed(offset)}`, "success");
      playTone("success");

      await loadSignal();
      await loadCalibrationInfo();
      return;
    }

    if (statusEl) statusEl.innerText = `Price Calibration: ❌ ${data.reason || "reset failed"}`;
    showToast("Reset Offset ไม่สำเร็จ", data.message || data.reason || "unknown", "danger");
    playTone("danger");

  } catch (err) {
    console.error("Reset calibration error:", err);
    if (statusEl) statusEl.innerText = "Price Calibration: ❌ connection error";
    showToast("Calibration reset error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

/* =========================
   ANIMATION / MODE
========================= */

function applyPriceAnimation(newPrice) {
  const priceEl = document.getElementById("price");
  if (!priceEl) return;

  priceEl.classList.remove("flash-up", "flash-down");

  if (previousPrice === null || !Number.isFinite(Number(newPrice))) {
    previousPrice = Number(newPrice);
    return;
  }

  const current = Number(newPrice);

  if (current > previousPrice) priceEl.classList.add("flash-up");
  else if (current < previousPrice) priceEl.classList.add("flash-down");

  setTimeout(() => {
    priceEl.classList.remove("flash-up", "flash-down");
  }, 450);

  previousPrice = current;
}

function applySignalAnimation(signal) {
  const el = document.getElementById("signal");
  if (!el) return;

  el.classList.remove("signal-buy", "signal-sell", "signal-wait", "signal-pop");

  if (signal === "BUY") el.classList.add("signal-buy");
  else if (signal === "SELL") el.classList.add("signal-sell");
  else el.classList.add("signal-wait");

  if (previousSignal !== null && previousSignal !== signal) {
    el.classList.add("signal-pop");
    showToast("Signal changed", `${previousSignal} → ${signal}`, "warning");

    if (signal === "BUY" || signal === "SELL") playTone("info");
    setTimeout(() => el.classList.remove("signal-pop"), 300);
  }

  previousSignal = signal;
}

function updateModeLabel() {
  const label = document.getElementById("modeLabel");
  const title = document.getElementById("modeInfoTitle");
  const text = document.getElementById("modeInfoText");

  if (currentMode === "fast") {
    if (label) label.innerText = "⚡ Scalping";
    if (title) title.innerText = "Scalping";
    if (text) text.innerText = "สัญญาณไวกว่า TP/SL สั้นกว่า เหมาะกับดูจังหวะเร็ว ความเสี่ยงสูงกว่า";
  } else if (currentMode === "safe") {
    if (label) label.innerText = "🧠 Swing";
    if (title) title.innerText = "Swing";
    if (text) text.innerText = "เข้มงวดกว่า รอสัญญาณชัด ออกสัญญาณน้อยกว่า เหมาะกับถือแผนนานขึ้น";
  } else {
    if (label) label.innerText = "🎯 Day Trade";
    if (title) title.innerText = "Day Trade";
    if (text) text.innerText = "โหมดสมดุล เหมาะกับการดูกราฟ 15 นาที ใช้กติกากลาง";
  }
}

function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const activeBtn = document.getElementById(`mode-${mode}`);
  if (activeBtn) activeBtn.classList.add("active");

  updateModeLabel();

  showToast(
    "เปลี่ยนโหมด",
    mode === "fast" ? "Scalping" : mode === "safe" ? "Swing" : "Day Trade",
    "warning"
  );

  loadSignal();
}

/* =========================
   MAIN RENDER
========================= */

function render(data) {
  const s = data.currentAnalysis || data.signal || {};
  const activePlan = data.activePlan || s.activePlan || null;
  const learning = data.learning || s.learningStats || {};

  latestData = data;
  latestAnalysis = s;

  updateCalibrationUiFromData(data);

  setText("price", data.price);
  setText("quickLivePrice", money(data.price));
  applyPriceAnimation(data.price);

  setText("signal", s.signal);
  applySignalAnimation(s.signal);

  setText("engine", s.engine || "-");
  setText("signalQuality", formatQuality(s.signalQuality));
  setText("aiScore", s.aiScore !== undefined ? `${s.aiScore}/100` : "-");
  setText("vipAllowed", formatYesNo(s.vipAllowed));
  setText("riskReward", s.riskReward ?? "-");
  setText("activePlanReason", formatPlanReason(s.activePlanReason));

  updateHomeCleanSummary(s);

  setText("trend", s.trend);
  setText("rsi", s.rsi);
  setText("support", s.support);
  setText("resistance", s.resistance);
  setText("buyScore", s.buyScore);
  setText("sellScore", s.sellScore);
  setText("fibZone", s.fibZone);
  setText("trap", s.trap);
  setText("customMomentumIndex", s.customMomentumIndex ?? "-");
  setText("nearestFvg", formatFvg(s.nearestFvg));

  setText("entry", s.entry);
  setText("sl", s.sl || "-");
  setText("tp1", s.tp1 || "-");
  setText("tp2", s.tp2 || "-");
  setText("tp3", s.tp3 || "-");

  setText("marketStatus", data.market === "open" ? "OPEN" : "CLOSED");

  const conf = Number(s.confidence || 0);
  const confText =
    conf >= 80 ? `${conf}% | Strong` :
    conf >= 70 ? `${conf}% | Medium` :
    conf > 0 ? `${conf}% | Weak` : "-";

  setText("confidence", confText);

  setText("signalTime", formatThaiDateTime(s.signalTime || data.updated));
  setText("validUntil", formatThaiDateTime(s.validUntil));
  setText("nextCheck", formatThaiDateTime(s.nextCheck || data.nextApiUpdate));
  setText("candleInterval", s.candleInterval || "15min");
  setText("signalSource", formatSource(s.source || data.source));
  setText("priceSource", formatSource(data.priceSource || data.source));
  setText("chartSource", formatSource(data.chartSource || data.source));
  setText("lastCandleTime", s.candleTime || "-");
  setText("nextApiUpdate", formatThaiDateTime(data.nextApiUpdate || s.nextCheck));

  const validNote = document.getElementById("validNote");
  if (validNote) {
    validNote.innerText =
      s.validNote ||
      "ระบบอัปเดตข้อมูลตามรอบ API และใช้ข้อมูลจริงจาก Binance Futures PAXGUSDT + Offset";
  }

  const chartSourceText = document.getElementById("chartSourceText");
  if (chartSourceText) {
    chartSourceText.innerText =
      data.dataNotice ||
      "กราฟนี้วาดจาก Binance Futures PAXGUSDT 15m candles + Offset";
  }

  const sourceNotice = document.getElementById("sourceNotice");
  if (sourceNotice) {
    sourceNotice.innerText =
      data.proxyNotice ||
      "TV-Calibrated Proxy — Binance Futures PAXGUSDT + Admin Offset";
  }

  latestChartData = Array.isArray(data.chartData) ? data.chartData : [];
  drawApiChart(latestChartData);

  renderActivePlan(activePlan);

  setText("memoryType", learning.memoryType || "-");
  setText("totalSignals", learning.totalSignals ?? 0);
  setText("pendingSignals", learning.pending ?? 0);
  setText("totalFinished", learning.totalFinished ?? 0);
  setText("wins", learning.wins ?? 0);
  setText("losses", learning.losses ?? 0);
  setText(
    "winRate",
    learning.winRate === null || learning.winRate === undefined ? "-" : `${learning.winRate}%`
  );

  const learningNote = document.getElementById("learningNote");
  if (learningNote) {
    learningNote.innerText =
      learning.note || "Learning จะเริ่มมีผลเมื่อมีข้อมูลย้อนหลังมากพอ";
  }

  renderList("reason", s.reason);
  renderList("filters", s.filters);

  updateManualAtpByPrice(Number(data.price));
  renderManualAtp();

  // ถ้า modal เปิดอยู่ ให้รีเฟรชกราฟ/ข้อมูลด้วย
  refreshOpenModalsIfNeeded();
}

function refreshOpenModalsIfNeeded() {
  if (document.getElementById("atpEditorModal")) {
    refreshEditorPreview();
  }

  if (document.getElementById("atpDetailModal")) {
    redrawOpenDetailChart();
  }
}

/* =========================
   AI ACTIVE PLAN RENDER
========================= */

function renderActivePlan(plan) {
  if (!plan) {
    setText("activeStatus", "NO ACTIVE PLAN");
    setText("activeSignal", "-");
    setText("activePlanStatus", "-");
    setText("activePlanSignal", "-");
    setText("activePlanQuality", "-");
    setText("activePlanAiScore", "-");
    setText("activePlanConfidence", "-");
    setText("activePlanRiskReward", "-");
    setText("activeEntry", "-");
    setText("activeSl", "-");
    setText("activeTp1", "-");
    setText("activeTp2", "-");
    setText("activeTp3", "-");
    setText("activeLastPrice", "-");
    setText("activeCreatedAt", "-");
    setText("activeExpiresAt", "-");
    setText("activeClosedAt", "-");
    setText("activeResult", "-");
    setText("activeHitType", "-");
    setText("activeHitPrice", "-");
    return;
  }

  setText("activeStatus", plan.status || "-");
  setText("activeSignal", plan.signal || "-");
  setText("activePlanStatus", plan.status || "-");
  setText("activePlanSignal", plan.signal || "-");
  setText("activePlanQuality", formatQuality(plan.signalQuality));
  setText("activePlanAiScore", plan.aiScore !== undefined ? `${plan.aiScore}/100` : "-");
  setText("activePlanConfidence", plan.confidence !== undefined ? `${plan.confidence}%` : "-");
  setText("activePlanRiskReward", plan.riskReward ?? "-");
  setText("activeEntry", plan.entry ?? "-");
  setText("activeSl", plan.sl ?? "-");
  setText("activeTp1", plan.tp1 ?? "-");
  setText("activeTp2", plan.tp2 ?? "-");
  setText("activeTp3", plan.tp3 ?? "-");
  setText("activeLastPrice", plan.lastPrice ?? "-");
  setText("activeCreatedAt", formatThaiDateTime(plan.createdAt));
  setText("activeExpiresAt", formatThaiDateTime(plan.expiresAt));
  setText("activeClosedAt", formatThaiDateTime(plan.closedAt));
  setText("activeResult", plan.result || "-");
  setText("activeHitType", plan.hitType || "-");
  setText("activeHitPrice", plan.hitPrice ?? "-");
}

/* =========================
   INDICATORS / CHART UTILS
========================= */

function toggleChartIndicator(name) {
  if (!Object.prototype.hasOwnProperty.call(chartIndicators, name)) return;
  chartIndicators[name] = !chartIndicators[name];
  syncIndicatorButtons();
  drawApiChart(latestChartData);
}

function syncIndicatorButtons() {
  const map = {
    toggleEma: chartIndicators.ema,
    toggleBollinger: chartIndicators.bollinger,
    toggleFvg: chartIndicators.fvg,
    toggleSr: chartIndicators.sr,
    toggleRsi: chartIndicators.rsi,
    toggleMacd: chartIndicators.macd
  };

  Object.entries(map).forEach(([id, active]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("active", active);
  });
}

function sma(values, period) {
  const out = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    out.push(sum / period);
  }

  return out;
}

function emaSeries(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = values[0];

  for (let i = 0; i < values.length; i++) {
    if (i === 0) prev = values[i];
    else prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }

  return out;
}

function rsiSeries(values, period = 14) {
  const out = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      out.push(null);
      continue;
    }

    let gains = 0;
    let losses = 0;

    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - values[j - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }

    if (gains === 0 && losses === 0) out.push(50);
    else if (losses === 0) out.push(70);
    else if (gains === 0) out.push(30);
    else {
      const rs = gains / losses;
      out.push(100 - (100 / (1 + rs)));
    }
  }

  return out;
}

function macdSeries(values) {
  const ema12 = emaSeries(values, 12);
  const ema26 = emaSeries(values, 26);
  const macd = values.map((_, i) => ema12[i] - ema26[i]);
  const signal = emaSeries(macd, 9);
  const hist = macd.map((v, i) => v - signal[i]);

  return { macd, signal, hist };
}

function bollingerSeries(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = [];
  const lower = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || mid[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }

    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);

    upper.push(mean + sd * mult);
    lower.push(mean - sd * mult);
  }

  return { mid, upper, lower };
}

function safePrice(value, basePrice, maxDistance = 180) {
  const n = Number(value);
  const b = Number(basePrice);

  if (!Number.isFinite(n) || !Number.isFinite(b)) return null;
  if (n <= 1000) return null;
  if (Math.abs(n - b) > maxDistance) return null;

  return n;
}

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];

  return candles
    .map(c => ({
      ...c,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0)
    }))
    .filter(c =>
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close) &&
      c.open > 1000 &&
      c.high > 1000 &&
      c.low > 1000 &&
      c.close > 1000 &&
      c.high >= c.low
    );
}

function drawSeriesLine(ctx, series, helper, strokeStyle, width = 1.5, dash = [], basePrice = null) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);

  let started = false;

  series.forEach((value, i) => {
    let n = Number(value);

    if (basePrice !== null) {
      const safe = safePrice(n, basePrice, 180);
      if (safe === null) return;
      n = safe;
    }

    if (!Number.isFinite(n)) return;

    const x = helper.xAt(i);
    const y = helper.yAt(n);

    if (!started) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  if (started) ctx.stroke();
  ctx.restore();
}

function getChartRange(candles, indicators = chartIndicators, plan = null) {
  const closes = candles.map(c => c.close);
  const lastPrice = closes.at(-1);

  let max = Math.max(...candles.map(c => c.high));
  let min = Math.min(...candles.map(c => c.low));

  const maxDistance = Math.max(80, lastPrice * 0.03);
  min = Math.max(min, lastPrice - maxDistance);
  max = Math.min(max, lastPrice + maxDistance);

  if (indicators.bollinger) {
    const bb = bollingerSeries(closes, 20, 2);
    bb.upper.forEach(v => {
      const safe = safePrice(v, lastPrice);
      if (safe !== null) max = Math.max(max, safe);
    });
    bb.lower.forEach(v => {
      const safe = safePrice(v, lastPrice);
      if (safe !== null) min = Math.min(min, safe);
    });
  }

  if (indicators.sr) {
    const support = safePrice(latestAnalysis?.support, lastPrice);
    const resistance = safePrice(latestAnalysis?.resistance, lastPrice);
    if (support !== null) min = Math.min(min, support);
    if (resistance !== null) max = Math.max(max, resistance);
  }

  if (indicators.fvg && latestAnalysis?.nearestFvg) {
    const top = safePrice(latestAnalysis.nearestFvg.top, lastPrice);
    const bottom = safePrice(latestAnalysis.nearestFvg.bottom, lastPrice);
    if (top !== null) max = Math.max(max, top);
    if (bottom !== null) min = Math.min(min, bottom);
  }

  if (plan && indicators.levels) {
    [plan.entry, plan.sl, plan.tp1, plan.tp2, plan.tp3].forEach(v => {
      const safe = safePrice(v, lastPrice);
      if (safe !== null) {
        min = Math.min(min, safe);
        max = Math.max(max, safe);
      }
    });
  }

  let range = Math.max(8, max - min);
  const pad = range * 0.12;
  min -= pad;
  max += pad;
  range = Math.max(8, max - min);

  return { min, max, range, lastPrice };
}

/* =========================
   MAIN CLEAN CHART
========================= */

function drawApiChart(rawCandles) {
  const canvas = document.getElementById("apiChartCanvas");
  if (!canvas) return;

  drawCleanChart({
    canvas,
    rawCandles,
    indicators: chartIndicators,
    plan: null,
    footer: "Clean Chart v36 | ATP levels hidden | Indicators ON/OFF",
    showLevels: false
  });
}

function drawCleanChart({
  canvas,
  rawCandles,
  indicators,
  plan = null,
  footer = "Gold AI Pro Chart",
  showLevels = false
}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#080a0d";
  ctx.fillRect(0, 0, w, h);

  const candles = normalizeCandles(rawCandles);

  if (!candles || candles.length < 5) {
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "20px sans-serif";
    ctx.fillText("No valid chart data", 30, 60);
    return;
  }

  const closes = candles.map(c => c.close);
  const { min, max, range, lastPrice } = getChartRange(candles, indicators, plan);

  const padLeft = 56;
  const padRight = 90;
  const padTop = 24;

  let padBottom = 42;
  if (indicators.rsi && indicators.macd) padBottom = 170;
  else if (indicators.rsi || indicators.macd) padBottom = 104;

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  function xAt(i) {
    return padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
  }

  function yAt(price) {
    return padTop + ((max - price) / range) * plotH;
  }

  const helper = { xAt, yAt, padLeft, padRight, padTop, padBottom, plotW, plotH, w, h };

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const y = padTop + (i / 4) * plotH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
  }

  for (let i = 0; i <= 6; i++) {
    const x = padLeft + (i / 6) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, h - padBottom);
    ctx.stroke();
  }

  if (indicators.fvg && latestAnalysis?.nearestFvg) {
    drawFvgZone(ctx, latestAnalysis.nearestFvg, helper, lastPrice);
  }

  if (indicators.sr) {
    drawSupportResistance(ctx, latestAnalysis?.support, latestAnalysis?.resistance, helper, lastPrice);
  }

  if (indicators.bollinger) {
    const bb = bollingerSeries(closes, 20, 2);
    drawSeriesLine(ctx, bb.upper, helper, "rgba(74, 163, 255, 0.55)", 1.25, [5, 5], lastPrice);
    drawSeriesLine(ctx, bb.mid, helper, "rgba(245, 197, 66, 0.48)", 1.1, [3, 5], lastPrice);
    drawSeriesLine(ctx, bb.lower, helper, "rgba(74, 163, 255, 0.55)", 1.25, [5, 5], lastPrice);
  }

  if (indicators.ema) {
    const ema9 = emaSeries(closes, 9);
    const ema21 = emaSeries(closes, 21);
    drawSeriesLine(ctx, ema9, helper, "rgba(255, 223, 126, 0.95)", 1.9, [], lastPrice);
    drawSeriesLine(ctx, ema21, helper, "rgba(255, 255, 255, 0.55)", 1.55, [], lastPrice);
  }

  const candleW = Math.max(3, Math.floor(plotW / candles.length * 0.55));

  candles.forEach((c, i) => {
    const x = xAt(i);
    const up = c.close >= c.open;
    const color = up ? "#00c853" : "#ff455e";

    const yHigh = yAt(c.high);
    const yLow = yAt(c.low);
    const yOpen = yAt(c.open);
    const yClose = yAt(c.close);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(2, Math.abs(yOpen - yClose));
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  });

  if (showLevels && plan && indicators.levels) {
    drawPlanLevels(ctx, plan, helper, lastPrice);
  }

  const yLast = yAt(lastPrice);

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(245,197,66,0.55)";
  ctx.beginPath();
  ctx.moveTo(padLeft, yLast);
  ctx.lineTo(w - padRight, yLast);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#f5c542";
  ctx.fillRect(w - padRight + 8, yLast - 13, 72, 26);
  ctx.fillStyle = "#111";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(String(lastPrice.toFixed(2)), w - padRight + 12, yLast + 5);

  ctx.fillStyle = "#cbd2df";
  ctx.font = "13px sans-serif";

  for (let i = 0; i <= 4; i++) {
    const price = max - (i / 4) * range;
    const y = padTop + (i / 4) * plotH;
    ctx.fillText(price.toFixed(2), w - padRight + 8, y + 4);
  }

  if (indicators.rsi) drawRsiPanel(ctx, candles, helper);
  if (indicators.macd) drawMacdPanel(ctx, candles, helper, indicators);

  ctx.fillStyle = "#9aa3b2";
  ctx.font = "13px sans-serif";
  ctx.fillText(footer, padLeft, h - 12);
}

function drawPlanLevels(ctx, plan, helper, basePrice) {
  const levels = [
    { label: "ENTRY", value: plan.entry, color: "rgba(245,197,66,0.9)" },
    { label: "SL", value: plan.sl, color: "rgba(255,69,94,0.9)" },
    { label: "TP1", value: plan.tp1, color: "rgba(0,200,83,0.95)" },
    { label: "TP2", value: plan.tp2, color: "rgba(0,200,83,0.75)" },
    { label: "TP3", value: plan.tp3, color: "rgba(0,200,83,0.6)" }
  ];

  ctx.save();

  levels.forEach(level => {
    const price = safePrice(level.value, basePrice);
    if (price === null) return;

    const y = helper.yAt(price);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = level.color;
    ctx.beginPath();
    ctx.moveTo(helper.padLeft, y);
    ctx.lineTo(helper.w - helper.padRight, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = level.color;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`${level.label} ${money(price)}`, helper.padLeft + 8, y - 6);
  });

  ctx.restore();
}

function drawSupportResistance(ctx, supportRaw, resistanceRaw, helper, basePrice) {
  const support = safePrice(supportRaw, basePrice);
  const resistance = safePrice(resistanceRaw, basePrice);

  ctx.save();

  if (support !== null) {
    const y = helper.yAt(support);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "rgba(0,200,83,0.55)";
    ctx.beginPath();
    ctx.moveTo(helper.padLeft, y);
    ctx.lineTo(helper.w - helper.padRight, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(0,200,83,0.95)";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`Support ${money(support)}`, helper.padLeft + 8, y - 6);
  }

  if (resistance !== null) {
    const y = helper.yAt(resistance);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "rgba(255,69,94,0.55)";
    ctx.beginPath();
    ctx.moveTo(helper.padLeft, y);
    ctx.lineTo(helper.w - helper.padRight, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,69,94,0.95)";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`Resistance ${money(resistance)}`, helper.padLeft + 8, y - 6);
  }

  ctx.restore();
}

function drawFvgZone(ctx, fvg, helper, basePrice) {
  const top = safePrice(fvg.top, basePrice);
  const bottom = safePrice(fvg.bottom, basePrice);

  if (top === null || bottom === null) return;

  const yTop = helper.yAt(top);
  const yBottom = helper.yAt(bottom);
  const h = Math.max(4, Math.abs(yBottom - yTop));
  const y = Math.min(yTop, yBottom);
  const bullish = fvg.type === "bullish";

  ctx.save();

  ctx.fillStyle = bullish ? "rgba(0,200,83,0.12)" : "rgba(255,69,94,0.12)";
  ctx.strokeStyle = bullish ? "rgba(0,200,83,0.38)" : "rgba(255,69,94,0.38)";
  ctx.setLineDash([5, 5]);

  ctx.fillRect(helper.padLeft, y, helper.plotW, h);
  ctx.strokeRect(helper.padLeft, y, helper.plotW, h);

  ctx.setLineDash([]);
  ctx.fillStyle = bullish ? "rgba(0,200,83,0.95)" : "rgba(255,69,94,0.95)";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText(`${bullish ? "Bullish" : "Bearish"} FVG ${bottom}-${top}`, helper.padLeft + 8, y - 6);

  ctx.restore();
}

function drawRsiPanel(ctx, candles, helper) {
  const closes = candles.map(c => Number(c.close));
  const values = rsiSeries(closes, 14);

  const panelH = 54;
  const top = helper.h - helper.padBottom + 12;

  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(helper.padLeft, top, helper.plotW, panelH);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.strokeRect(helper.padLeft, top, helper.plotW, panelH);

  function yRsi(v) {
    return top + ((100 - v) / 100) * panelH;
  }

  [30, 50, 70].forEach(level => {
    const y = yRsi(level);
    ctx.setLineDash(level === 50 ? [2, 4] : [4, 5]);
    ctx.strokeStyle = level === 50 ? "rgba(255,255,255,.16)" : "rgba(245,197,66,.22)";
    ctx.beginPath();
    ctx.moveTo(helper.padLeft, y);
    ctx.lineTo(helper.w - helper.padRight, y);
    ctx.stroke();

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "10px sans-serif";
    ctx.fillText(String(level), helper.w - helper.padRight + 8, y + 3);
  });

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(245,197,66,.95)";
  ctx.lineWidth = 1.4;

  let started = false;

  values.forEach((v, i) => {
    if (!Number.isFinite(Number(v))) return;
    const x = helper.xAt(i);
    const y = yRsi(Number(v));

    if (!started) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  if (started) ctx.stroke();

  ctx.fillStyle = "#cbd2df";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("RSI", helper.padLeft + 8, top + 14);

  ctx.restore();
}

function drawMacdPanel(ctx, candles, helper, indicators) {
  const closes = candles.map(c => Number(c.close));
  const m = macdSeries(closes);

  const panelH = 54;
  const top = indicators.rsi
    ? helper.h - helper.padBottom + 78
    : helper.h - helper.padBottom + 12;

  const all = [...m.macd, ...m.signal, ...m.hist].filter(v => Number.isFinite(Number(v)));
  const maxAbs = Math.max(0.01, ...all.map(v => Math.abs(v)));
  const zeroY = top + panelH / 2;

  ctx.save();

  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(helper.padLeft, top, helper.plotW, panelH);

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.strokeRect(helper.padLeft, top, helper.plotW, panelH);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(helper.padLeft, zeroY);
  ctx.lineTo(helper.w - helper.padRight, zeroY);
  ctx.stroke();

  function yMacd(v) {
    return zeroY - (v / maxAbs) * (panelH * 0.42);
  }

  m.hist.forEach((v, i) => {
    if (!Number.isFinite(Number(v))) return;
    const x = helper.xAt(i);
    const y = yMacd(v);
    const up = v >= 0;

    ctx.fillStyle = up ? "rgba(0,200,83,.55)" : "rgba(255,69,94,.55)";
    ctx.fillRect(x - 2, Math.min(y, zeroY), 4, Math.max(1, Math.abs(y - zeroY)));
  });

  const macdHelper = { ...helper, yAt: yMacd };

  drawSeriesLine(ctx, m.macd, macdHelper, "rgba(245,197,66,.92)", 1.2);
  drawSeriesLine(ctx, m.signal, macdHelper, "rgba(74,163,255,.85)", 1.2);

  ctx.fillStyle = "#cbd2df";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("MACD", helper.padLeft + 8, top + 14);

  ctx.restore();
}

/* =========================
   THAI GOLD
========================= */

async function loadThaiGold() {
  try {
    const res = await fetch(`${API_URL}/thai-gold?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();
    const g = data.thaiGold || {};

    setText("thai_buy", g.barBuy || "-");
    setText("thai_sell", g.barSell || "-");
    setText("thai_buy_jewelry", g.jewelryBuy || "-");
    setText("thai_sell_jewelry", g.jewelrySell || "-");

  } catch (e) {
    console.log("Thai gold error:", e);
    setText("thai_buy", "-");
    setText("thai_sell", "-");
    setText("thai_buy_jewelry", "-");
    setText("thai_sell_jewelry", "-");
  }
}

/* =========================
   ATP EDITOR FLOW
========================= */

function quickCreateAtp(side) {
  const price = getCurrentPrice();

  if (!Number.isFinite(price)) {
    showToast("ยังไม่มีราคา", "รอให้ระบบโหลดราคาก่อน", "warning");
    return;
  }

  builderSide = side === "SELL" ? "SELL" : "BUY";

  const plan = buildSuggestedPlan(builderSide, currentMode, "current");
  openAtpEditorModal(plan);
}

function buildSuggestedPlan(side, mode = currentMode, entryStyle = "current") {
  const price = getCurrentPrice() || 0;
  const risk = getBuilderRiskByMode(mode);
  const support = Number(latestAnalysis?.support);
  const resistance = Number(latestAnalysis?.resistance);
  const nearestFvg = latestAnalysis?.nearestFvg || null;

  let entry = price;

  if (entryStyle === "support_resistance") {
    if (side === "BUY" && Number.isFinite(support)) entry = Math.max(support + 1, price - risk * 0.35);
    if (side === "SELL" && Number.isFinite(resistance)) entry = Math.min(resistance - 1, price + risk * 0.35);
  }

  if (entryStyle === "fvg" && nearestFvg && Number.isFinite(Number(nearestFvg.midpoint))) {
    entry = Number(nearestFvg.midpoint);
  }

  if (entryStyle === "hybrid") {
    if (nearestFvg && Number.isFinite(Number(nearestFvg.midpoint))) {
      entry = Number(nearestFvg.midpoint);
    } else if (side === "BUY" && Number.isFinite(support)) {
      entry = Math.max(support + 1, price - risk * 0.35);
    } else if (side === "SELL" && Number.isFinite(resistance)) {
      entry = Math.min(resistance - 1, price + risk * 0.35);
    }
  }

  let sl, tp1, tp2, tp3;

  if (side === "BUY") {
    sl = entry - risk;
    tp1 = entry + risk;
    tp2 = entry + risk * 2;
    tp3 = entry + risk * 3;
  } else {
    sl = entry + risk;
    tp1 = entry - risk;
    tp2 = entry - risk * 2;
    tp3 = entry - risk * 3;
  }

  return {
    side,
    mode,
    entryStyle,
    entry: round2(entry),
    sl: round2(sl),
    tp1: round2(tp1),
    tp2: round2(tp2),
    tp3: round2(tp3),
    expireHours: 24,
    note: "",
    indicators: { ...editorIndicatorState }
  };
}

function getBuilderRiskByMode(mode) {
  if (mode === "fast") return 6;
  if (mode === "safe") return 12;
  return 8;
}

function openAtpEditorModal(plan) {
  closeAtpEditorModal();

  editorIndicatorState = { ...editorIndicatorState, ...(plan.indicators || {}) };

  const modal = document.createElement("div");
  modal.id = "atpEditorModal";
  modal.className = "atp-modal-backdrop-v36";

  modal.innerHTML = `
    <div class="atp-modal-v36">
      <div class="atp-modal-head-v36">
        <div>
          <div class="atp-modal-title-v36">
            <span class="atp-badge ${plan.side === "BUY" ? "buy" : "sell"}">${plan.side}</span>
            <h2>ATP Editor</h2>
          </div>
          <p>เลือก BUY / SELL แล้ว ปรับแผนเองก่อนกด Lock Plan</p>
        </div>
        <button class="atp-modal-close-v36" type="button" onclick="closeAtpEditorModal()">ปิด</button>
      </div>

      <div class="atp-chart-panel-v36">
        <canvas id="atpEditorChart" width="1280" height="480"></canvas>
      </div>

      <div class="atp-indicator-row-v36" id="editorIndicatorRow">
        ${renderIndicatorButtonsHtml("editor")}
      </div>

      <div class="atp-form-grid-v36 atp-form-grid-top">
        <label>
          <span>Side</span>
          <select id="editorSide" onchange="recalculateEditorFromInputs()">
            <option value="BUY" ${plan.side === "BUY" ? "selected" : ""}>BUY</option>
            <option value="SELL" ${plan.side === "SELL" ? "selected" : ""}>SELL</option>
          </select>
        </label>

        <label>
          <span>Mode</span>
          <select id="editorMode" onchange="recalculateEditorFromInputs()">
            <option value="fast" ${plan.mode === "fast" ? "selected" : ""}>Scalping</option>
            <option value="balanced" ${plan.mode === "balanced" ? "selected" : ""}>Day Trade</option>
            <option value="safe" ${plan.mode === "safe" ? "selected" : ""}>Swing</option>
          </select>
        </label>

        <label>
          <span>Entry Style</span>
          <select id="editorEntryStyle" onchange="recalculateEditorFromInputs()">
            <option value="current" ${plan.entryStyle === "current" ? "selected" : ""}>Current Price</option>
            <option value="support_resistance" ${plan.entryStyle === "support_resistance" ? "selected" : ""}>Support / Resistance</option>
            <option value="fvg" ${plan.entryStyle === "fvg" ? "selected" : ""}>Nearest FVG</option>
            <option value="hybrid" ${plan.entryStyle === "hybrid" ? "selected" : ""}>Hybrid</option>
          </select>
        </label>

        <label>
          <span>Expire</span>
          <select id="editorExpireHours">
            <option value="4">4 Hours</option>
            <option value="8">8 Hours</option>
            <option value="24" selected>24 Hours</option>
            <option value="48">48 Hours</option>
          </select>
        </label>
      </div>

      <div class="atp-form-grid-v36 atp-form-grid-levels">
        <label><span>Entry</span><input id="editorEntry" type="number" step="0.01" value="${money(plan.entry)}" oninput="refreshEditorPreview()" /></label>
        <label><span>SL</span><input id="editorSl" type="number" step="0.01" value="${money(plan.sl)}" oninput="refreshEditorPreview()" /></label>
        <label><span>TP1</span><input id="editorTp1" type="number" step="0.01" value="${money(plan.tp1)}" oninput="refreshEditorPreview()" /></label>
        <label><span>TP2</span><input id="editorTp2" type="number" step="0.01" value="${money(plan.tp2)}" oninput="refreshEditorPreview()" /></label>
        <label><span>TP3</span><input id="editorTp3" type="number" step="0.01" value="${money(plan.tp3)}" oninput="refreshEditorPreview()" /></label>
      </div>

      <label class="atp-note-label-v36">
        <span>Note</span>
        <input id="editorNote" type="text" placeholder="บันทึกเหตุผลหรือราคาปัจจุบัน" value="${escapeHtml(plan.note || "")}" />
      </label>

      <div class="atp-score-grid-v36">
        <div class="atp-stat-card-v36"><span>Plan Score</span><b id="editorPlanScore">-</b></div>
        <div class="atp-stat-card-v36"><span>Quality</span><b id="editorPlanQuality">-</b></div>
        <div class="atp-stat-card-v36"><span>RR TP1</span><b id="editorRr1">-</b></div>
        <div class="atp-stat-card-v36"><span>RR TP3</span><b id="editorRr3">-</b></div>
      </div>

      <div class="atp-insight-grid-v36">
        <div class="atp-insight-card-v36">
          <h3>บทเรียน</h3>
          <div id="editorLessonList">${renderBulletListHtml([], "กำลังวิเคราะห์...")}</div>
        </div>

        <div class="atp-insight-card-v36">
          <h3>ข้อเสนอแนะ</h3>
          <div id="editorAdviceList">${renderBulletListHtml([], "กำลังวิเคราะห์...")}</div>
        </div>
      </div>

      <div class="atp-detail-actions-v36">
        <button class="btn-main ghost" type="button" onclick="recalculateEditorFromInputs()">คำนวณใหม่</button>
        <button class="btn-main" type="button" onclick="lockEditorPlan()">🔒 Lock Plan</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  refreshEditorPreview();
}

function closeAtpEditorModal() {
  const old = document.getElementById("atpEditorModal");
  if (old) old.remove();
}

function renderIndicatorButtonsHtml(scope) {
  const state = scope === "detail" ? detailIndicatorState : editorIndicatorState;
  const list = [
    ["ema", "EMA"],
    ["rsi", "RSI"],
    ["macd", "MACD"],
    ["bollinger", "Bollinger"],
    ["fvg", "FVG"],
    ["sr", "S/R"],
    ["fib", "FIB"],
    ["atr", "ATR"]
  ];

  if (scope === "detail") list.unshift(["levels", "Entry/SL/TP"]);

  return list.map(([key, label]) => `
    <button
      id="${scope}Ind_${key}"
      class="indicator-toggle ${state[key] ? "active" : ""}"
      type="button"
      onclick="toggleModalIndicator('${scope}', '${key}')"
    >
      ${label}
    </button>
  `).join("");
}

function toggleModalIndicator(scope, key) {
  if (scope === "detail") {
    detailIndicatorState[key] = !detailIndicatorState[key];
    const btn = document.getElementById(`detailInd_${key}`);
    if (btn) btn.classList.toggle("active", detailIndicatorState[key]);
    redrawOpenDetailChart();
    return;
  }

  editorIndicatorState[key] = !editorIndicatorState[key];
  const btn = document.getElementById(`editorInd_${key}`);
  if (btn) btn.classList.toggle("active", editorIndicatorState[key]);
  refreshEditorPreview();
}

function getEditorPlanFromInputs() {
  return {
    side: getSettingValue("editorSide", "BUY"),
    mode: getSettingValue("editorMode", currentMode),
    entryStyle: getSettingValue("editorEntryStyle", "current"),
    expireHours: getNumberValue("editorExpireHours", 24),
    entry: getNumberValue("editorEntry", NaN),
    sl: getNumberValue("editorSl", NaN),
    tp1: getNumberValue("editorTp1", NaN),
    tp2: getNumberValue("editorTp2", NaN),
    tp3: getNumberValue("editorTp3", NaN),
    note: getSettingValue("editorNote", ""),
    indicators: { ...editorIndicatorState, levels: true }
  };
}

function setEditorPlanToInputs(plan) {
  const side = document.getElementById("editorSide");
  const mode = document.getElementById("editorMode");
  const entryStyle = document.getElementById("editorEntryStyle");

  if (side) side.value = plan.side;
  if (mode) mode.value = plan.mode;
  if (entryStyle) entryStyle.value = plan.entryStyle;

  setInputValue("editorEntry", money(plan.entry));
  setInputValue("editorSl", money(plan.sl));
  setInputValue("editorTp1", money(plan.tp1));
  setInputValue("editorTp2", money(plan.tp2));
  setInputValue("editorTp3", money(plan.tp3));
}

function recalculateEditorFromInputs() {
  const side = getSettingValue("editorSide", "BUY");
  const mode = getSettingValue("editorMode", currentMode);
  const entryStyle = getSettingValue("editorEntryStyle", "current");
  const plan = buildSuggestedPlan(side, mode, entryStyle);
  setEditorPlanToInputs(plan);
  refreshEditorPreview();
}

function refreshEditorPreview() {
  const canvas = document.getElementById("atpEditorChart");
  if (!canvas) return;

  const plan = getEditorPlanFromInputs();

  drawCleanChart({
    canvas,
    rawCandles: latestChartData,
    indicators: { ...editorIndicatorState, levels: true },
    plan,
    footer: "ATP Editor Preview | Entry / SL / TP visible here only",
    showLevels: true
  });

  analyzeEditorPlan(plan);
}

function analyzeEditorPlan(plan) {
  const entry = Number(plan.entry);
  const sl = Number(plan.sl);
  const tp1 = Number(plan.tp1);
  const tp3 = Number(plan.tp3);

  if (![entry, sl, tp1, tp3].every(Number.isFinite)) {
    setText("editorPlanScore", "-");
    setText("editorPlanQuality", "-");
    setText("editorRr1", "-");
    setText("editorRr3", "-");
    setHtml("editorLessonList", renderBulletListHtml([], "ข้อมูลไม่พอ"));
    setHtml("editorAdviceList", renderBulletListHtml([], "ข้อมูลไม่พอ"));
    return;
  }

  const risk = Math.abs(entry - sl);
  const rr1 = risk > 0 ? Math.abs(tp1 - entry) / risk : 0;
  const rr3 = risk > 0 ? Math.abs(tp3 - entry) / risk : 0;

  let score = 50;
  const lessons = [];
  const advices = [];

  if (rr1 >= 0.8) {
    score += 10;
    lessons.push(`Risk/Reward ไป TP1 อยู่ในระดับใช้ได้ (${round2(rr1)})`);
  } else {
    score -= 10;
    advices.push(`Risk/Reward ไป TP1 ยังต่ำ (${round2(rr1)}) ควรปรับ Entry / SL / TP`);
  }

  if (editorIndicatorState.ema && latestAnalysis?.trend) {
    if (plan.side === "BUY" && latestAnalysis.trend === "UPTREND") {
      score += 12;
      lessons.push("EMA / Trend สนับสนุนฝั่ง BUY");
    } else if (plan.side === "SELL" && latestAnalysis.trend === "DOWNTREND") {
      score += 12;
      lessons.push("EMA / Trend สนับสนุนฝั่ง SELL");
    } else {
      score -= 8;
      advices.push("แผนนี้สวนแนวโน้มหลัก ควรระวัง");
    }
  }

  if (editorIndicatorState.rsi) {
    const r = Number(latestAnalysis?.rsi);

    if (Number.isFinite(r) && r > 35 && r < 65) {
      score += 6;
      lessons.push(`RSI อยู่โซนกลาง (${round2(r)}) ยังไม่สุดโต่ง`);
    }

    if (Number.isFinite(r) && r >= 70 && plan.side === "BUY") {
      score -= 8;
      advices.push(`RSI สูง (${round2(r)}) ระวังไล่ BUY`);
    }

    if (Number.isFinite(r) && r <= 30 && plan.side === "SELL") {
      score -= 8;
      advices.push(`RSI ต่ำ (${round2(r)}) ระวังไล่ SELL`);
    }
  }

  if (editorIndicatorState.fvg && latestAnalysis?.nearestFvg) {
    const fvg = latestAnalysis.nearestFvg;

    if ((plan.side === "BUY" && fvg.type === "bullish") || (plan.side === "SELL" && fvg.type === "bearish")) {
      score += 8;
      lessons.push(`พบ ${fvg.type === "bullish" ? "Bullish" : "Bearish"} FVG สนับสนุนแผน`);
    } else {
      advices.push("FVG ใกล้ราคายังไม่สนับสนุนแผนนี้เต็มที่");
    }
  }

  if (editorIndicatorState.sr) {
    const support = Number(latestAnalysis?.support);
    const resistance = Number(latestAnalysis?.resistance);

    if (plan.side === "BUY" && Number.isFinite(resistance) && Math.abs(plan.entry - resistance) < 4) {
      score -= 8;
      advices.push("BUY ใกล้แนวต้านเกินไป");
    } else if (plan.side === "SELL" && Number.isFinite(support) && Math.abs(plan.entry - support) < 4) {
      score -= 8;
      advices.push("SELL ใกล้แนวรับเกินไป");
    } else {
      lessons.push("ตำแหน่งราคาเทียบ Support / Resistance ยังพอใช้");
      score += 5;
    }
  }

  if (editorIndicatorState.atr) {
    lessons.push("เปิด ATR ไว้ช่วยดูระยะ SL / TP ได้ดีขึ้น");
    score += 5;
  }

  if (latestAnalysis?.reason?.length) {
    lessons.push(...latestAnalysis.reason.slice(0, 3));
  }

  if (latestAnalysis?.filters?.length) {
    advices.push(...latestAnalysis.filters.slice(0, 4));
  }

  if (!advices.length) {
    advices.push("แผนนี้ยังดูสมดุล แต่ควรตรวจ Entry / SL / TP อีกครั้งก่อนล็อก");
  }

  if (!lessons.length) {
    lessons.push("ใช้ข้อมูลราคา + indicator ปัจจุบันประกอบการวางแผน");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const quality =
    score >= 78 ? "A | Strong" :
    score >= 62 ? "B | Medium" :
    "C | Weak";

  setText("editorPlanScore", `${score}/100`);
  setText("editorPlanQuality", quality);
  setText("editorRr1", round2(rr1));
  setText("editorRr3", round2(rr3));

  setHtml("editorLessonList", renderBulletListHtml(lessons.slice(0, 6), "ไม่มี"));
  setHtml("editorAdviceList", renderBulletListHtml(advices.slice(0, 6), "ไม่มี"));
}

function lockEditorPlan() {
  if (manualAtpPlans.length >= MAX_MANUAL_ATP) {
    showToast("My ATP เต็มแล้ว", `จำกัด ${MAX_MANUAL_ATP} แผน กรุณาลบแผนเก่าก่อน`, "warning");
    return;
  }

  const p = getEditorPlanFromInputs();

  if (![p.entry, p.sl, p.tp1, p.tp2, p.tp3].every(Number.isFinite)) {
    showToast("แผนไม่ครบ", "กรุณากรอก Entry / SL / TP ให้ครบ", "danger");
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(p.expireHours || 24) * 60 * 60 * 1000);

  const plan = {
    id: `myatp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    side: p.side,
    mode: p.mode,
    entryStyle: p.entryStyle,
    entry: round2(p.entry),
    sl: round2(p.sl),
    tp1: round2(p.tp1),
    tp2: round2(p.tp2),
    tp3: round2(p.tp3),
    note: p.note,
    status: "WAITING_ENTRY",
    result: "pending",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatedAt: now.toISOString(),
    progress: {
      entry: false,
      tp1: false,
      tp2: false,
      tp3: false,
      sl: false
    },
    indicators: {
      ema: !!editorIndicatorState.ema,
      rsi: !!editorIndicatorState.rsi,
      macd: !!editorIndicatorState.macd,
      bollinger: !!editorIndicatorState.bollinger,
      sr: !!editorIndicatorState.sr,
      fib: !!editorIndicatorState.fib,
      fvg: !!editorIndicatorState.fvg,
      atr: !!editorIndicatorState.atr
    },
    snapshot: {
      price: latestData?.price ?? null,
      trend: latestAnalysis?.trend ?? null,
      rsi: latestAnalysis?.rsi ?? null,
      support: latestAnalysis?.support ?? null,
      resistance: latestAnalysis?.resistance ?? null,
      fibZone: latestAnalysis?.fibZone ?? null,
      nearestFvg: latestAnalysis?.nearestFvg ?? null,
      aiScore: latestAnalysis?.aiScore ?? null,
      confidence: latestAnalysis?.confidence ?? null,
      reason: latestAnalysis?.reason || [],
      filters: latestAnalysis?.filters || []
    }
  };

  manualAtpPlans.unshift(plan);
  saveManualAtp();
  renderManualAtp();
  closeAtpEditorModal();

  const section = document.getElementById("section-my-atp");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });

  showToast("Lock Plan สำเร็จ", `${plan.side} Entry ${money(plan.entry)} เข้า My ATP แล้ว`, "success");
  playTone("success");
}

/* =========================
   OLD BUILDER SUPPORT
========================= */

function setBuilderSide(side) {
  builderSide = side === "SELL" ? "SELL" : "BUY";

  const buy = document.getElementById("builderSideBuy");
  const sell = document.getElementById("builderSideSell");

  if (buy) buy.classList.toggle("active", builderSide === "BUY");
  if (sell) sell.classList.toggle("active", builderSide === "SELL");

  generateSuggestedPlan();
}

function generateSuggestedPlan(showNotice = true) {
  const plan = buildSuggestedPlan(
    builderSide,
    getSettingValue("builderMode", currentMode || "balanced"),
    getSettingValue("builderEntryStyle", "current")
  );

  setInputValue("builderEntry", money(plan.entry));
  setInputValue("builderSl", money(plan.sl));
  setInputValue("builderTp1", money(plan.tp1));
  setInputValue("builderTp2", money(plan.tp2));
  setInputValue("builderTp3", money(plan.tp3));

  analyzeBuilderPlan();

  if (showNotice) showToast("คำนวณแผนใหม่แล้ว", `${builderSide} | ${plan.mode}`, "success");
}

function analyzeBuilderPlan() {
  const entry = getNumberValue("builderEntry", NaN);
  const sl = getNumberValue("builderSl", NaN);
  const tp1 = getNumberValue("builderTp1", NaN);
  const tp3 = getNumberValue("builderTp3", NaN);

  if (![entry, sl, tp1, tp3].every(Number.isFinite)) return;

  const risk = Math.abs(entry - sl);
  const reward1 = Math.abs(tp1 - entry);
  const reward3 = Math.abs(tp3 - entry);

  const rr1 = risk > 0 ? reward1 / risk : 0;
  const rr3 = risk > 0 ? reward3 / risk : 0;

  const score = Math.max(0, Math.min(100, Math.round(50 + rr1 * 15)));

  const quality =
    score >= 78 ? "A | Strong" :
    score >= 62 ? "B | Medium" :
    "C | Weak";

  setText("planScore", `${score}/100`);
  setText("planQuality", quality);
  setText("planRr1", round2(rr1));
  setText("planRr3", round2(rr3));

  renderList("builderReasons", ["ระบบคำนวณแผนจากราคาปัจจุบัน"]);
  renderList("builderCautions", ["ตรวจสอบ Entry / SL / TP ก่อนล็อกแผน"]);
}

function addManualAtp() {
  openAtpEditorModal(buildSuggestedPlan(builderSide, currentMode, "current"));
}

/* =========================
   MANUAL ATP
========================= */

function loadManualAtp() {
  try {
    const raw = localStorage.getItem(MANUAL_ATP_KEY);
    manualAtpPlans = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(manualAtpPlans)) manualAtpPlans = [];
  } catch (e) {
    manualAtpPlans = [];
  }
}

function saveManualAtp() {
  localStorage.setItem(MANUAL_ATP_KEY, JSON.stringify(manualAtpPlans.slice(-MAX_MANUAL_ATP)));
}

function updateManualAtpByPrice(price) {
  if (!Number.isFinite(price) || !manualAtpPlans.length) return;

  const now = new Date();

  manualAtpPlans = manualAtpPlans.map(plan => {
    if (!["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(plan.status)) return plan;

    let status = plan.status;
    let result = plan.result || "pending";
    const progress = { ...(plan.progress || {}) };

    if (plan.expiresAt && now.getTime() > new Date(plan.expiresAt).getTime()) {
      return {
        ...plan,
        status: "EXPIRED",
        result: "expired",
        updatedAt: now.toISOString(),
        closedAt: now.toISOString(),
        lastPrice: round2(price)
      };
    }

    if (plan.side === "BUY") {
      if (!progress.entry && price <= plan.entry) {
        progress.entry = true;
        status = "ACTIVE";
      }

      if (progress.entry && price <= plan.sl) {
        progress.sl = true;
        status = "SL_HIT";
        result = "loss_sl";
      }

      if (progress.entry && price >= plan.tp1 && !progress.tp1) {
        progress.tp1 = true;
        status = "TP1_HIT";
        result = "partial_tp1";
      }

      if (progress.tp1 && price >= plan.tp2 && !progress.tp2) {
        progress.tp2 = true;
        status = "TP2_HIT";
        result = "partial_tp2";
      }

      if (progress.tp2 && price >= plan.tp3 && !progress.tp3) {
        progress.tp3 = true;
        status = "TP3_HIT";
        result = "win_tp3";
      }
    }

    if (plan.side === "SELL") {
      if (!progress.entry && price >= plan.entry) {
        progress.entry = true;
        status = "ACTIVE";
      }

      if (progress.entry && price >= plan.sl) {
        progress.sl = true;
        status = "SL_HIT";
        result = "loss_sl";
      }

      if (progress.entry && price <= plan.tp1 && !progress.tp1) {
        progress.tp1 = true;
        status = "TP1_HIT";
        result = "partial_tp1";
      }

      if (progress.tp1 && price <= plan.tp2 && !progress.tp2) {
        progress.tp2 = true;
        status = "TP2_HIT";
        result = "partial_tp2";
      }

      if (progress.tp2 && price <= plan.tp3 && !progress.tp3) {
        progress.tp3 = true;
        status = "TP3_HIT";
        result = "win_tp3";
      }
    }

    const closed = ["SL_HIT", "TP3_HIT", "EXPIRED"].includes(status);

    return {
      ...plan,
      status,
      result,
      progress,
      updatedAt: now.toISOString(),
      closedAt: closed ? (plan.closedAt || now.toISOString()) : plan.closedAt,
      lastPrice: round2(price)
    };
  });

  saveManualAtp();
}

function getAtpBadgeClass(plan) {
  if (plan.status === "WAITING_ENTRY") return "waiting";
  if (["ACTIVE", "TP1_HIT", "TP2_HIT"].includes(plan.status)) return "active";
  return "closed";
}

function renderManualAtp() {
  const list = document.getElementById("manualAtpList");
  if (!list) return;

  const total = manualAtpPlans.length;
  const active = manualAtpPlans.filter(p => ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)).length;
  const wins = manualAtpPlans.filter(p => String(p.result).startsWith("win")).length;
  const losses = manualAtpPlans.filter(p => String(p.result).startsWith("loss")).length;
  const partial = manualAtpPlans.filter(p => String(p.result).startsWith("partial")).length;
  const finished = wins + losses + partial;
  const winRate = finished > 0 ? Math.round(((wins + partial) / finished) * 100) : null;

  setText("manualTotalPlans", total);
  setText("manualActivePlans", active);
  setText("manualWins", wins);
  setText("manualLosses", losses);
  setText("manualPartial", partial);
  setText("manualWinRate", winRate === null ? "-" : `${winRate}%`);
  setText("myAtpCountBadge", `${total}/${MAX_MANUAL_ATP}`);
  setText("myAtpLimitText", `${total}/${MAX_MANUAL_ATP}`);

  if (!manualAtpPlans.length) {
    list.innerHTML = `<div class="note">ยังไม่มี My ATP</div>`;
    return;
  }

  list.innerHTML = `<div class="atp-v2-list"></div>`;
  const wrap = list.querySelector(".atp-v2-list");

  manualAtpPlans.forEach(plan => {
    const card = document.createElement("div");
    card.className = `atp-v2-card ${["ACTIVE", "TP1_HIT", "TP2_HIT"].includes(plan.status) ? "is-active" : ""}`;

    const indicators = Object.entries(plan.indicators || {})
      .filter(([, enabled]) => enabled)
      .map(([name]) => name.toUpperCase());

    card.innerHTML = `
      <div class="atp-v2-head">
        <div>
          <div class="atp-v2-title">
            <span class="atp-badge ${plan.side === "BUY" ? "buy" : "sell"}">${escapeHtml(plan.side)}</span>
            <span class="atp-badge ${getAtpBadgeClass(plan)}">${escapeHtml(plan.status)}</span>
            <h3>${escapeHtml(plan.mode || "-")}</h3>
          </div>
          <div class="atp-v2-meta">
            Created: ${escapeHtml(formatThaiDateTime(plan.createdAt))} | Expires: ${escapeHtml(formatThaiDateTime(plan.expiresAt))}
          </div>
        </div>

        <div class="atp-v2-actions">
          <button class="atp-icon-btn" type="button" onclick="openAtpDetailModalById('${plan.id}')">ดู</button>
          <button class="atp-icon-btn delete" type="button" onclick="deleteManualAtp('${plan.id}')">ลบ</button>
        </div>
      </div>

      <div class="atp-mini-chart-box">
        <canvas class="atp-mini-chart" width="1000" height="185" data-atp-mini="${plan.id}"></canvas>
      </div>

      <div class="atp-level-grid">
        <div><span>Entry</span><b>${money(plan.entry)}</b></div>
        <div><span>SL</span><b>${money(plan.sl)}</b></div>
        <div><span>TP1</span><b>${money(plan.tp1)}</b></div>
        <div><span>TP2</span><b>${money(plan.tp2)}</b></div>
        <div><span>TP3</span><b>${money(plan.tp3)}</b></div>
      </div>

      <div class="atp-progress-row">
        <span class="atp-progress-chip ${plan.progress?.entry ? "hit" : ""}">Entry ${plan.progress?.entry ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp1 ? "hit" : ""}">TP1 ${plan.progress?.tp1 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp2 ? "hit" : ""}">TP2 ${plan.progress?.tp2 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp3 ? "hit" : ""}">TP3 ${plan.progress?.tp3 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.sl ? "danger" : ""}">SL ${plan.progress?.sl ? "✓" : "-"}</span>
      </div>

      <div class="atp-chip-row">
        ${indicators.length ? indicators.map(x => `<span class="atp-ind-chip">${escapeHtml(x)}</span>`).join("") : `<span class="atp-ind-chip">NO INDICATOR</span>`}
      </div>

      ${plan.note ? `<div class="note" style="margin-top:10px;">${escapeHtml(plan.note)}</div>` : ""}
    `;

    wrap.appendChild(card);
  });

  setTimeout(drawAllMiniAtpCharts, 0);
}

function drawAllMiniAtpCharts() {
  document.querySelectorAll("[data-atp-mini]").forEach(canvas => {
    const id = canvas.getAttribute("data-atp-mini");
    const plan = manualAtpPlans.find(p => p.id === id);
    if (!plan) return;

    const miniIndicators = {
      ema: false,
      rsi: false,
      macd: false,
      bollinger: true,
      fvg: false,
      sr: false,
      levels: true
    };

    drawCleanChart({
      canvas,
      rawCandles: latestChartData,
      indicators: miniIndicators,
      plan,
      footer: "ATP Mini Chart",
      showLevels: true
    });
  });
}

/* =========================
   ATP DETAIL
========================= */

function openAtpDetailModalById(id) {
  const plan = manualAtpPlans.find(p => p.id === id);
  if (!plan) return;
  openAtpDetailModal(plan);
}

function openAtpDetailModal(plan) {
  closeAtpDetailModal();

  detailIndicatorState = {
    levels: true,
    ema: !!plan.indicators?.ema,
    rsi: !!plan.indicators?.rsi,
    macd: !!plan.indicators?.macd,
    bollinger: !!plan.indicators?.bollinger,
    fvg: !!plan.indicators?.fvg,
    sr: !!plan.indicators?.sr,
    fib: !!plan.indicators?.fib,
    atr: !!plan.indicators?.atr
  };

  const modal = document.createElement("div");
  modal.id = "atpDetailModal";
  modal.className = "atp-modal-backdrop-v36";
  modal.setAttribute("data-plan-id", plan.id);

  modal.innerHTML = `
    <div class="atp-modal-v36">
      <div class="atp-modal-head-v36">
        <div>
          <div class="atp-modal-title-v36">
            <span class="atp-badge ${plan.side === "BUY" ? "buy" : "sell"}">${escapeHtml(plan.side)}</span>
            <span class="atp-badge ${getAtpBadgeClass(plan)}">${escapeHtml(plan.status)}</span>
            <h2>ATP Detail</h2>
          </div>
          <p>${escapeHtml(plan.mode || "-")} • Created ${escapeHtml(formatThaiDateTime(plan.createdAt))}</p>
        </div>
        <button class="atp-modal-close-v36" type="button" onclick="closeAtpDetailModal()">ปิด</button>
      </div>

      <div class="atp-chart-panel-v36">
        <canvas id="atpDetailChart" width="1280" height="500"></canvas>
      </div>

      <div class="atp-indicator-row-v36" id="detailIndicatorRow">
        ${renderIndicatorButtonsHtml("detail")}
      </div>

      <div class="atp-detail-grid-v36">
        <div><span>Entry</span><b>${money(plan.entry)}</b></div>
        <div><span>SL</span><b>${money(plan.sl)}</b></div>
        <div><span>TP1</span><b>${money(plan.tp1)}</b></div>
        <div><span>TP2</span><b>${money(plan.tp2)}</b></div>
        <div><span>TP3</span><b>${money(plan.tp3)}</b></div>
      </div>

      <div class="atp-detail-grid-v36">
        <div><span>Status</span><b>${escapeHtml(plan.status)}</b></div>
        <div><span>Result</span><b>${escapeHtml(plan.result || "-")}</b></div>
        <div><span>Last Price</span><b>${money(plan.lastPrice)}</b></div>
        <div><span>Expires</span><b>${escapeHtml(formatThaiDateTime(plan.expiresAt))}</b></div>
        <div><span>Side</span><b>${escapeHtml(plan.side)}</b></div>
      </div>

      <div class="atp-progress-row" style="margin-top:14px;">
        <span class="atp-progress-chip ${plan.progress?.entry ? "hit" : ""}">Entry ${plan.progress?.entry ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp1 ? "hit" : ""}">TP1 ${plan.progress?.tp1 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp2 ? "hit" : ""}">TP2 ${plan.progress?.tp2 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.tp3 ? "hit" : ""}">TP3 ${plan.progress?.tp3 ? "✓" : "-"}</span>
        <span class="atp-progress-chip ${plan.progress?.sl ? "danger" : ""}">SL ${plan.progress?.sl ? "✓" : "-"}</span>
      </div>

      <div class="atp-insight-grid-v36">
        <div class="atp-insight-card-v36">
          <h3>Snapshot</h3>
          <div class="mini-bullet-item">Trend: <b>${escapeHtml(plan.snapshot?.trend || "-")}</b></div>
          <div class="mini-bullet-item">RSI: <b>${escapeHtml(plan.snapshot?.rsi ?? "-")}</b></div>
          <div class="mini-bullet-item">Support: <b>${escapeHtml(plan.snapshot?.support ?? "-")}</b></div>
          <div class="mini-bullet-item">Resistance: <b>${escapeHtml(plan.snapshot?.resistance ?? "-")}</b></div>
          <div class="mini-bullet-item">AI Score: <b>${escapeHtml(plan.snapshot?.aiScore ?? "-")}</b></div>
          <div class="mini-bullet-item">Confidence: <b>${escapeHtml(plan.snapshot?.confidence ?? "-")}</b></div>
        </div>

        <div class="atp-insight-card-v36">
          <h3>บทเรียน / ข้อเสนอแนะ</h3>
          ${renderBulletListHtml([...(plan.snapshot?.reason || []).slice(0, 3), ...(plan.snapshot?.filters || []).slice(0, 3)], "ไม่มี")}
        </div>
      </div>

      ${plan.note ? `<div class="atp-insight-card-v36" style="margin-top:14px;"><h3>Note</h3><div>${escapeHtml(plan.note)}</div></div>` : ""}

      <div class="atp-detail-actions-v36">
        <button class="btn-main ghost" type="button" onclick="closeAtpDetailModal()">ปิด</button>
        <button class="btn-main ghost" type="button" onclick="editPlanFromDetail('${plan.id}')">แก้แผน</button>
        <button class="btn-main danger" type="button" onclick="deleteManualAtpFromDetail('${plan.id}')">ลบแผนนี้</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  redrawOpenDetailChart();
}

function redrawOpenDetailChart() {
  const modal = document.getElementById("atpDetailModal");
  const canvas = document.getElementById("atpDetailChart");
  if (!modal || !canvas) return;

  const id = modal.getAttribute("data-plan-id");
  const plan = manualAtpPlans.find(p => p.id === id);
  if (!plan) return;

  drawCleanChart({
    canvas,
    rawCandles: latestChartData,
    indicators: detailIndicatorState,
    plan,
    footer: "ATP Detail Chart | Entry / SL / TP visible here",
    showLevels: true
  });
}

function closeAtpDetailModal() {
  const old = document.getElementById("atpDetailModal");
  if (old) old.remove();
}

function editPlanFromDetail(id) {
  const plan = manualAtpPlans.find(p => p.id === id);
  if (!plan) return;

  closeAtpDetailModal();

  const editable = {
    side: plan.side,
    mode: plan.mode,
    entryStyle: plan.entryStyle || "current",
    entry: plan.entry,
    sl: plan.sl,
    tp1: plan.tp1,
    tp2: plan.tp2,
    tp3: plan.tp3,
    expireHours: 24,
    note: plan.note || "",
    indicators: { ...plan.indicators }
  };

  deleteManualAtp(id, false);
  openAtpEditorModal(editable);
}

function deleteManualAtpFromDetail(id) {
  const ok = confirm("ต้องการลบ ATP นี้ใช่ไหม?");
  if (!ok) return;

  closeAtpDetailModal();
  deleteManualAtp(id);
}

function deleteManualAtp(id, notify = true) {
  manualAtpPlans = manualAtpPlans.filter(p => p.id !== id);
  saveManualAtp();
  renderManualAtp();

  if (notify) showToast("ลบ My ATP แล้ว", "ลบแผนนี้ออกจาก Journal", "warning");
}

function clearClosedManualPlans() {
  manualAtpPlans = manualAtpPlans.filter(p =>
    ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)
  );

  saveManualAtp();
  renderManualAtp();
  showToast("ล้างแผนที่ปิดแล้ว", "เหลือเฉพาะแผนที่ยังทำงานอยู่", "success");
}

function clearAllManualPlans() {
  const ok = confirm("ต้องการลบ My ATP ทั้งหมดใช่ไหม?");
  if (!ok) return;

  manualAtpPlans = [];
  saveManualAtp();
  renderManualAtp();
  showToast("ลบ My ATP ทั้งหมดแล้ว", "เริ่ม Journal ใหม่ได้เลย", "warning");
}

/* =========================
   MODAL CSS
========================= */

function injectModalCssV36() {
  if (document.getElementById("modalCssV36")) return;

  const style = document.createElement("style");
  style.id = "modalCssV36";
  style.innerHTML = `
    .atp-modal-backdrop-v36 {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: rgba(0,0,0,.78);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }

    .atp-modal-v36 {
      width: min(1180px, 100%);
      max-height: 94vh;
      overflow: auto;
      border-radius: 26px;
      border: 1px solid rgba(245,197,66,.42);
      background:
        radial-gradient(circle at top left, rgba(245,197,66,.12), transparent 34%),
        linear-gradient(180deg, rgba(18,22,29,.98), rgba(6,8,11,.98));
      box-shadow: 0 30px 90px rgba(0,0,0,.65);
      padding: 18px;
      color: #fff;
    }

    .atp-modal-head-v36 {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 16px;
    }

    .atp-modal-title-v36 {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .atp-modal-title-v36 h2 {
      margin: 0;
      font-size: 28px;
    }

    .atp-modal-head-v36 p {
      margin: 8px 0 0;
      color: #9aa3b2;
    }

    .atp-modal-close-v36 {
      min-width: 76px;
      min-height: 42px;
      border-radius: 14px;
      border: 1px solid rgba(245,197,66,.38);
      background: rgba(245,197,66,.08);
      color: #f5c542;
      font-weight: 900;
      cursor: pointer;
    }

    .atp-chart-panel-v36 {
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 18px;
      overflow: hidden;
      background: #06080c;
      margin-bottom: 14px;
    }

    .atp-chart-panel-v36 canvas {
      width: 100%;
      height: auto;
      display: block;
    }

    .atp-indicator-row-v36 {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 12px 0 16px;
    }

    .atp-form-grid-v36 {
      display: grid;
      gap: 12px;
      margin-bottom: 12px;
    }

    .atp-form-grid-top {
      grid-template-columns: repeat(4, 1fr);
    }

    .atp-form-grid-levels {
      grid-template-columns: repeat(5, 1fr);
    }

    .atp-form-grid-v36 label {
      padding: 12px;
      border-radius: 18px;
      background: rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.08);
    }

    .atp-form-grid-v36 span,
    .atp-note-label-v36 span,
    .atp-stat-card-v36 span,
    .atp-detail-grid-v36 span {
      display: block;
      color: #9aa3b2;
      font-size: 12px;
      margin-bottom: 6px;
    }

    .atp-form-grid-v36 input,
    .atp-form-grid-v36 select,
    .atp-note-label-v36 input {
      width: 100%;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(0,0,0,.25);
      color: #fff;
      border-radius: 12px;
      min-height: 40px;
      padding: 8px 10px;
      font-weight: 800;
    }

    .atp-note-label-v36 {
      display: block;
      margin: 0 0 12px;
      padding: 12px;
      border-radius: 18px;
      background: rgba(255,255,255,.035);
      border: 1px solid rgba(255,255,255,.08);
    }

    .atp-score-grid-v36 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 12px 0;
    }

    .atp-stat-card-v36,
    .atp-insight-card-v36,
    .atp-detail-grid-v36 div {
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.035);
    }

    .atp-stat-card-v36 b,
    .atp-detail-grid-v36 b {
      color: #fff;
      font-size: 18px;
    }

    .atp-insight-grid-v36 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 12px;
    }

    .atp-insight-card-v36 h3 {
      margin: 0 0 10px;
      color: #f5c542;
      font-size: 20px;
    }

    .mini-bullet-item {
      color: #d7deea;
      margin-bottom: 8px;
      line-height: 1.45;
    }

    .mini-bullet-empty {
      color: #9aa3b2;
    }

    .atp-detail-grid-v36 {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 12px;
      margin-top: 12px;
    }

    .atp-detail-actions-v36 {
      display: flex;
      gap: 12px;
      margin-top: 16px;
    }

    @media (max-width: 980px) {
      .atp-form-grid-top,
      .atp-form-grid-levels,
      .atp-score-grid-v36,
      .atp-detail-grid-v36,
      .atp-insight-grid-v36 {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 640px) {
      .atp-modal-v36 {
        padding: 14px;
      }

      .atp-form-grid-top,
      .atp-form-grid-levels,
      .atp-score-grid-v36,
      .atp-detail-grid-v36,
      .atp-insight-grid-v36 {
        grid-template-columns: 1fr;
      }

      .atp-detail-actions-v36 {
        display: grid;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================
   INIT
========================= */

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  autoRefreshTimer = setInterval(() => {
    loadSignal();
  }, API_REFRESH_SECONDS * 1000);

  countdownTimer = setInterval(() => {
    updateApiCountdown();
  }, 1000);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSoundSetting();
  loadManualAtp();
  updateModeLabel();

  applyHomeCleanFlow();
  syncIndicatorButtons();

  loadSignal();
  loadThaiGold();
  loadCalibrationInfo();
  renderManualAtp();

  startAutoRefresh();

  setInterval(() => {
    loadThaiGold();
  }, 5 * 60 * 1000);
});
