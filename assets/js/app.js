console.log("APP JS VERSION 30 STEP 1 LOADED");

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
let previousActiveStatus = null;
let soundEnabled = true;

let latestChartData = [];
let latestData = null;
let latestAnalysis = null;

let builderSide = "BUY";
let manualAtpPlans = [];

let chartIndicators = {
  ema: true,
  bollinger: true,
  rsi: false,
  macd: false
};

/* =========================
   BASIC HELPERS
========================= */

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
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

function isChecked(id) {
  const node = document.getElementById(id);
  return node ? node.checked === true : false;
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
  if (source.includes("twelve_data_real")) return "Twelve Data Real";
  if (source.includes("twelve_data_cache")) return "Twelve Data Cache";

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
    cooldown_active: "ไม่ส่ง เพราะยังอยู่ใน Cooldown",
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

/* =========================
   UI HELPERS
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

  if (btn) {
    btn.innerText = body.classList.contains("closed") ? "รายละเอียด" : "ย่อ";
  }
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
   ADMIN PANEL
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
   API COUNTDOWN
========================= */

function updateApiCountdown() {
  const el = document.getElementById("autoRefreshStatus");
  const miniEl = document.getElementById("refreshCountdown");

  if (!nextApiUpdateAt) return;

  const remainMs = nextApiUpdateAt - Date.now();
  const text = formatCountdown(remainMs);

  if (el) {
    el.innerText = `Next API update in ${text} | TV-Calibrated Proxy`;
  }

  if (miniEl) {
    miniEl.innerText = text;
  }

  if (remainMs <= 0) {
    loadSignal();
  }
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
   MAIN API
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
    if (statusEl) {
      statusEl.innerText = `VIP Alert: checking signal... | Min ${minConf}% | Cooldown ${cooldown}m`;
    }

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

    console.log("VIP ALERT DATA:", data);

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
      if (statusEl) {
        statusEl.innerText = `VIP Alert: ✅ sent | Min ${minConf}% | Cooldown ${cooldown}m`;
      }

      showToast("ส่ง VIP Alert สำเร็จ", "ส่งเข้า Telegram แล้ว", "success");
      playTone("success");
    } else {
      if (statusEl) {
        statusEl.innerText = "VIP Alert: " + reasonText;
      }

      showToast("ยังไม่ส่ง Telegram", reasonText, "warning");
    }

  } catch (err) {
    console.error("VIP alert error:", err);

    if (statusEl) {
      statusEl.innerText = "VIP Alert: ❌ connection error";
    }

    showToast("VIP Alert error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function testTelegram() {
  const statusEl = document.getElementById("telegramTestStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) {
      statusEl.innerText = "Telegram: sending test...";
    }

    const res = await fetch(
      `${API_URL}?mode=test-telegram&admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      }
    );

    const data = await res.json();

    console.log("TELEGRAM TEST:", data);

    if (data.reason === "unauthorized_admin_key") {
      if (statusEl) statusEl.innerText = "Telegram: ❌ Admin Key ไม่ถูกต้อง";
      showToast("Admin Key ไม่ถูกต้อง", "ตรวจสอบรหัสอีกครั้ง", "danger");
      playTone("danger");
      return;
    }

    if (data.ok === true) {
      if (statusEl) {
        statusEl.innerText = "Telegram: ✅ test sent successfully";
      }

      showToast("Telegram Test สำเร็จ", "ส่งข้อความทดสอบแล้ว", "success");
      playTone("success");
    } else {
      if (statusEl) {
        statusEl.innerText = `Telegram: ❌ ${data.reason || "test failed"}`;
      }

      showToast("ส่ง Telegram ไม่สำเร็จ", data.reason || data.message || "unknown", "danger");
      playTone("danger");
    }

  } catch (err) {
    console.error("Telegram test error:", err);

    if (statusEl) {
      statusEl.innerText = "Telegram: ❌ connection error";
    }

    showToast("Telegram test error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function resetActivePlan() {
  const statusEl = document.getElementById("resetActiveStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) {
      statusEl.innerText = "Active Plan Reset: resetting...";
    }

    const res = await fetch(
      `${API_URL}/reset-active-plan?admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      }
    );

    const data = await res.json();

    console.log("RESET ACTIVE PLAN:", data);

    if (data.ok === true) {
      if (statusEl) {
        statusEl.innerText = "Active Plan Reset: ✅ done";
      }

      showToast("Reset AI Active Plan สำเร็จ", "ระบบล้างแผน AI ที่ล็อกไว้แล้ว", "success");
      playTone("success");
      loadSignal();
    } else {
      if (statusEl) {
        statusEl.innerText = `Active Plan Reset: ❌ ${data.reason || "failed"}`;
      }

      showToast("Reset ไม่สำเร็จ", data.reason || data.message || "unknown", "danger");
      playTone("danger");
    }

  } catch (err) {
    console.error("Reset active plan error:", err);

    if (statusEl) {
      statusEl.innerText = "Active Plan Reset: ❌ connection error";
    }

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
    if (input && document.activeElement !== input) {
      input.value = offset.toFixed(2);
    }
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

    console.log("CALIBRATION INFO:", data);

    if (data.ok && data.calibration) {
      const offset = Number(data.calibration.priceOffset);

      if (Number.isFinite(offset)) {
        const input = document.getElementById("calibrationOffsetInput");
        if (input) input.value = offset.toFixed(2);
      }

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
    if (statusEl) {
      statusEl.innerText = `Price Calibration: saving offset ${signed(offset)}...`;
    }

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

    console.log("SAVE CALIBRATION:", data);

    if (data.ok === true) {
      if (statusEl) {
        statusEl.innerText = `Price Calibration: ✅ saved offset ${signed(offset)}`;
      }

      showToast("บันทึก Offset สำเร็จ", `Offset ใหม่ = ${signed(offset)}`, "success");
      playTone("success");

      await loadSignal();
      await loadCalibrationInfo();
      return;
    }

    if (statusEl) {
      statusEl.innerText = `Price Calibration: ❌ ${data.reason || "save failed"}`;
    }

    showToast("บันทึก Offset ไม่สำเร็จ", data.message || data.reason || "unknown", "danger");
    playTone("danger");

  } catch (err) {
    console.error("Save calibration error:", err);

    if (statusEl) {
      statusEl.innerText = "Price Calibration: ❌ connection error";
    }

    showToast("Calibration error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

async function resetCalibrationOffset() {
  const statusEl = document.getElementById("calibrationStatus");
  const adminKey = requireAdminKey();
  if (!adminKey) return;

  try {
    if (statusEl) {
      statusEl.innerText = "Price Calibration: resetting to +6.50...";
    }

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

    console.log("RESET CALIBRATION:", data);

    if (data.ok === true) {
      const offset = Number(data.calibration?.priceOffset ?? 6.5);

      const input = document.getElementById("calibrationOffsetInput");
      if (input) input.value = offset.toFixed(2);

      if (statusEl) {
        statusEl.innerText = `Price Calibration: ✅ reset to ${signed(offset)}`;
      }

      showToast("Reset Offset สำเร็จ", `กลับไปใช้ค่า default ${signed(offset)}`, "success");
      playTone("success");

      await loadSignal();
      await loadCalibrationInfo();
      return;
    }

    if (statusEl) {
      statusEl.innerText = `Price Calibration: ❌ ${data.reason || "reset failed"}`;
    }

    showToast("Reset Offset ไม่สำเร็จ", data.message || data.reason || "unknown", "danger");
    playTone("danger");

  } catch (err) {
    console.error("Reset calibration error:", err);

    if (statusEl) {
      statusEl.innerText = "Price Calibration: ❌ connection error";
    }

    showToast("Calibration reset error", "เกิดปัญหาการเชื่อมต่อ", "danger");
    playTone("danger");
  }
}

/* =========================
   PRICE / SIGNAL ANIMATION
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

  if (current > previousPrice) {
    priceEl.classList.add("flash-up");
  } else if (current < previousPrice) {
    priceEl.classList.add("flash-down");
  }

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

    if (signal === "BUY" || signal === "SELL") {
      playTone("info");
    }

    setTimeout(() => el.classList.remove("signal-pop"), 300);
  }

  previousSignal = signal;
}

/* =========================
   MODE
========================= */

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
   RENDER MAIN DATA
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
  generateSuggestedPlan(false);
  renderManualAtp();
}

/* =========================
   ACTIVE PLAN
========================= */

function renderActivePlan(plan) {
  const activeStatus = document.getElementById("activeStatus");
  const activeSignal = document.getElementById("activeSignal");
  const activeNote = document.getElementById("activePlanNote");

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

    if (activeStatus) activeStatus.className = "active-status";
    if (activeSignal) activeSignal.style.color = "#999";
    if (activeNote) {
      activeNote.innerText = "ยังไม่มี AI Active Trade Plan เพราะระบบยังไม่พบสัญญาณ BUY/SELL ที่คุณภาพผ่าน";
    }

    previousActiveStatus = null;
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

  if (activeStatus) {
    activeStatus.className = "active-status";

    if (plan.status === "ACTIVE") activeStatus.classList.add("status-active");
    else if (plan.status === "TP1_HIT") activeStatus.classList.add("status-win");
    else if (plan.status === "SL_HIT") activeStatus.classList.add("status-loss");
    else if (plan.status === "EXPIRED") activeStatus.classList.add("status-expired");
  }

  if (activeSignal) {
    if (plan.signal === "BUY") activeSignal.style.color = "#00c853";
    else if (plan.signal === "SELL") activeSignal.style.color = "#ff455e";
    else activeSignal.style.color = "#999";
  }

  if (activeNote) {
    if (plan.status === "ACTIVE") {
      activeNote.innerText = "แผน AI นี้ถูกล็อกไว้แล้ว Entry / SL / TP จะไม่เปลี่ยนจนกว่า TP1 / SL / Expired";
    } else if (plan.status === "TP1_HIT") {
      activeNote.innerText = "แผน AI นี้จบแล้ว: ราคาแตะ TP1";
    } else if (plan.status === "SL_HIT") {
      activeNote.innerText = "แผน AI นี้จบแล้ว: ราคาแตะ SL";
    } else if (plan.status === "EXPIRED") {
      activeNote.innerText = "แผน AI นี้หมดเวลาแล้ว: ยังไม่แตะ TP1 หรือ SL ภายในช่วงที่กำหนด";
    } else {
      activeNote.innerText = "AI Active Trade Plan มีสถานะล่าสุดตามที่แสดง";
    }
  }

  if (previousActiveStatus && previousActiveStatus !== plan.status) {
    if (plan.status === "TP1_HIT") {
      showToast("AI TP1 Hit", "AI Active Trade Plan ทำกำไรถึงเป้าแรกแล้ว", "success");
      playTone("success");
    } else if (plan.status === "SL_HIT") {
      showToast("AI SL Hit", "AI Active Trade Plan แตะ Stop Loss", "danger");
      playTone("danger");
    } else if (plan.status === "EXPIRED") {
      showToast("AI Plan Expired", "แผน AI หมดเวลาโดยยังไม่ถึง TP1/SL", "warning");
    } else if (plan.status === "ACTIVE") {
      showToast("New AI Active Plan", `${plan.signal} plan locked`, "success");
      playTone("info");
    }
  } else if (!previousActiveStatus && plan.status === "ACTIVE") {
    showToast("New AI Active Plan", `${plan.signal} plan locked`, "success");
    playTone("info");
  }

  previousActiveStatus = plan.status;
}

/* =========================
   CHART INDICATORS
========================= */

function toggleChartIndicator(name) {
  if (!Object.prototype.hasOwnProperty.call(chartIndicators, name)) return;

  chartIndicators[name] = !chartIndicators[name];

  const idMap = {
    ema: "toggleEma",
    bollinger: "toggleBollinger",
    rsi: "toggleRsi",
    macd: "toggleMacd"
  };

  const btn = document.getElementById(idMap[name]);
  if (btn) {
    btn.classList.toggle("active", chartIndicators[name]);
  }

  drawApiChart(latestChartData);
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
    if (i === 0) {
      prev = values[i];
    } else {
      prev = values[i] * k + prev * (1 - k);
    }

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

function drawSeriesLine(ctx, series, helper, strokeStyle, width = 1.5, dash = []) {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);

  let started = false;

  series.forEach((value, i) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return;

    const x = helper.xAt(i);
    const y = helper.yAt(Number(value));

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

/* =========================
   MAIN CHART
========================= */

function drawApiChart(candles) {
  const canvas = document.getElementById("apiChartCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#080a0d";
  ctx.fillRect(0, 0, w, h);

  if (!candles || candles.length < 5) {
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "20px sans-serif";
    ctx.fillText("No chart data", 30, 60);
    return;
  }

  const closes = candles.map(c => Number(c.close));

  const padLeft = 46;
  const padRight = 78;
  const padTop = 26;
  const padBottom = chartIndicators.rsi || chartIndicators.macd ? 96 : 36;

  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));

  let max = Math.max(...highs);
  let min = Math.min(...lows);

  if (chartIndicators.bollinger) {
    const bb = bollingerSeries(closes, 20, 2);
    bb.upper.forEach(v => {
      if (Number.isFinite(Number(v))) max = Math.max(max, Number(v));
    });
    bb.lower.forEach(v => {
      if (Number.isFinite(Number(v))) min = Math.min(min, Number(v));
    });
  }

  const range = Math.max(0.01, max - min);

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

  if (chartIndicators.bollinger) {
    const bb = bollingerSeries(closes, 20, 2);
    drawSeriesLine(ctx, bb.upper, helper, "rgba(74, 163, 255, 0.50)", 1.2, [4, 5]);
    drawSeriesLine(ctx, bb.mid, helper, "rgba(245, 197, 66, 0.45)", 1.1, [3, 5]);
    drawSeriesLine(ctx, bb.lower, helper, "rgba(74, 163, 255, 0.50)", 1.2, [4, 5]);
  }

  if (chartIndicators.ema) {
    const ema9 = emaSeries(closes, 9);
    const ema21 = emaSeries(closes, 21);
    drawSeriesLine(ctx, ema9, helper, "rgba(255, 223, 126, 0.95)", 1.8);
    drawSeriesLine(ctx, ema21, helper, "rgba(255, 255, 255, 0.48)", 1.6);
  }

  const candleW = Math.max(3, Math.floor(plotW / candles.length * 0.55));

  candles.forEach((c, i) => {
    const x = xAt(i);
    const open = Number(c.open);
    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);

    const up = close >= open;
    const color = up ? "#00c853" : "#ff455e";

    const yHigh = yAt(high);
    const yLow = yAt(low);
    const yOpen = yAt(open);
    const yClose = yAt(close);

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

  const last = candles[candles.length - 1];
  const lastPrice = Number(last.close);
  const yLast = yAt(lastPrice);

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(245,197,66,0.55)";
  ctx.beginPath();
  ctx.moveTo(padLeft, yLast);
  ctx.lineTo(w - padRight, yLast);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#f5c542";
  ctx.fillRect(w - padRight + 8, yLast - 13, 64, 26);

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

  if (chartIndicators.rsi) {
    drawRsiPanel(ctx, candles, helper);
  }

  if (chartIndicators.macd) {
    drawMacdPanel(ctx, candles, helper);
  }

  ctx.fillStyle = "#9aa3b2";
  ctx.font = "13px sans-serif";
  ctx.fillText("Clean Chart | No Entry / TP / SL lines | Toggle Indicators Enabled", padLeft, h - 12);
}

function drawRsiPanel(ctx, candles, helper) {
  const closes = candles.map(c => Number(c.close));
  const values = rsiSeries(closes, 14);

  const panelH = 52;
  const yBase = helper.h - helper.padBottom + 12;
  const top = yBase;
  const bottom = yBase + panelH;

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
  ctx.fillText("RSI", helper.padLeft + 6, top + 14);

  ctx.restore();
}

function drawMacdPanel(ctx, candles, helper) {
  const closes = candles.map(c => Number(c.close));
  const m = macdSeries(closes);

  const panelH = 52;
  const yBase = helper.h - helper.padBottom + 12;
  const top = chartIndicators.rsi ? yBase + 58 : yBase;
  const bottom = top + panelH;

  if (bottom > helper.h - 18) return;

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

  const macdHelper = {
    ...helper,
    yAt: yMacd
  };

  drawSeriesLine(ctx, m.macd, macdHelper, "rgba(245,197,66,.92)", 1.2);
  drawSeriesLine(ctx, m.signal, macdHelper, "rgba(74,163,255,.85)", 1.2);

  ctx.fillStyle = "#cbd2df";
  ctx.font = "bold 11px sans-serif";
  ctx.fillText("MACD", helper.padLeft + 6, top + 14);

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

    console.log("Thai Gold RAW:", data);

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
   PLAN BUILDER
========================= */

function setBuilderSide(side) {
  builderSide = side === "SELL" ? "SELL" : "BUY";

  const buy = document.getElementById("builderSideBuy");
  const sell = document.getElementById("builderSideSell");

  if (buy) buy.classList.toggle("active", builderSide === "BUY");
  if (sell) sell.classList.toggle("active", builderSide === "SELL");

  generateSuggestedPlan();
}

function quickCreateAtp(side) {
  setBuilderSide(side);

  const modeSelect = document.getElementById("builderMode");
  if (modeSelect) modeSelect.value = currentMode;

  const entryStyle = document.getElementById("builderEntryStyle");
  if (entryStyle) entryStyle.value = "current";

  generateSuggestedPlan(false);
  addManualAtp();

  const section = document.getElementById("section-my-atp");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getBuilderRiskByMode(mode) {
  if (mode === "fast") return 6;
  if (mode === "safe") return 12;
  return 8;
}

function generateSuggestedPlan(showNotice = true) {
  const price = Number(latestData?.price || latestAnalysis?.price);
  if (!Number.isFinite(price)) {
    if (showNotice) showToast("ยังไม่มีราคา", "รอให้ระบบโหลด Signal ก่อน", "warning");
    return;
  }

  const mode = getSettingValue("builderMode", currentMode || "balanced");
  const entryStyle = getSettingValue("builderEntryStyle", "current");
  const risk = getBuilderRiskByMode(mode);

  const support = Number(latestAnalysis?.support);
  const resistance = Number(latestAnalysis?.resistance);
  const nearestFvg = latestAnalysis?.nearestFvg || null;

  let entry = price;

  if (entryStyle === "support_resistance") {
    if (builderSide === "BUY" && Number.isFinite(support)) entry = Math.max(support + 1, price - risk * 0.35);
    if (builderSide === "SELL" && Number.isFinite(resistance)) entry = Math.min(resistance - 1, price + risk * 0.35);
  }

  if (entryStyle === "fvg" && nearestFvg) {
    const mid = Number(nearestFvg.midpoint);
    if (Number.isFinite(mid)) entry = mid;
  }

  if (entryStyle === "hybrid") {
    if (nearestFvg && Number.isFinite(Number(nearestFvg.midpoint))) {
      entry = Number(nearestFvg.midpoint);
    } else if (builderSide === "BUY" && Number.isFinite(support)) {
      entry = Math.max(support + 1, price - risk * 0.35);
    } else if (builderSide === "SELL" && Number.isFinite(resistance)) {
      entry = Math.min(resistance - 1, price + risk * 0.35);
    }
  }

  let sl, tp1, tp2, tp3;

  if (builderSide === "BUY") {
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

  setInputValue("builderEntry", round2(entry).toFixed(2));
  setInputValue("builderSl", round2(sl).toFixed(2));
  setInputValue("builderTp1", round2(tp1).toFixed(2));
  setInputValue("builderTp2", round2(tp2).toFixed(2));
  setInputValue("builderTp3", round2(tp3).toFixed(2));

  analyzeBuilderPlan();

  if (showNotice) {
    showToast("คำนวณแผนใหม่แล้ว", `${builderSide} | ${mode}`, "success");
  }
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

  let score = 50;
  const reasons = [];
  const cautions = [];

  if (isChecked("indEma") && latestAnalysis?.trend) {
    if (builderSide === "BUY" && latestAnalysis.trend === "UPTREND") {
      score += 12;
      reasons.push("EMA / Trend สนับสนุนฝั่ง BUY");
    } else if (builderSide === "SELL" && latestAnalysis.trend === "DOWNTREND") {
      score += 12;
      reasons.push("EMA / Trend สนับสนุนฝั่ง SELL");
    } else {
      score -= 8;
      cautions.push("แผนอาจสวน Trend หลัก");
    }
  }

  if (isChecked("indRsi")) {
    const r = Number(latestAnalysis?.rsi);
    if (Number.isFinite(r)) {
      if (r >= 70) {
        score -= builderSide === "BUY" ? 10 : -4;
        cautions.push("RSI สูง ระวังไล่ BUY");
      } else if (r <= 30) {
        score -= builderSide === "SELL" ? 10 : -4;
        cautions.push("RSI ต่ำ ระวังไล่ SELL");
      } else {
        score += 5;
        reasons.push("RSI ยังไม่สุดโต่ง");
      }
    }
  }

  if (isChecked("indSr")) {
    score += 5;
    reasons.push("ใช้ Support / Resistance ประกอบแผน");
  }

  if (isChecked("indFib") && latestAnalysis?.fibZone) {
    if (builderSide === "BUY" && latestAnalysis.fibZone === "BUY_ZONE") {
      score += 7;
      reasons.push("Fibonacci อยู่ใน BUY_ZONE");
    } else if (builderSide === "SELL" && latestAnalysis.fibZone === "SELL_ZONE") {
      score += 7;
      reasons.push("Fibonacci อยู่ใน SELL_ZONE");
    } else if (latestAnalysis.fibZone !== "NONE") {
      score -= 6;
      cautions.push("Fibonacci อาจขัดกับฝั่งที่เลือก");
    }
  }

  if (isChecked("indFvg") && latestAnalysis?.nearestFvg) {
    const fvg = latestAnalysis.nearestFvg;
    if (
      (builderSide === "BUY" && fvg.type === "bullish") ||
      (builderSide === "SELL" && fvg.type === "bearish")
    ) {
      score += 8;
      reasons.push("FVG สนับสนุนฝั่งที่เลือก");
    } else {
      score -= 5;
      cautions.push("FVG ใกล้ราคาอาจไม่สนับสนุนแผน");
    }
  }

  if (isChecked("indAtr")) {
    if (rr1 >= 0.8) {
      score += 8;
      reasons.push("Risk/Reward TP1 ผ่านเกณฑ์");
    } else {
      score -= 12;
      cautions.push("Risk/Reward TP1 ต่ำ");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const quality =
    score >= 78 ? "A | Strong" :
    score >= 62 ? "B | Medium" :
    "C | Weak";

  setText("planScore", `${score}/100`);
  setText("planQuality", quality);
  setText("planRr1", round2(rr1));
  setText("planRr3", round2(rr3));

  renderList("builderReasons", reasons.length ? reasons : ["ระบบคำนวณแผนจากราคาปัจจุบัน"]);
  renderList("builderCautions", cautions.length ? cautions : ["ยังไม่พบข้อควรระวังเด่น"]);
}

/* =========================
   MANUAL ATP STORAGE
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

function addManualAtp() {
  if (manualAtpPlans.length >= MAX_MANUAL_ATP) {
    showToast("My ATP เต็มแล้ว", `จำกัด ${MAX_MANUAL_ATP} แผน กรุณาลบแผนเก่าก่อน`, "warning");
    return;
  }

  const entry = getNumberValue("builderEntry", NaN);
  const sl = getNumberValue("builderSl", NaN);
  const tp1 = getNumberValue("builderTp1", NaN);
  const tp2 = getNumberValue("builderTp2", NaN);
  const tp3 = getNumberValue("builderTp3", NaN);
  const expireHours = getNumberValue("builderExpireHours", 24);

  if (![entry, sl, tp1, tp2, tp3].every(Number.isFinite)) {
    showToast("แผนไม่ครบ", "กรุณาคำนวณหรือกรอก Entry / SL / TP ให้ครบ", "danger");
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expireHours * 60 * 60 * 1000);

  const plan = {
    id: `myatp_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    side: builderSide,
    mode: getSettingValue("builderMode", currentMode),
    entryStyle: getSettingValue("builderEntryStyle", "current"),
    entry: round2(entry),
    sl: round2(sl),
    tp1: round2(tp1),
    tp2: round2(tp2),
    tp3: round2(tp3),
    note: getSettingValue("builderNote", ""),
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
      ema: isChecked("indEma"),
      rsi: isChecked("indRsi"),
      sr: isChecked("indSr"),
      fib: isChecked("indFib"),
      fvg: isChecked("indFvg"),
      atr: isChecked("indAtr")
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
      confidence: latestAnalysis?.confidence ?? null
    }
  };

  manualAtpPlans.unshift(plan);
  saveManualAtp();
  renderManualAtp();

  showToast("เพิ่ม My ATP แล้ว", `${builderSide} Entry ${money(entry)}`, "success");
  playTone("success");
}

function updateManualAtpByPrice(price) {
  if (!Number.isFinite(price) || !manualAtpPlans.length) return;

  const now = new Date();

  manualAtpPlans = manualAtpPlans.map(plan => {
    if (!["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(plan.status)) {
      return plan;
    }

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
          <button class="atp-icon-btn" type="button" onclick="showAtpBasicDetail('${plan.id}')">ดู</button>
          <button class="atp-icon-btn delete" type="button" onclick="deleteManualAtp('${plan.id}')">ลบ</button>
        </div>
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
}

function showAtpBasicDetail(id) {
  const plan = manualAtpPlans.find(p => p.id === id);
  if (!plan) return;

  const msg =
    `${plan.side} | ${plan.status}\n` +
    `Entry: ${money(plan.entry)}\n` +
    `SL: ${money(plan.sl)}\n` +
    `TP1: ${money(plan.tp1)}\n` +
    `TP2: ${money(plan.tp2)}\n` +
    `TP3: ${money(plan.tp3)}\n\n` +
    `Step 3 จะเปลี่ยนปุ่มนี้เป็นหน้า ATP Detail แบบเต็ม`;

  alert(msg);
}

function deleteManualAtp(id) {
  manualAtpPlans = manualAtpPlans.filter(p => p.id !== id);
  saveManualAtp();
  renderManualAtp();
  showToast("ลบ My ATP แล้ว", "ลบแผนนี้ออกจาก Journal", "warning");
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

  loadSignal();
  loadThaiGold();
  loadCalibrationInfo();
  renderManualAtp();

  startAutoRefresh();

  setInterval(() => {
    loadThaiGold();
  }, 5 * 60 * 1000);
});
