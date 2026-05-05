console.log("APP JS VERSION 27 LOADED");

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

  const type = fvg.type === "bullish" ? "Bullish" : fvg.type === "bearish" ? "Bearish" : fvg.type;
  const status = fvg.status ? ` | ${fvg.status}` : "";
  const distance = fvg.distanceFromPrice !== undefined ? ` | Δ ${fvg.distanceFromPrice}` : "";

  return `${type} ${fvg.bottom}-${fvg.top}${status}${distance}`;
}

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

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function toggleSection(bodyId, btn) {
  const body = document.getElementById(bodyId);
  if (!body) return;

  body.classList.toggle("closed");

  if (btn) {
    btn.innerText = body.classList.contains("closed") ? "รายละเอียด" : "ย่อ";
  }
}

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

/* =========================
   PRICE CALIBRATION ADMIN
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

function render(data) {
  const s = data.currentAnalysis || data.signal || {};
  const activePlan = data.activePlan || s.activePlan || null;
  const learning = data.learning || s.learningStats || {};

  latestData = data;
  latestAnalysis = s;

  updateCalibrationUiFromData(data);

  setText("price", data.price);
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

  const padLeft = 46;
  const padRight = 78;
  const padTop = 26;
  const padBottom = 36;

  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));

  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(0.01, max - min);

  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  function xAt(i) {
    return padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
  }

  function yAt(price) {
    return padTop + ((max - price) / range) * plotH;
  }

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

  drawManualAtpLevelsOnChart(ctx, candles, { yAt, padLeft, w, padRight });

  ctx.fillStyle = "#9aa3b2";
  ctx.font = "13px sans-serif";
  ctx.fillText("TV-Calibrated Proxy | PAXGUSDT + Offset", padLeft, h - 12);
}

function drawManualAtpLevelsOnChart(ctx, candles, helper) {
  if (!manualAtpPlans || !manualAtpPlans.length) return;

  const activePlans = manualAtpPlans.filter(p =>
    ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)
  ).slice(0, 5);

  activePlans.forEach(plan => {
    const levels = [
      { label: `${plan.side} E`, price: plan.entry },
      { label: "SL", price: plan.sl },
      { label: "TP1", price: plan.tp1 }
    ];

    levels.forEach(level => {
      const y = helper.yAt(level.price);

      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = level.label === "SL" ? "rgba(255,69,94,0.55)" : "rgba(0,200,83,0.45)";
      ctx.beginPath();
      ctx.moveTo(helper.padLeft, y);
      ctx.lineTo(helper.w - helper.padRight, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = level.label === "SL" ? "#ff9baa" : "#8effb0";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(level.label, helper.padLeft + 4, y - 4);
    });
  });
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

async function loadThaiGold() {
  try {
    const res = await fetch("https://api.chnwt.dev/thai-gold-api/latest", {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await res.json();

    console.log("Thai Gold RAW:", data);

    const text = JSON.stringify(data);
    const prices = text.match(/\d{2,3},\d{3}(?:\.\d+)?|\d{5}(?:\.\d+)?/g) || [];

    console.log("Thai Gold PRICES:", prices);

    setText("thai_buy", prices[0] || "-");
    setText("thai_sell", prices[1] || "-");
    setText("thai_buy_jewelry", prices[2] || "-");
    setText("thai_sell_jewelry", prices[3] || "-");

  } catch (e) {
    console.log("Thai gold error:", e);

    setText("thai_buy", "-");
    setText("thai_sell", "-");
    setText("thai_buy_jewelry", "-");
    setText("thai_sell_jewelry", "-");
  }
}

/* =========================
   PLAN BUILDER + MY ATP v2
========================= */

function injectAtpV2Styles() {
  if (document.getElementById("atpV2Styles")) return;

  const style = document.createElement("style");
  style.id = "atpV2Styles";
  style.innerHTML = `
    .atp-v2-list {
      display: grid;
      gap: 16px;
    }

    .atp-v2-card {
      position: relative;
      border: 1px solid rgba(245, 197, 66, 0.42);
      background:
        radial-gradient(circle at top left, rgba(245, 197, 66, 0.10), transparent 32%),
        linear-gradient(180deg, rgba(20, 24, 31, 0.98), rgba(8, 10, 13, 0.98));
      border-radius: 22px;
      padding: 14px;
      box-shadow: 0 18px 45px rgba(0,0,0,.35);
      overflow: hidden;
    }

    .atp-v2-card.is-active {
      box-shadow: 0 0 0 1px rgba(245,197,66,.18), 0 18px 55px rgba(245,197,66,.08);
    }

    .atp-v2-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .atp-v2-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .atp-v2-title h3 {
      margin: 0;
      color: #fff;
      font-size: 20px;
      line-height: 1.1;
    }

    .atp-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 3px 9px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: .02em;
      border: 1px solid rgba(255,255,255,.1);
    }

    .atp-badge.buy {
      color: #0eff7a;
      background: rgba(0,200,83,.16);
      border-color: rgba(0,200,83,.45);
    }

    .atp-badge.sell {
      color: #ff6b7d;
      background: rgba(255,69,94,.16);
      border-color: rgba(255,69,94,.45);
    }

    .atp-badge.active {
      color: #83ff9d;
      background: rgba(0,200,83,.14);
      border-color: rgba(0,200,83,.42);
    }

    .atp-badge.waiting {
      color: #ffd76d;
      background: rgba(245,197,66,.14);
      border-color: rgba(245,197,66,.42);
    }

    .atp-badge.closed {
      color: #b8c0cc;
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.12);
    }

    .atp-v2-meta {
      color: #9aa3b2;
      font-size: 12px;
      margin-top: 6px;
    }

    .atp-v2-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .atp-icon-btn {
      width: 34px;
      height: 34px;
      border-radius: 11px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.045);
      color: #e7edf7;
      cursor: pointer;
      font-weight: 800;
    }

    .atp-icon-btn:hover {
      border-color: rgba(245,197,66,.45);
      color: #ffd76d;
    }

    .atp-icon-btn.delete:hover {
      border-color: rgba(255,69,94,.55);
      color: #ff6b7d;
    }

    .atp-mini-chart-box {
      position: relative;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      overflow: hidden;
      background: #06080c;
      margin-bottom: 12px;
    }

    .atp-mini-chart {
      width: 100%;
      height: 185px;
      display: block;
    }

    .atp-indicator-row {
      display: grid;
      grid-template-columns: 1fr 1.45fr;
      gap: 10px;
      margin-bottom: 12px;
    }

    .atp-indicator-mini {
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      background: rgba(255,255,255,.035);
      padding: 9px 10px;
      min-height: 58px;
    }

    .atp-indicator-mini span {
      display: block;
      color: #9fb2cc;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .atp-indicator-mini b {
      color: #fff;
      font-size: 15px;
    }

    .atp-macd-mini {
      width: 100%;
      height: 36px;
      display: block;
      margin-top: 2px;
    }

    .atp-level-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 15px;
      overflow: hidden;
      margin-bottom: 10px;
    }

    .atp-level-grid div {
      padding: 10px 8px;
      background: rgba(255,255,255,.035);
      border-right: 1px solid rgba(255,255,255,.06);
    }

    .atp-level-grid div:last-child {
      border-right: none;
    }

    .atp-level-grid span {
      display: block;
      color: #9fb2cc;
      font-size: 11px;
      margin-bottom: 4px;
    }

    .atp-level-grid b {
      color: #fff;
      font-size: 13px;
      white-space: nowrap;
    }

    .atp-progress-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .atp-progress-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.045);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 12px;
      color: #cfd7e6;
    }

    .atp-progress-chip.hit {
      color: #8effb0;
      border-color: rgba(0,200,83,.35);
      background: rgba(0,200,83,.10);
    }

    .atp-progress-chip.danger {
      color: #ff9baa;
      border-color: rgba(255,69,94,.35);
      background: rgba(255,69,94,.10);
    }

    .atp-chip-row {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .atp-ind-chip {
      border: 1px solid rgba(245,197,66,.28);
      background: rgba(245,197,66,.08);
      color: #ffd76d;
      padding: 5px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }

    .atp-detail-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,.78);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
    }

    .atp-detail-modal {
      width: min(980px, 100%);
      max-height: 92vh;
      overflow: auto;
      border: 1px solid rgba(245,197,66,.46);
      border-radius: 26px;
      background:
        radial-gradient(circle at top left, rgba(245,197,66,.12), transparent 28%),
        linear-gradient(180deg, #111720, #06080c);
      box-shadow: 0 22px 90px rgba(0,0,0,.75);
      padding: 18px;
    }

    .atp-detail-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 14px;
    }

    .atp-detail-title {
      display: flex;
      align-items: center;
      gap: 9px;
      flex-wrap: wrap;
    }

    .atp-detail-title h2 {
      margin: 0;
      color: #fff;
      font-size: 26px;
    }

    .atp-detail-chart {
      width: 100%;
      height: 360px;
      display: block;
      background: #06080c;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 18px;
    }

    .atp-detail-panels {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-top: 10px;
    }

    .atp-detail-indicator {
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 16px;
      background: rgba(255,255,255,.035);
      padding: 10px;
    }

    .atp-detail-indicator canvas {
      width: 100%;
      height: 82px;
      display: block;
    }

    .atp-detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 14px;
    }

    .atp-detail-box {
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.035);
      border-radius: 18px;
      padding: 14px;
    }

    .atp-detail-box h3 {
      margin: 0 0 10px;
      color: #ffd76d;
      font-size: 16px;
    }

    .atp-detail-table {
      display: grid;
      gap: 8px;
    }

    .atp-detail-table div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid rgba(255,255,255,.06);
      padding-bottom: 7px;
      color: #cfd7e6;
      font-size: 14px;
    }

    .atp-detail-table div:last-child {
      border-bottom: none;
    }

    .atp-detail-table b {
      color: #fff;
    }

    .atp-detail-actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 14px;
    }

    .atp-detail-btn {
      border-radius: 15px;
      padding: 13px 10px;
      border: 1px solid rgba(245,197,66,.42);
      background: rgba(245,197,66,.08);
      color: #ffd76d;
      font-weight: 900;
      cursor: pointer;
    }

    .atp-detail-btn.gray {
      color: #d7deea;
      background: rgba(255,255,255,.045);
      border-color: rgba(255,255,255,.12);
    }

    .atp-detail-btn.red {
      color: #ff6b7d;
      background: rgba(255,69,94,.10);
      border-color: rgba(255,69,94,.42);
    }

    @media (max-width: 720px) {
      .atp-level-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .atp-indicator-row {
        grid-template-columns: 1fr;
      }

      .atp-detail-grid,
      .atp-detail-actions {
        grid-template-columns: 1fr;
      }

      .atp-detail-chart {
        height: 300px;
      }
    }
  `;

  document.head.appendChild(style);
}

function loadManualAtp() {
  try {
    const raw = localStorage.getItem(MANUAL_ATP_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    manualAtpPlans = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    manualAtpPlans = [];
  }
}

function saveManualAtp() {
  localStorage.setItem(MANUAL_ATP_KEY, JSON.stringify(manualAtpPlans));
}

function setBuilderSide(side) {
  builderSide = side === "SELL" ? "SELL" : "BUY";

  const buyBtn = document.getElementById("builderSideBuy");
  const sellBtn = document.getElementById("builderSideSell");

  if (buyBtn) buyBtn.classList.toggle("active", builderSide === "BUY");
  if (sellBtn) sellBtn.classList.toggle("active", builderSide === "SELL");

  generateSuggestedPlan();
}

function getBuilderRisk(mode) {
  if (mode === "fast") return 6;
  if (mode === "safe") return 12;
  return 8;
}

function getBuilderEntryStyle() {
  const node = document.getElementById("builderEntryStyle");
  if (!node) return "current";

  // แก้ UX: ถ้าหน้าเดิมตั้ง default เป็น Support/Resistance
  // ให้เริ่มจาก Current Price ก่อน เพื่อให้เลขตรงกับราคาด้านบน
  if (!node.dataset.initialized) {
    node.dataset.initialized = "true";
    node.value = "current";
  }

  return node.value || "current";
}

function generateSuggestedPlan(updateStatus = true) {
  if (!latestAnalysis || !latestData) return;

  const price = Number(latestData.price);
  if (!Number.isFinite(price)) return;

  const mode = getSettingValue("builderMode", "balanced");
  const entryStyle = getBuilderEntryStyle();
  const riskBase = getBuilderRisk(mode);

  const support = Number(latestAnalysis.support || price - riskBase * 2);
  const resistance = Number(latestAnalysis.resistance || price + riskBase * 2);
  const fvg = latestAnalysis.nearestFvg;

  let entry = price;
  let entrySource = "Current Price";

  if (entryStyle === "support_resistance") {
    entry = builderSide === "BUY" ? support : resistance;
    entrySource = builderSide === "BUY" ? "Support" : "Resistance";
  }

  if (entryStyle === "fvg" && fvg) {
    entry = Number(fvg.midpoint || ((Number(fvg.top) + Number(fvg.bottom)) / 2));
    entrySource = "Nearest FVG";
  }

  if (entryStyle === "hybrid") {
    if (isChecked("indFvg") && fvg && Number.isFinite(Number(fvg.midpoint))) {
      entry = Number(fvg.midpoint);
      entrySource = "Hybrid: FVG";
    } else if (isChecked("indSr")) {
      entry = builderSide === "BUY" ? support : resistance;
      entrySource = builderSide === "BUY" ? "Hybrid: Support" : "Hybrid: Resistance";
    } else {
      entry = price;
      entrySource = "Hybrid: Current Price";
    }
  }

  if (!Number.isFinite(entry)) {
    entry = price;
    entrySource = "Current Price";
  }

  let risk = riskBase;

  if (isChecked("indAtr")) {
    const range = Number(latestAnalysis.range || riskBase * 4);
    risk = Math.max(riskBase, Math.min(18, range / 6));
  }

  let sl, tp1, tp2, tp3;

  if (builderSide === "BUY") {
    sl = Math.min(entry - risk, support - 1);
    tp1 = entry + risk;
    tp2 = entry + risk * 2;
    tp3 = entry + risk * 3;
  } else {
    sl = Math.max(entry + risk, resistance + 1);
    tp1 = entry - risk;
    tp2 = entry - risk * 2;
    tp3 = entry - risk * 3;
  }

  setInputValue("builderEntry", money(entry));
  setInputValue("builderSl", money(sl));
  setInputValue("builderTp1", money(tp1));
  setInputValue("builderTp2", money(tp2));
  setInputValue("builderTp3", money(tp3));

  analyzeBuilderPlan();

  if (updateStatus) {
    setText("builderStatus", `ระบบคำนวณแผนใหม่แล้ว | Entry Source: ${entrySource}`);
  }
}

function analyzeBuilderPlan() {
  if (!latestAnalysis || !latestData) return null;

  const side = builderSide;
  const entry = getNumberValue("builderEntry", 0);
  const sl = getNumberValue("builderSl", 0);
  const tp1 = getNumberValue("builderTp1", 0);
  const tp2 = getNumberValue("builderTp2", 0);
  const tp3 = getNumberValue("builderTp3", 0);

  if (!entry || !sl || !tp1 || !tp2 || !tp3) return null;

  const risk = Math.abs(entry - sl);
  const reward1 = Math.abs(tp1 - entry);
  const reward3 = Math.abs(tp3 - entry);

  const rr1 = risk > 0 ? reward1 / risk : 0;
  const rr3 = risk > 0 ? reward3 / risk : 0;

  let score = 50;
  const reasons = [];
  const cautions = [];

  if (isChecked("indEma")) {
    if (side === "BUY" && latestAnalysis.trend === "UPTREND") {
      score += 12;
      reasons.push("แผน BUY ไปตามเทรนด์หลักขาขึ้น");
    } else if (side === "SELL" && latestAnalysis.trend === "DOWNTREND") {
      score += 12;
      reasons.push("แผน SELL ไปตามเทรนด์หลักขาลง");
    } else if (latestAnalysis.trend === "SIDEWAY") {
      score -= 4;
      cautions.push("ตลาด Sideway อาจทำให้แผนแกว่งและรอจังหวะนาน");
    } else {
      score -= 10;
      cautions.push("แผนนี้มีโอกาสสวนเทรนด์หลัก");
    }
  }

  if (isChecked("indRsi")) {
    const rsiValue = Number(latestAnalysis.rsi || 50);

    if (rsiValue > 35 && rsiValue < 65) {
      score += 6;
      reasons.push("RSI อยู่ในโซนกลาง ช่วยลดความเสี่ยงจากภาวะร้อนแรงเกินไป");
    }

    if (side === "BUY" && rsiValue >= 70) {
      score -= 12;
      cautions.push("BUY ขณะ RSI สูงมาก ระวังไล่ราคา");
    }

    if (side === "SELL" && rsiValue <= 30) {
      score -= 12;
      cautions.push("SELL ขณะ RSI ต่ำมาก ระวังเด้งกลับ");
    }
  }

  if (isChecked("indSr")) {
    const support = Number(latestAnalysis.support);
    const resistance = Number(latestAnalysis.resistance);

    if (side === "BUY") {
      const nearSupport = Math.abs(entry - support);
      const nearResistance = Math.abs(entry - resistance);

      if (nearSupport <= 6) {
        score += 8;
        reasons.push("Entry BUY อยู่ใกล้แนวรับ");
      }

      if (nearResistance <= 5) {
        score -= 12;
        cautions.push("Entry BUY ใกล้แนวต้านเกินไป");
      }
    }

    if (side === "SELL") {
      const nearResistance = Math.abs(entry - resistance);
      const nearSupport = Math.abs(entry - support);

      if (nearResistance <= 6) {
        score += 8;
        reasons.push("Entry SELL อยู่ใกล้แนวต้าน");
      }

      if (nearSupport <= 5) {
        score -= 12;
        cautions.push("Entry SELL ใกล้แนวรับเกินไป");
      }
    }
  }

  if (isChecked("indFib")) {
    if (side === "BUY" && latestAnalysis.fibZone === "BUY_ZONE") {
      score += 8;
      reasons.push("Fibonacci สนับสนุนฝั่ง BUY");
    } else if (side === "SELL" && latestAnalysis.fibZone === "SELL_ZONE") {
      score += 8;
      reasons.push("Fibonacci สนับสนุนฝั่ง SELL");
    } else if (latestAnalysis.fibZone && latestAnalysis.fibZone !== "NONE") {
      score -= 5;
      cautions.push(`Fib Zone ตอนนี้คือ ${latestAnalysis.fibZone} อาจไม่ตรงกับแผน`);
    }
  }

  if (isChecked("indFvg")) {
    const fvg = latestAnalysis.nearestFvg;

    if (fvg) {
      if (side === "BUY" && fvg.type === "bullish") {
        score += 10;
        reasons.push(`พบ Bullish FVG ใกล้ราคา ${fvg.bottom}-${fvg.top}`);
      } else if (side === "SELL" && fvg.type === "bearish") {
        score += 10;
        reasons.push(`พบ Bearish FVG ใกล้ราคา ${fvg.bottom}-${fvg.top}`);
      } else {
        score -= 5;
        cautions.push("FVG ใกล้ราคายังไม่สนับสนุนฝั่งของแผนชัดเจน");
      }
    } else {
      cautions.push("ยังไม่พบ FVG ใกล้ราคาที่ใช้สนับสนุนแผน");
    }
  }

  const macdPack = calcMacdFromCandles(latestChartData);
  if (macdPack.latest) {
    if (side === "BUY" && macdPack.latest.histogram > 0) {
      score += 6;
      reasons.push("MACD Histogram เป็นบวก สนับสนุนแรงซื้อ");
    }

    if (side === "SELL" && macdPack.latest.histogram < 0) {
      score += 6;
      reasons.push("MACD Histogram เป็นลบ สนับสนุนแรงขาย");
    }

    if (side === "BUY" && macdPack.latest.histogram < 0) {
      score -= 5;
      cautions.push("MACD Histogram ยังไม่สนับสนุน BUY");
    }

    if (side === "SELL" && macdPack.latest.histogram > 0) {
      score -= 5;
      cautions.push("MACD Histogram ยังไม่สนับสนุน SELL");
    }
  }

  if (rr1 >= 1) {
    score += 8;
    reasons.push("Risk/Reward TP1 คุ้มกว่า 1:1");
  } else {
    score -= 8;
    cautions.push("Risk/Reward TP1 ยังต่ำกว่า 1:1");
  }

  if (rr3 >= 2) {
    score += 8;
    reasons.push("TP3 ให้ Risk/Reward ระยะไกลที่น่าสนใจ");
  }

  if (risk > 20) {
    score -= 8;
    cautions.push("SL กว้างเกินไป อาจใช้เงินประกัน/ความเสี่ยงสูง");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let quality = "Caution";
  if (score >= 80) quality = "Strong";
  else if (score >= 65) quality = "Good";
  else if (score >= 50) quality = "Caution";
  else quality = "Risky";

  setText("planScore", `${score}/100`);
  setText("planQuality", quality);
  setText("planRr1", rr1.toFixed(2));
  setText("planRr3", rr3.toFixed(2));

  renderList("builderReasons", reasons.length ? reasons : ["ยังไม่มีเหตุผลสนับสนุนเด่น"]);
  renderList("builderCautions", cautions.length ? cautions : ["ยังไม่พบจุดเสี่ยงเด่น"]);

  return {
    score,
    quality,
    rr1: round2(rr1),
    rr3: round2(rr3),
    reasons,
    cautions
  };
}

function addManualAtp() {
  if (!latestData || !latestAnalysis) {
    showToast("ยังไม่มีข้อมูลราคา", "รอให้ระบบโหลด Signal ก่อน", "warning");
    return;
  }

  const activeCount = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED", "DELETED"].includes(p.status)
  ).length;

  if (activeCount >= MAX_MANUAL_ATP) {
    showToast("My ATP เต็มแล้ว", "จำกัดแผนที่ยังใช้งานอยู่ 10 แผน", "danger");
    return;
  }

  const entry = getNumberValue("builderEntry", 0);
  const sl = getNumberValue("builderSl", 0);
  const tp1 = getNumberValue("builderTp1", 0);
  const tp2 = getNumberValue("builderTp2", 0);
  const tp3 = getNumberValue("builderTp3", 0);

  if (!entry || !sl || !tp1 || !tp2 || !tp3) {
    showToast("ข้อมูลแผนไม่ครบ", "กรุณากดคำนวณหรือกรอก Entry / SL / TP ให้ครบ", "warning");
    return;
  }

  if (builderSide === "BUY" && !(sl < entry && tp1 > entry && tp2 > tp1 && tp3 > tp2)) {
    showToast("โครง BUY ไม่ถูกต้อง", "BUY ต้องมี SL ต่ำกว่า Entry และ TP สูงกว่า Entry", "danger");
    return;
  }

  if (builderSide === "SELL" && !(sl > entry && tp1 < entry && tp2 < tp1 && tp3 < tp2)) {
    showToast("โครง SELL ไม่ถูกต้อง", "SELL ต้องมี SL สูงกว่า Entry และ TP ต่ำกว่า Entry", "danger");
    return;
  }

  const analysis = analyzeBuilderPlan();
  const now = new Date();
  const expireHours = Number(getSettingValue("builderExpireHours", "24"));
  const expiresAt = new Date(now.getTime() + expireHours * 60 * 60 * 1000);

  const plan = {
    id: `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    type: "MANUAL_ATP",
    side: builderSide,
    mode: getSettingValue("builderMode", "balanced"),
    entry: round2(entry),
    sl: round2(sl),
    tp1: round2(tp1),
    tp2: round2(tp2),
    tp3: round2(tp3),
    note: getSettingValue("builderNote", "").trim(),
    status: "WAITING_ENTRY",
    result: "pending",
    hits: {
      entry: false,
      tp1: false,
      tp2: false,
      tp3: false,
      sl: false
    },
    score: analysis?.score ?? 0,
    quality: analysis?.quality ?? "Caution",
    rr1: analysis?.rr1 ?? 0,
    rr3: analysis?.rr3 ?? 0,
    reasons: analysis?.reasons ?? [],
    cautions: analysis?.cautions ?? [],
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    updatedAt: now.toISOString(),
    source: latestData.priceSource || latestData.source || "tv_calibrated_proxy",
    priceOffset: latestData.priceOffset ?? 0,
    rawPrice: latestData.rawPrice ?? null,
    createdPrice: Number(latestData.price),
    chartSnapshot: Array.isArray(latestChartData) ? latestChartData.slice(-80) : []
  };

  manualAtpPlans.unshift(plan);
  saveManualAtp();

  updateManualAtpByPrice(Number(latestData.price));
  renderManualAtp();

  showToast("เพิ่ม My ATP สำเร็จ", `${plan.side} ${money(plan.entry)} ถูกเพิ่มเข้า Journal แล้ว`, "success");
  playTone("success");
}

function updateManualAtpByPrice(price) {
  if (!Number.isFinite(price)) return;
  let changed = false;
  const now = new Date();

  manualAtpPlans = manualAtpPlans.map(plan => {
    if (["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED", "DELETED"].includes(plan.status)) {
      return plan;
    }

    const updated = { ...plan, hits: { ...plan.hits } };

    if (updated.expiresAt && now.getTime() >= new Date(updated.expiresAt).getTime()) {
      updated.status = "EXPIRED";
      updated.result = "expired";
      updated.closedAt = now.toISOString();
      updated.updatedAt = now.toISOString();
      updated.lastPrice = round2(price);
      changed = true;
      return updated;
    }

    if (updated.status === "WAITING_ENTRY") {
      if (updated.side === "BUY" && price <= updated.entry) {
        updated.status = "ACTIVE";
        updated.hits.entry = true;
        updated.activatedAt = now.toISOString();
        changed = true;
        showToast("My ATP Entry Hit", `BUY Entry ${money(updated.entry)} ทำงานแล้ว`, "success");
        playTone("info");
      }

      if (updated.side === "SELL" && price >= updated.entry) {
        updated.status = "ACTIVE";
        updated.hits.entry = true;
        updated.activatedAt = now.toISOString();
        changed = true;
        showToast("My ATP Entry Hit", `SELL Entry ${money(updated.entry)} ทำงานแล้ว`, "success");
        playTone("info");
      }
    }

    if (updated.status === "ACTIVE" || updated.status === "TP1_HIT" || updated.status === "TP2_HIT") {
      if (updated.side === "BUY") {
        if (price <= updated.sl) {
          updated.hits.sl = true;
          updated.status = "SL_HIT";
          updated.result = updated.hits.tp1 ? "partial_win_then_sl" : "loss_sl";
          updated.closedAt = now.toISOString();
          changed = true;
          showToast("My ATP SL Hit", `${updated.side} แตะ SL ${money(updated.sl)}`, "danger");
          playTone("danger");
        } else {
          if (price >= updated.tp1 && !updated.hits.tp1) {
            updated.hits.tp1 = true;
            updated.status = "TP1_HIT";
            updated.result = "running_profit";
            changed = true;
            showToast("My ATP TP1 Hit", `${updated.side} ถึง TP1 ${money(updated.tp1)}`, "success");
            playTone("success");
          }

          if (price >= updated.tp2 && !updated.hits.tp2) {
            updated.hits.tp2 = true;
            updated.status = "TP2_HIT";
            updated.result = "running_profit";
            changed = true;
            showToast("My ATP TP2 Hit", `${updated.side} ถึง TP2 ${money(updated.tp2)}`, "success");
            playTone("success");
          }

          if (price >= updated.tp3 && !updated.hits.tp3) {
            updated.hits.tp3 = true;
            updated.status = "TP3_HIT";
            updated.result = "win_tp3";
            updated.closedAt = now.toISOString();
            changed = true;
            showToast("My ATP TP3 Hit", `${updated.side} ถึง TP3 ${money(updated.tp3)}`, "success");
            playTone("success");
          }
        }
      }

      if (updated.side === "SELL") {
        if (price >= updated.sl) {
          updated.hits.sl = true;
          updated.status = "SL_HIT";
          updated.result = updated.hits.tp1 ? "partial_win_then_sl" : "loss_sl";
          updated.closedAt = now.toISOString();
          changed = true;
          showToast("My ATP SL Hit", `${updated.side} แตะ SL ${money(updated.sl)}`, "danger");
          playTone("danger");
        } else {
          if (price <= updated.tp1 && !updated.hits.tp1) {
            updated.hits.tp1 = true;
            updated.status = "TP1_HIT";
            updated.result = "running_profit";
            changed = true;
            showToast("My ATP TP1 Hit", `${updated.side} ถึง TP1 ${money(updated.tp1)}`, "success");
            playTone("success");
          }

          if (price <= updated.tp2 && !updated.hits.tp2) {
            updated.hits.tp2 = true;
            updated.status = "TP2_HIT";
            updated.result = "running_profit";
            changed = true;
            showToast("My ATP TP2 Hit", `${updated.side} ถึง TP2 ${money(updated.tp2)}`, "success");
            playTone("success");
          }

          if (price <= updated.tp3 && !updated.hits.tp3) {
            updated.hits.tp3 = true;
            updated.status = "TP3_HIT";
            updated.result = "win_tp3";
            updated.closedAt = now.toISOString();
            changed = true;
            showToast("My ATP TP3 Hit", `${updated.side} ถึง TP3 ${money(updated.tp3)}`, "success");
            playTone("success");
          }
        }
      }
    }

    updated.updatedAt = now.toISOString();
    updated.lastPrice = round2(price);

    return updated;
  });

  if (changed) {
    saveManualAtp();
  }
}

function renderManualAtp() {
  injectAtpV2Styles();

  const list = document.getElementById("manualAtpList");
  if (!list) return;

  const activeCount = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED", "DELETED"].includes(p.status)
  ).length;

  setText("myAtpCountBadge", `${activeCount}/${MAX_MANUAL_ATP}`);
  setText("myAtpLimitText", `${activeCount}/${MAX_MANUAL_ATP}`);

  renderManualStats();

  const visiblePlans = manualAtpPlans.filter(p => p.status !== "DELETED");

  if (!visiblePlans.length) {
    list.innerHTML = `<div class="note">ยังไม่มี My ATP กด Add to My ATP จาก Plan Builder เพื่อเริ่มเก็บแผน</div>`;
    return;
  }

  list.innerHTML = `<div class="atp-v2-list"></div>`;
  const wrap = list.querySelector(".atp-v2-list");

  visiblePlans.forEach((plan, index) => {
    const card = document.createElement("div");
    const activeClass = ["ACTIVE", "TP1_HIT", "TP2_HIT"].includes(plan.status) ? "is-active" : "";
    card.className = `atp-v2-card ${activeClass}`;
    card.id = `atpCard_${plan.id}`;

    const sideClass = plan.side === "BUY" ? "buy" : "sell";
    const statusClass =
      plan.status === "ACTIVE" || plan.status.includes("TP") ? "active" :
      plan.status === "WAITING_ENTRY" ? "waiting" :
      "closed";

    card.innerHTML = `
      <div class="atp-v2-head">
        <div>
          <div class="atp-v2-title">
            <h3>ATP #${index + 1}</h3>
            <span class="atp-badge ${sideClass}">${escapeHtml(plan.side)}</span>
            <span class="atp-badge ${statusClass}">${statusIcon(plan.status)} ${formatAtpStatus(plan.status)}</span>
          </div>
          <div class="atp-v2-meta">
            ${escapeHtml(plan.mode)} • ${formatThaiDateTime(plan.createdAt)}
          </div>
        </div>

        <div class="atp-v2-actions">
          <button class="atp-icon-btn delete" type="button" onclick="deleteManualAtp('${plan.id}')">🗑</button>
          <button class="atp-icon-btn" type="button" onclick="openManualAtpDetail('${plan.id}')">↗</button>
        </div>
      </div>

      <div class="atp-mini-chart-box">
        <canvas class="atp-mini-chart" id="miniChart_${plan.id}" width="760" height="220"></canvas>
      </div>

      <div class="atp-level-grid">
        <div><span>Entry</span><b>${hitIcon(plan.hits.entry)} ${money(plan.entry)}</b></div>
        <div><span>SL</span><b>${hitIcon(plan.hits.sl)} ${money(plan.sl)}</b></div>
        <div><span>TP1</span><b>${hitIcon(plan.hits.tp1)} ${money(plan.tp1)}</b></div>
        <div><span>TP2</span><b>${hitIcon(plan.hits.tp2)} ${money(plan.tp2)}</b></div>
        <div><span>TP3</span><b>${hitIcon(plan.hits.tp3)} ${money(plan.tp3)}</b></div>
      </div>

      <div class="atp-indicator-row">
        <div class="atp-indicator-mini">
          <span>RSI</span>
          <b>${getRsiDisplay(plan)}</b>
        </div>
        <div class="atp-indicator-mini">
          <span>MACD</span>
          <b>${getMacdDisplay(plan)}</b>
          <canvas class="atp-macd-mini" id="miniMacd_${plan.id}" width="360" height="46"></canvas>
        </div>
      </div>

      <div class="atp-progress-row">
        <span class="atp-progress-chip ${plan.hits.entry ? "hit" : ""}">${plan.hits.entry ? "✅" : "⏳"} Entry</span>
        <span class="atp-progress-chip ${plan.hits.tp1 ? "hit" : ""}">${plan.hits.tp1 ? "✅" : "⏳"} TP1</span>
        <span class="atp-progress-chip ${plan.hits.tp2 ? "hit" : ""}">${plan.hits.tp2 ? "✅" : "⏳"} TP2</span>
        <span class="atp-progress-chip ${plan.hits.tp3 ? "hit" : ""}">${plan.hits.tp3 ? "✅" : "⏳"} TP3</span>
        <span class="atp-progress-chip ${plan.hits.sl ? "danger" : ""}">${plan.hits.sl ? "❌" : "🛡"} SL</span>
      </div>

      <div class="atp-chip-row">
        <span class="atp-ind-chip">RSI</span>
        <span class="atp-ind-chip">MACD</span>
        <span class="atp-ind-chip">Bollinger Bands</span>
        <span class="atp-ind-chip">Score ${plan.score}/100</span>
      </div>
    `;

    wrap.appendChild(card);

    requestAnimationFrame(() => {
      drawAtpMiniChart(plan);
      drawAtpMiniMacd(plan);
    });
  });
}

function statusIcon(status) {
  if (status === "ACTIVE") return "⚡";
  if (status === "WAITING_ENTRY") return "⏳";
  if (status === "TP1_HIT" || status === "TP2_HIT" || status === "TP3_HIT") return "✅";
  if (status === "SL_HIT") return "❌";
  if (status === "EXPIRED") return "⌛";
  if (status === "CANCELLED") return "⛔";
  return "•";
}

function formatAtpStatus(status) {
  if (status === "WAITING_ENTRY") return "WAITING";
  if (status === "TP1_HIT") return "TP1 HIT";
  if (status === "TP2_HIT") return "TP2 HIT";
  if (status === "TP3_HIT") return "TP3 HIT";
  if (status === "SL_HIT") return "SL HIT";
  return status || "-";
}

function hitIcon(value) {
  return value ? "✅" : "○";
}

function getPlanCandles(plan) {
  const live = Array.isArray(latestChartData) && latestChartData.length ? latestChartData : [];
  const snap = Array.isArray(plan.chartSnapshot) && plan.chartSnapshot.length ? plan.chartSnapshot : [];
  return live.length ? live.slice(-80) : snap.slice(-80);
}

function getRsiDisplay(plan) {
  const candles = getPlanCandles(plan);
  const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
  const value = calcRsiSimple(closes, 14);
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function getMacdDisplay(plan) {
  const pack = calcMacdFromCandles(getPlanCandles(plan));
  if (!pack.latest) return "-";
  return `${pack.latest.macd.toFixed(2)} / ${pack.latest.signal.toFixed(2)} / ${pack.latest.histogram.toFixed(2)}`;
}

function drawAtpMiniChart(plan) {
  const canvas = document.getElementById(`miniChart_${plan.id}`);
  if (!canvas) return;

  const candles = getPlanCandles(plan);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  if (!candles || candles.length < 10) {
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "20px sans-serif";
    ctx.fillText("No chart data", 24, 50);
    return;
  }

  const levelPrices = [plan.entry, plan.sl, plan.tp1, plan.tp2, plan.tp3].map(Number);
  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));
  const closes = candles.map(c => Number(c.close));

  const max = Math.max(...highs, ...levelPrices);
  const min = Math.min(...lows, ...levelPrices);
  const range = Math.max(0.01, max - min);

  const padLeft = 78;
  const padRight = 72;
  const padTop = 18;
  const padBottom = 24;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xAt = i => padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
  const yAt = p => padTop + ((max - p) / range) * plotH;

  drawGrid(ctx, padLeft, padTop, plotW, plotH);

  const bb = calcBollinger(closes, 20, 2);
  drawBollinger(ctx, bb, xAt, yAt, "rgba(65, 145, 255, .75)", "rgba(65, 145, 255, .08)");

  const candleW = Math.max(3, Math.floor(plotW / candles.length * 0.55));

  candles.forEach((c, i) => {
    const x = xAt(i);
    const open = Number(c.open);
    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);
    const up = close >= open;
    const color = up ? "#00c853" : "#ff455e";

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x, yAt(high));
    ctx.lineTo(x, yAt(low));
    ctx.stroke();

    const yOpen = yAt(open);
    const yClose = yAt(close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(2, Math.abs(yOpen - yClose));

    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  });

  drawPlanLevels(ctx, plan, yAt, padLeft, w, padRight, true);

  const last = candles.at(-1);
  const lastPrice = Number(last.close);
  const yLast = yAt(lastPrice);

  ctx.fillStyle = plan.side === "BUY" ? "#00c853" : "#ff455e";
  ctx.fillRect(w - padRight + 8, yLast - 12, 58, 24);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(lastPrice.toFixed(2), w - padRight + 12, yLast + 4);
}

function drawGrid(ctx, x, y, w, h) {
  ctx.strokeStyle = "rgba(255,255,255,.075)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 4; i++) {
    const yy = y + (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }

  for (let i = 0; i <= 5; i++) {
    const xx = x + (i / 5) * w;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
}

function drawPlanLevels(ctx, plan, yAt, padLeft, w, padRight, showLeftLabels = true) {
  const levels = [
    { key: "tp3", label: `TP3 ${money(plan.tp3)}`, price: plan.tp3, color: "#31e86f" },
    { key: "tp2", label: `TP2 ${money(plan.tp2)}`, price: plan.tp2, color: "#31e86f" },
    { key: "tp1", label: `TP1 ${money(plan.tp1)}`, price: plan.tp1, color: "#31e86f" },
    { key: "entry", label: `ENTRY ${money(plan.entry)}`, price: plan.entry, color: "#f5c542" },
    { key: "sl", label: `SL ${money(plan.sl)}`, price: plan.sl, color: "#ff455e" }
  ];

  levels.forEach(level => {
    const y = yAt(Number(level.price));

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = level.color;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    if (showLeftLabels) {
      ctx.fillStyle = level.color;
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(level.label, 10, y + 4);
    }
  });
}

function drawBollinger(ctx, bb, xAt, yAt, lineColor, fillColor) {
  const valid = bb.filter(x => x && Number.isFinite(x.upper) && Number.isFinite(x.lower));
  if (!valid.length) return;

  ctx.beginPath();
  bb.forEach((p, i) => {
    if (!p) return;
    const x = xAt(i);
    const y = yAt(p.upper);
    if (i === 0 || !bb[i - 1]) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  for (let i = bb.length - 1; i >= 0; i--) {
    const p = bb[i];
    if (!p) continue;
    ctx.lineTo(xAt(i), yAt(p.lower));
  }

  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  drawLineSeries(ctx, bb.map(p => p?.upper), xAt, yAt, lineColor, 1.4);
  drawLineSeries(ctx, bb.map(p => p?.middle), xAt, yAt, "rgba(245,197,66,.70)", 1.2);
  drawLineSeries(ctx, bb.map(p => p?.lower), xAt, yAt, lineColor, 1.4);
}

function drawLineSeries(ctx, values, xAt, yAt, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();

  let started = false;

  values.forEach((v, i) => {
    if (!Number.isFinite(Number(v))) return;

    const x = xAt(i);
    const y = yAt(Number(v));

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });

  if (started) ctx.stroke();
}

function drawAtpMiniMacd(plan) {
  const canvas = document.getElementById(`miniMacd_${plan.id}`);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,.1)";
  ctx.fillRect(0, 0, w, h);

  const pack = calcMacdFromCandles(getPlanCandles(plan));
  drawMacdCanvas(ctx, pack, w, h);
}

function drawMacdCanvas(ctx, pack, w, h) {
  const hist = pack.histogram || [];
  const macd = pack.macd || [];
  const signal = pack.signal || [];

  if (!hist.length) return;

  const all = [...hist, ...macd, ...signal].filter(Number.isFinite);
  const maxAbs = Math.max(0.01, ...all.map(v => Math.abs(v)));

  const pad = 5;
  const mid = h / 2;
  const plotW = w - pad * 2;
  const step = plotW / Math.max(1, hist.length - 1);

  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();

  hist.forEach((v, i) => {
    if (!Number.isFinite(v)) return;

    const x = pad + i * step;
    const barH = (Math.abs(v) / maxAbs) * (h * 0.38);

    ctx.fillStyle = v >= 0 ? "#00c853" : "#ff455e";
    ctx.fillRect(x - 1.5, v >= 0 ? mid - barH : mid, 3, barH);
  });

  const yAt = v => mid - (v / maxAbs) * (h * 0.38);
  const xAt = i => pad + i * step;

  drawLineSeries(ctx, macd, xAt, yAt, "#2f8cff", 1.5);
  drawLineSeries(ctx, signal, xAt, yAt, "#f5a742", 1.5);
}

function renderManualStats() {
  const total = manualAtpPlans.filter(p => p.status !== "DELETED").length;
  const active = manualAtpPlans.filter(p =>
    ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)
  ).length;

  const wins = manualAtpPlans.filter(p => p.status === "TP3_HIT" || p.result === "win_tp3").length;
  const losses = manualAtpPlans.filter(p => p.result === "loss_sl").length;
  const partial = manualAtpPlans.filter(p => p.result === "partial_win_then_sl" || p.status === "TP1_HIT" || p.status === "TP2_HIT").length;

  const judged = wins + losses + partial;
  const winRate = judged > 0 ? Math.round(((wins + partial * 0.5) / judged) * 100) : null;

  setText("manualTotalPlans", total);
  setText("manualActivePlans", active);
  setText("manualWins", wins);
  setText("manualLosses", losses);
  setText("manualPartial", partial);
  setText("manualWinRate", winRate === null ? "-" : `${winRate}%`);
}

function cancelManualAtp(id) {
  manualAtpPlans = manualAtpPlans.map(plan => {
    if (plan.id !== id) return plan;

    if (["TP3_HIT", "SL_HIT", "EXPIRED", "CANCELLED", "DELETED"].includes(plan.status)) {
      return plan;
    }

    return {
      ...plan,
      status: "CANCELLED",
      result: "cancelled",
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  saveManualAtp();
  renderManualAtp();
  drawApiChart(latestChartData);
  closeAtpDetail();
  showToast("ปิด My ATP แล้ว", "แผนนี้ถูกบันทึกเป็น CANCELLED", "warning");
}

function deleteManualAtp(id) {
  const ok = confirm("ต้องการลบ ATP แผนนี้ใช่ไหม?");
  if (!ok) return;

  manualAtpPlans = manualAtpPlans.map(plan => {
    if (plan.id !== id) return plan;

    return {
      ...plan,
      status: "DELETED",
      result: "deleted",
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });

  saveManualAtp();
  renderManualAtp();
  drawApiChart(latestChartData);
  closeAtpDetail();
  showToast("ลบ My ATP แล้ว", "แผนนี้ถูกซ่อนออกจากรายการ", "warning");
}

function duplicateManualAtp(id) {
  const source = manualAtpPlans.find(p => p.id === id);
  if (!source) return;

  const activeCount = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED", "DELETED"].includes(p.status)
  ).length;

  if (activeCount >= MAX_MANUAL_ATP) {
    showToast("My ATP เต็มแล้ว", "จำกัดแผนที่ยังใช้งานอยู่ 10 แผน", "danger");
    return;
  }

  const now = new Date();

  const copy = {
    ...source,
    id: `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    status: "WAITING_ENTRY",
    result: "pending",
    hits: {
      entry: false,
      tp1: false,
      tp2: false,
      tp3: false,
      sl: false
    },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    closedAt: null,
    deletedAt: null,
    note: source.note ? `${source.note} | Duplicate` : "Duplicate plan"
  };

  manualAtpPlans.unshift(copy);
  saveManualAtp();
  renderManualAtp();
  showToast("Duplicate สำเร็จ", "คัดลอก ATP เป็นแผนใหม่แล้ว", "success");
}

function clearClosedManualPlans() {
  manualAtpPlans = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "EXPIRED", "CANCELLED", "DELETED"].includes(p.status)
  );

  saveManualAtp();
  renderManualAtp();
  drawApiChart(latestChartData);
  showToast("ล้างแผนที่ปิดแล้ว", "เหลือเฉพาะแผนที่ยังทำงานอยู่", "success");
}

function clearAllManualPlans() {
  const ok = confirm("ต้องการล้าง My ATP ทั้งหมดในเครื่องนี้ใช่ไหม?");
  if (!ok) return;

  manualAtpPlans = [];
  saveManualAtp();
  renderManualAtp();
  drawApiChart(latestChartData);
  showToast("ล้าง My ATP ทั้งหมดแล้ว", "เริ่มสร้างแผนใหม่ได้เลย", "success");
}

function openManualAtpDetail(id) {
  injectAtpV2Styles();

  const plan = manualAtpPlans.find(p => p.id === id);
  if (!plan) return;

  closeAtpDetail();

  const backdrop = document.createElement("div");
  backdrop.className = "atp-detail-backdrop";
  backdrop.id = "atpDetailBackdrop";
  backdrop.onclick = e => {
    if (e.target === backdrop) closeAtpDetail();
  };

  const sideClass = plan.side === "BUY" ? "buy" : "sell";
  const statusClass =
    plan.status === "ACTIVE" || plan.status.includes("TP") ? "active" :
    plan.status === "WAITING_ENTRY" ? "waiting" :
    "closed";

  backdrop.innerHTML = `
    <div class="atp-detail-modal">
      <div class="atp-detail-head">
        <div>
          <div class="atp-detail-title">
            <h2>ATP Detail</h2>
            <span class="atp-badge ${sideClass}">${escapeHtml(plan.side)}</span>
            <span class="atp-badge ${statusClass}">${statusIcon(plan.status)} ${formatAtpStatus(plan.status)}</span>
          </div>
          <div class="atp-v2-meta">
            XAU/USD • ${escapeHtml(plan.mode)} • ${formatThaiDateTime(plan.createdAt)}
          </div>
        </div>

        <div class="atp-v2-actions">
          <button class="atp-icon-btn" type="button" onclick="closeAtpDetail()">✕</button>
        </div>
      </div>

      <div class="atp-chip-row">
        <span class="atp-ind-chip">RSI</span>
        <span class="atp-ind-chip">MACD</span>
        <span class="atp-ind-chip">Bollinger Bands</span>
        <span class="atp-ind-chip">Score ${plan.score}/100</span>
      </div>

      <div style="margin-top:14px;">
        <canvas id="atpDetailChart_${plan.id}" class="atp-detail-chart" width="1100" height="430"></canvas>
      </div>

      <div class="atp-detail-panels">
        <div class="atp-detail-indicator">
          <div class="atp-v2-meta">RSI (14) • ${getRsiDisplay(plan)}</div>
          <canvas id="atpDetailRsi_${plan.id}" width="1000" height="92"></canvas>
        </div>

        <div class="atp-detail-indicator">
          <div class="atp-v2-meta">MACD (12, 26, 9) • ${getMacdDisplay(plan)}</div>
          <canvas id="atpDetailMacd_${plan.id}" width="1000" height="92"></canvas>
        </div>
      </div>

      <div class="atp-detail-grid">
        <div class="atp-detail-box">
          <h3>🎯 Plan Levels</h3>
          <div class="atp-detail-table">
            <div><span>Entry</span><b>${money(plan.entry)}</b></div>
            <div><span>SL</span><b style="color:#ff6b7d">${money(plan.sl)}</b></div>
            <div><span>TP1</span><b style="color:#8effb0">${money(plan.tp1)}</b></div>
            <div><span>TP2</span><b style="color:#8effb0">${money(plan.tp2)}</b></div>
            <div><span>TP3</span><b style="color:#8effb0">${money(plan.tp3)}</b></div>
          </div>
        </div>

        <div class="atp-detail-box">
          <h3>📊 Result / Quality</h3>
          <div class="atp-detail-table">
            <div><span>Risk/Reward TP1</span><b>${plan.rr1 ?? "-"}</b></div>
            <div><span>Risk/Reward TP3</span><b>${plan.rr3 ?? "-"}</b></div>
            <div><span>Quality</span><b>${escapeHtml(plan.quality || "-")}</b></div>
            <div><span>AI Score</span><b>${plan.score}/100</b></div>
            <div><span>Result</span><b>${escapeHtml(plan.result || "-")}</b></div>
          </div>
        </div>
      </div>

      <div class="atp-detail-grid">
        <div class="atp-detail-box">
          <h3>✅ เหตุผลสนับสนุน</h3>
          <div class="reason-list">
            ${(plan.reasons || []).map(r => `<div>• ${escapeHtml(r)}</div>`).join("") || "<div>-</div>"}
          </div>
        </div>

        <div class="atp-detail-box">
          <h3>⚠️ จุดที่ต้องระวัง</h3>
          <div class="reason-list">
            ${(plan.cautions || []).map(r => `<div>• ${escapeHtml(r)}</div>`).join("") || "<div>-</div>"}
          </div>
        </div>
      </div>

      <div class="atp-detail-actions">
        <button class="atp-detail-btn" type="button" onclick="duplicateManualAtp('${plan.id}')">📋 Duplicate</button>
        <button class="atp-detail-btn gray" type="button" onclick="cancelManualAtp('${plan.id}')">🔒 Close Plan</button>
        <button class="atp-detail-btn red" type="button" onclick="deleteManualAtp('${plan.id}')">🗑 Delete Plan</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    drawAtpDetailChart(plan);
    drawAtpDetailRsi(plan);
    drawAtpDetailMacd(plan);
  });
}

function closeAtpDetail() {
  const old = document.getElementById("atpDetailBackdrop");
  if (old) old.remove();
}

function drawAtpDetailChart(plan) {
  const canvas = document.getElementById(`atpDetailChart_${plan.id}`);
  if (!canvas) return;

  const candles = getPlanCandles(plan);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  if (!candles || candles.length < 10) return;

  const levelPrices = [plan.entry, plan.sl, plan.tp1, plan.tp2, plan.tp3].map(Number);
  const highs = candles.map(c => Number(c.high));
  const lows = candles.map(c => Number(c.low));
  const closes = candles.map(c => Number(c.close));

  const max = Math.max(...highs, ...levelPrices);
  const min = Math.min(...lows, ...levelPrices);
  const range = Math.max(0.01, max - min);

  const padLeft = 120;
  const padRight = 86;
  const padTop = 22;
  const padBottom = 36;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const xAt = i => padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
  const yAt = p => padTop + ((max - p) / range) * plotH;

  drawGrid(ctx, padLeft, padTop, plotW, plotH);

  const bb = calcBollinger(closes, 20, 2);
  drawBollinger(ctx, bb, xAt, yAt, "rgba(65, 145, 255, .82)", "rgba(65, 145, 255, .09)");

  const candleW = Math.max(4, Math.floor(plotW / candles.length * 0.55));

  candles.forEach((c, i) => {
    const x = xAt(i);
    const open = Number(c.open);
    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);
    const up = close >= open;
    const color = up ? "#00c853" : "#ff455e";

    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x, yAt(high));
    ctx.lineTo(x, yAt(low));
    ctx.stroke();

    const yOpen = yAt(open);
    const yClose = yAt(close);
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(2, Math.abs(yOpen - yClose));

    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  });

  drawPlanLevels(ctx, plan, yAt, padLeft, w, padRight, true);

  const last = candles.at(-1);
  const lastPrice = Number(last.close);
  const yLast = yAt(lastPrice);

  ctx.fillStyle = plan.side === "BUY" ? "#00c853" : "#ff455e";
  ctx.fillRect(w - padRight + 8, yLast - 13, 70, 26);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(lastPrice.toFixed(2), w - padRight + 12, yLast + 5);

  ctx.fillStyle = "#9aa3b2";
  ctx.font = "13px sans-serif";
  ctx.fillText("XAU/USD • 15m • ATP Detail Chart", padLeft, h - 12);
}

function drawAtpDetailRsi(plan) {
  const canvas = document.getElementById(`atpDetailRsi_${plan.id}`);
  if (!canvas) return;

  const candles = getPlanCandles(plan);
  const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
  const values = calcRsiSeries(closes, 14);

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,.10)";
  [30, 50, 70].forEach(level => {
    const y = h - ((level / 100) * h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  const xAt = i => (i / Math.max(1, values.length - 1)) * w;
  const yAt = v => h - (v / 100) * h;

  drawLineSeries(ctx, values, xAt, yAt, "#00c853", 2);
}

function drawAtpDetailMacd(plan) {
  const canvas = document.getElementById(`atpDetailMacd_${plan.id}`);
  if (!canvas) return;

  const pack = calcMacdFromCandles(getPlanCandles(plan));
  const ctx = canvas.getContext("2d");
  drawMacdCanvas(ctx, pack, canvas.width, canvas.height);
}

function drawManualAtpLevelsOnChart(ctx, candles, helper) {
  if (!manualAtpPlans || !manualAtpPlans.length) return;

  const activePlans = manualAtpPlans.filter(p =>
    ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)
  ).slice(0, 5);

  activePlans.forEach(plan => {
    const levels = [
      { label: `${plan.side} E`, price: plan.entry, color: "#f5c542" },
      { label: "SL", price: plan.sl, color: "#ff455e" },
      { label: "TP1", price: plan.tp1, color: "#00c853" }
    ];

    levels.forEach(level => {
      const y = helper.yAt(level.price);

      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = level.color;
      ctx.beginPath();
      ctx.moveTo(helper.padLeft, y);
      ctx.lineTo(helper.w - helper.padRight, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = level.color;
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(level.label, helper.padLeft + 4, y - 4);
    });
  });
}

/* =========================
   INDICATOR CALCULATION
========================= */

function calcSma(values, period, index) {
  if (index < period - 1) return null;

  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += Number(values[i]);
  }

  return sum / period;
}

function calcStd(values, period, index, mean) {
  if (index < period - 1) return null;

  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const diff = Number(values[i]) - mean;
    sum += diff * diff;
  }

  return Math.sqrt(sum / period);
}

function calcBollinger(values, period = 20, mult = 2) {
  return values.map((_, i) => {
    const mid = calcSma(values, period, i);
    if (!Number.isFinite(mid)) return null;

    const std = calcStd(values, period, i, mid);

    return {
      middle: mid,
      upper: mid + std * mult,
      lower: mid - std * mult
    };
  });
}

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = null;

  values.forEach((raw, i) => {
    const v = Number(raw);

    if (!Number.isFinite(v)) {
      out.push(null);
      return;
    }

    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }

    out.push(prev);
  });

  return out;
}

function calcMacdFromCandles(candles) {
  const closes = (candles || []).map(c => Number(c.close)).filter(Number.isFinite);

  if (closes.length < 35) {
    return {
      macd: [],
      signal: [],
      histogram: [],
      latest: null
    };
  }

  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);

  const macd = closes.map((_, i) => {
    if (!Number.isFinite(ema12[i]) || !Number.isFinite(ema26[i])) return null;
    return ema12[i] - ema26[i];
  });

  const signal = emaSeries(macd.map(v => Number.isFinite(v) ? v : 0), 9);

  const histogram = macd.map((v, i) => {
    if (!Number.isFinite(v) || !Number.isFinite(signal[i])) return null;
    return v - signal[i];
  });

  const cleanMacd = macd.map(v => Number.isFinite(v) ? v : 0);
  const cleanSignal = signal.map(v => Number.isFinite(v) ? v : 0);
  const cleanHistogram = histogram.map(v => Number.isFinite(v) ? v : 0);

  const latestIndex = cleanHistogram.length - 1;

  return {
    macd: cleanMacd.slice(-45),
    signal: cleanSignal.slice(-45),
    histogram: cleanHistogram.slice(-45),
    latest: {
      macd: cleanMacd[latestIndex],
      signal: cleanSignal[latestIndex],
      histogram: cleanHistogram[latestIndex]
    }
  };
}

function calcRsiSimple(values, period = 14) {
  if (!values || values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];

    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 70;
  if (gains === 0) return 30;

  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function calcRsiSeries(values, period = 14) {
  return values.map((_, i) => {
    if (i < period) return 50;
    const slice = values.slice(0, i + 1);
    return calcRsiSimple(slice, period) ?? 50;
  }).slice(-60);
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  autoRefreshTimer = setInterval(() => {
    loadSignal();
  }, API_REFRESH_SECONDS * 1000);

  countdownTimer = setInterval(() => {
    updateApiCountdown();
  }, 1000);

  setNextApiUpdate(null);
}

window.toggleSound = toggleSound;
window.applySoundSettingFromSelect = applySoundSettingFromSelect;
window.toggleAdminPanel = toggleAdminPanel;
window.toggleAdminKey = toggleAdminKey;
window.setMode = setMode;
window.loadSignal = loadSignal;
window.sendVipSignal = sendVipSignal;
window.testTelegram = testTelegram;
window.resetActivePlan = resetActivePlan;
window.toggleSection = toggleSection;

window.setBuilderSide = setBuilderSide;
window.generateSuggestedPlan = generateSuggestedPlan;
window.addManualAtp = addManualAtp;
window.cancelManualAtp = cancelManualAtp;
window.clearClosedManualPlans = clearClosedManualPlans;
window.clearAllManualPlans = clearAllManualPlans;

window.saveCalibrationOffset = saveCalibrationOffset;
window.resetCalibrationOffset = resetCalibrationOffset;
window.loadCalibrationInfo = loadCalibrationInfo;

window.addEventListener("resize", () => {
  drawApiChart(latestChartData);
});

window.addEventListener("DOMContentLoaded", () => {
  loadSoundSetting();
  loadManualAtp();
  updateModeLabel();
  renderManualAtp();
  loadCalibrationInfo();
  loadSignal();
  loadThaiGold();
  startAutoRefresh();
});

/* =========================
   STEP 29C QUICK TRADE FLOW
   BUY / SELL -> ATP EDITOR -> LOCK PLAN
========================= */

console.log("STEP 29C QUICK TRADE FLOW LOADED");

(function setupQuickTradeFlow29C() {
  let quickEditorState = null;

  function injectQuickTradeStyles29C() {
    if (document.getElementById("quickTrade29CStyles")) return;

    const style = document.createElement("style");
    style.id = "quickTrade29CStyles";
    style.innerHTML = `
      .quick-trade-panel-29c {
        margin: 18px auto 0;
        max-width: 1080px;
        border: 1px solid rgba(245,197,66,.35);
        background:
          radial-gradient(circle at top left, rgba(245,197,66,.10), transparent 32%),
          linear-gradient(180deg, rgba(17,21,29,.98), rgba(7,9,13,.98));
        border-radius: 22px;
        padding: 14px;
        box-shadow: 0 14px 40px rgba(0,0,0,.35);
      }

      .quick-trade-head-29c {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .quick-trade-head-29c h3 {
        margin: 0;
        color: #fff;
        font-size: 20px;
      }

      .quick-trade-head-29c p {
        margin: 4px 0 0;
        color: #aeb8c9;
        font-size: 13px;
      }

      .quick-trade-price-29c {
        color: #ffd76d;
        font-size: 18px;
        font-weight: 900;
        white-space: nowrap;
      }

      .quick-trade-buttons-29c {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .quick-trade-btn-29c {
        min-height: 74px;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,.12);
        cursor: pointer;
        font-size: 28px;
        font-weight: 1000;
        letter-spacing: .04em;
        color: #fff;
        transition: .18s ease;
      }

      .quick-trade-btn-29c.buy {
        background: linear-gradient(180deg, rgba(0,200,83,.30), rgba(0,100,50,.18));
        border-color: rgba(0,200,83,.58);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05), 0 0 22px rgba(0,200,83,.10);
      }

      .quick-trade-btn-29c.sell {
        background: linear-gradient(180deg, rgba(255,69,94,.30), rgba(120,20,35,.18));
        border-color: rgba(255,69,94,.58);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.05), 0 0 22px rgba(255,69,94,.10);
      }

      .quick-trade-btn-29c:hover {
        transform: translateY(-1px);
        filter: brightness(1.1);
      }

      .atp-editor-backdrop-29c {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(0,0,0,.80);
        backdrop-filter: blur(8px);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 18px;
      }

      .atp-editor-modal-29c {
        width: min(1120px, 100%);
        max-height: 94vh;
        overflow: auto;
        border: 1px solid rgba(245,197,66,.50);
        border-radius: 28px;
        background:
          radial-gradient(circle at top left, rgba(245,197,66,.14), transparent 28%),
          linear-gradient(180deg, #111720, #06080c);
        box-shadow: 0 24px 90px rgba(0,0,0,.78);
        padding: 18px;
      }

      .atp-editor-head-29c {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 14px;
      }

      .atp-editor-title-29c {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .atp-editor-title-29c h2 {
        margin: 0;
        color: #fff;
        font-size: 26px;
      }

      .atp-editor-sub-29c {
        color: #aeb8c9;
        margin-top: 5px;
        font-size: 13px;
      }

      .atp-editor-badge-29c {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 11px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 1000;
        border: 1px solid rgba(255,255,255,.12);
      }

      .atp-editor-badge-29c.buy {
        color: #0eff7a;
        background: rgba(0,200,83,.16);
        border-color: rgba(0,200,83,.48);
      }

      .atp-editor-badge-29c.sell {
        color: #ff6b7d;
        background: rgba(255,69,94,.16);
        border-color: rgba(255,69,94,.48);
      }

      .atp-editor-close-29c {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(255,255,255,.05);
        color: #fff;
        cursor: pointer;
        font-weight: 900;
      }

      .atp-editor-grid-29c {
        display: grid;
        grid-template-columns: 1.4fr .9fr;
        gap: 14px;
      }

      .atp-editor-card-29c {
        border: 1px solid rgba(255,255,255,.09);
        background: rgba(255,255,255,.035);
        border-radius: 20px;
        padding: 14px;
      }

      .atp-editor-chart-29c {
        width: 100%;
        height: 430px;
        display: block;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 18px;
        background: #05070a;
      }

      .atp-editor-ind-panels-29c {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 10px;
      }

      .atp-editor-ind-card-29c {
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.035);
        border-radius: 16px;
        padding: 10px;
      }

      .atp-editor-ind-card-29c span {
        color: #aeb8c9;
        font-size: 12px;
      }

      .atp-editor-ind-card-29c b {
        color: #fff;
        font-size: 15px;
      }

      .atp-editor-ind-card-29c canvas {
        width: 100%;
        height: 76px;
        display: block;
        margin-top: 6px;
      }

      .atp-editor-field-grid-29c {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .atp-editor-field-29c {
        border: 1px solid rgba(255,255,255,.09);
        background: rgba(255,255,255,.035);
        border-radius: 16px;
        padding: 11px;
      }

      .atp-editor-field-29c span {
        display: block;
        color: #aeb8c9;
        font-size: 12px;
        margin-bottom: 7px;
      }

      .atp-editor-field-29c input,
      .atp-editor-field-29c select {
        width: 100%;
        box-sizing: border-box;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,.10);
        background: #070a0f;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        padding: 11px 12px;
      }

      .atp-editor-full-29c {
        grid-column: 1 / -1;
      }

      .atp-editor-tool-row-29c {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 9px;
        margin: 10px 0 12px;
      }

      .atp-editor-tool-29c {
        border-radius: 13px;
        border: 1px solid rgba(245,197,66,.28);
        background: rgba(245,197,66,.08);
        color: #ffd76d;
        font-weight: 900;
        padding: 10px 8px;
        cursor: pointer;
      }

      .atp-editor-ind-toggle-wrap-29c {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 12px;
      }

      .atp-editor-toggle-29c {
        border: 1px solid rgba(255,255,255,.09);
        background: rgba(255,255,255,.04);
        color: #dfe6f2;
        border-radius: 13px;
        padding: 10px 9px;
        cursor: pointer;
        text-align: left;
        font-weight: 800;
        font-size: 13px;
      }

      .atp-editor-toggle-29c.on {
        border-color: rgba(245,197,66,.42);
        background: rgba(245,197,66,.10);
        color: #ffd76d;
      }

      .atp-editor-analysis-29c {
        margin-top: 12px;
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,255,255,.035);
      }

      .atp-editor-analysis-grid-29c {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .atp-editor-analysis-box-29c {
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 13px;
        padding: 10px;
        background: rgba(0,0,0,.15);
      }

      .atp-editor-analysis-box-29c span {
        color: #aeb8c9;
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }

      .atp-editor-analysis-box-29c b {
        color: #fff;
        font-size: 16px;
      }

      .atp-editor-reason-29c {
        margin-top: 10px;
        color: #dfe6f2;
        font-size: 13px;
        line-height: 1.65;
      }

      .atp-editor-lock-29c {
        margin-top: 12px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .atp-editor-lock-btn-29c {
        border: 1px solid rgba(245,197,66,.55);
        background: linear-gradient(180deg, rgba(245,197,66,.24), rgba(245,197,66,.10));
        color: #ffd76d;
        border-radius: 16px;
        padding: 15px 12px;
        font-size: 16px;
        font-weight: 1000;
        cursor: pointer;
      }

      .atp-editor-lock-btn-29c.ghost {
        border-color: rgba(255,255,255,.14);
        background: rgba(255,255,255,.05);
        color: #e6edf8;
      }

      @media (max-width: 900px) {
        .atp-editor-grid-29c {
          grid-template-columns: 1fr;
        }

        .atp-editor-ind-panels-29c,
        .atp-editor-field-grid-29c,
        .atp-editor-analysis-grid-29c,
        .atp-editor-tool-row-29c,
        .atp-editor-ind-toggle-wrap-29c,
        .atp-editor-lock-29c {
          grid-template-columns: 1fr;
        }

        .atp-editor-chart-29c {
          height: 330px;
        }

        .quick-trade-buttons-29c {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function attachQuickTradePanel29C() {
    injectQuickTradeStyles29C();

    if (document.getElementById("quickTradePanel29C")) {
      updateQuickTradePanel29C();
      return;
    }

    const hero = document.querySelector(".hero-card");
    if (!hero) return;

    const panel = document.createElement("section");
    panel.id = "quickTradePanel29C";
    panel.className = "quick-trade-panel-29c";
    panel.innerHTML = `
      <div class="quick-trade-head-29c">
        <div>
          <h3>⚡ Quick Trade Flow</h3>
          <p>เห็นราคาที่ชอบแล้วกด BUY / SELL เพื่อสร้าง ATP ทันที</p>
        </div>
        <div class="quick-trade-price-29c" id="quickTradePrice29C">-</div>
      </div>

      <div class="quick-trade-buttons-29c">
        <button class="quick-trade-btn-29c buy" type="button" onclick="openQuickAtpEditor29C('BUY')">
          BUY
        </button>
        <button class="quick-trade-btn-29c sell" type="button" onclick="openQuickAtpEditor29C('SELL')">
          SELL
        </button>
      </div>
    `;

    hero.insertAdjacentElement("afterend", panel);
    updateQuickTradePanel29C();
  }

  function updateQuickTradePanel29C() {
    const price = Number(latestData?.price);
    setText("quickTradePrice29C", Number.isFinite(price) ? `Live ${money(price)}` : "-");
  }

  function getEditorRisk29C(mode) {
    if (mode === "fast") return 6;
    if (mode === "safe") return 12;
    return 8;
  }

  function buildDefaultEditorState29C(side) {
    const price = Number(latestData?.price || latestAnalysis?.price || 0);
    const mode = currentMode || "balanced";
    const risk = getEditorRisk29C(mode);

    let entry = price;
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
      entrySource: "Live Current Price",
      entry: round2(entry),
      sl: round2(sl),
      tp1: round2(tp1),
      tp2: round2(tp2),
      tp3: round2(tp3),
      note: "",
      indicators: {
        ema: true,
        rsi: true,
        macd: true,
        bb: true,
        fvg: true,
        sr: true
      }
    };
  }

  window.openQuickAtpEditor29C = function openQuickAtpEditor29C(side) {
    injectQuickTradeStyles29C();

    if (!latestData || !latestAnalysis) {
      showToast("ยังไม่มีข้อมูลราคา", "รอให้ระบบโหลดราคาก่อน", "warning");
      return;
    }

    quickEditorState = buildDefaultEditorState29C(side);

    const old = document.getElementById("atpEditorBackdrop29C");
    if (old) old.remove();

    const badgeClass = side === "BUY" ? "buy" : "sell";

    const backdrop = document.createElement("div");
    backdrop.className = "atp-editor-backdrop-29c";
    backdrop.id = "atpEditorBackdrop29C";
    backdrop.onclick = e => {
      if (e.target === backdrop) closeQuickAtpEditor29C();
    };

    backdrop.innerHTML = `
      <div class="atp-editor-modal-29c">
        <div class="atp-editor-head-29c">
          <div>
            <div class="atp-editor-title-29c">
              <h2>ATP Editor</h2>
              <span class="atp-editor-badge-29c ${badgeClass}" id="editorSideBadge29C">${side}</span>
              <span class="atp-editor-badge-29c">LIVE ${money(latestData.price)}</span>
            </div>
            <div class="atp-editor-sub-29c" id="editorSubText29C">
              Entry Source: Live Current Price • ปรับแผนก่อนกด Lock Plan
            </div>
          </div>

          <button class="atp-editor-close-29c" type="button" onclick="closeQuickAtpEditor29C()">✕</button>
        </div>

        <div class="atp-editor-grid-29c">
          <div class="atp-editor-card-29c">
            <canvas id="atpEditorChart29C" class="atp-editor-chart-29c" width="1100" height="430"></canvas>

            <div class="atp-editor-ind-panels-29c">
              <div class="atp-editor-ind-card-29c" id="editorRsiPanel29C">
                <span>RSI (14)</span>
                <b id="editorRsiValue29C">-</b>
                <canvas id="atpEditorRsi29C" width="480" height="82"></canvas>
              </div>

              <div class="atp-editor-ind-card-29c" id="editorMacdPanel29C">
                <span>MACD (12, 26, 9)</span>
                <b id="editorMacdValue29C">-</b>
                <canvas id="atpEditorMacd29C" width="480" height="82"></canvas>
              </div>
            </div>
          </div>

          <div class="atp-editor-card-29c">
            <div class="atp-editor-field-grid-29c">
              <div class="atp-editor-field-29c">
                <span>Side</span>
                <select id="editorSide29C" onchange="editorChangeSide29C()">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>

              <div class="atp-editor-field-29c">
                <span>Mode</span>
                <select id="editorMode29C" onchange="editorRecalculateTpSl29C()">
                  <option value="fast">Scalping</option>
                  <option value="balanced">Day Trade</option>
                  <option value="safe">Swing</option>
                </select>
              </div>

              <div class="atp-editor-field-29c">
                <span>Entry</span>
                <input id="editorEntry29C" type="number" step="0.01" oninput="editorInputChanged29C()" />
              </div>

              <div class="atp-editor-field-29c">
                <span>SL</span>
                <input id="editorSl29C" type="number" step="0.01" oninput="editorInputChanged29C()" />
              </div>

              <div class="atp-editor-field-29C_PLACEHOLDER"></div>
            </div>

            <div class="atp-editor-field-grid-29c" style="margin-top:10px;">
              <div class="atp-editor-field-29c">
                <span>TP1</span>
                <input id="editorTp1_29C" type="number" step="0.01" oninput="editorInputChanged29C()" />
              </div>

              <div class="atp-editor-field-29c">
                <span>TP2</span>
                <input id="editorTp2_29C" type="number" step="0.01" oninput="editorInputChanged29C()" />
              </div>

              <div class="atp-editor-field-29c">
                <span>TP3</span>
                <input id="editorTp3_29C" type="number" step="0.01" oninput="editorInputChanged29C()" />
              </div>

              <div class="atp-editor-field-29c">
                <span>Expire</span>
                <select id="editorExpire29C">
                  <option value="4">4 Hours</option>
                  <option value="8">8 Hours</option>
                  <option value="24" selected>24 Hours</option>
                  <option value="48">48 Hours</option>
                </select>
              </div>

              <div class="atp-editor-field-29c atp-editor-full-29c">
                <span>Note</span>
                <input id="editorNote29C" type="text" placeholder="เช่น เข้าเพราะราคาชนโซน / รอข่าว / ตาม FVG" oninput="editorInputChanged29C()" />
              </div>
            </div>

            <div class="atp-editor-tool-row-29c">
              <button class="atp-editor-tool-29c" type="button" onclick="editorUseCurrentPrice29C()">Use Current</button>
              <button class="atp-editor-tool-29c" type="button" onclick="editorUseSr29C()">Use S/R</button>
              <button class="atp-editor-tool-29c" type="button" onclick="editorUseFvg29C()">Use FVG</button>
            </div>

            <div class="atp-editor-tool-row-29c">
              <button class="atp-editor-tool-29c" type="button" onclick="editorRecalculateTpSl29C()">Auto TP/SL</button>
              <button class="atp-editor-tool-29c" type="button" onclick="editorWidenSl29C()">Widen SL</button>
              <button class="atp-editor-tool-29c" type="button" onclick="editorTightenSl29C()">Tighten SL</button>
            </div>

            <div class="atp-editor-ind-toggle-wrap-29c">
              <button id="toggleEma29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('ema')">✅ EMA / Trend</button>
              <button id="toggleRsi29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('rsi')">✅ RSI</button>
              <button id="toggleMacd29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('macd')">✅ MACD</button>
              <button id="toggleBb29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('bb')">✅ Bollinger Bands</button>
              <button id="toggleFvg29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('fvg')">✅ FVG</button>
              <button id="toggleSr29C" class="atp-editor-toggle-29c on" type="button" onclick="editorToggleIndicator29C('sr')">✅ Support / Resistance</button>
            </div>

            <div class="atp-editor-analysis-29c">
              <div class="atp-editor-analysis-grid-29c">
                <div class="atp-editor-analysis-box-29c">
                  <span>Plan Score</span>
                  <b id="editorPlanScore29C">-</b>
                </div>
                <div class="atp-editor-analysis-box-29c">
                  <span>Quality</span>
                  <b id="editorPlanQuality29C">-</b>
                </div>
                <div class="atp-editor-analysis-box-29c">
                  <span>RR TP1</span>
                  <b id="editorPlanRr29C">-</b>
                </div>
              </div>

              <div id="editorReason29C" class="atp-editor-reason-29c">-</div>
            </div>

            <div class="atp-editor-lock-29c">
              <button class="atp-editor-lock-btn-29c" type="button" onclick="lockQuickAtpPlan29C()">🔒 LOCK PLAN</button>
              <button class="atp-editor-lock-btn-29c ghost" type="button" onclick="closeQuickAtpEditor29C()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const badPlaceholder = backdrop.querySelector(".atp-editor-field-29C_PLACEHOLDER");
    if (badPlaceholder) badPlaceholder.remove();

    setInputValue("editorSide29C", quickEditorState.side);
    setInputValue("editorMode29C", quickEditorState.mode);
    syncEditorInputs29C();
    refreshEditor29C();
  };

  window.closeQuickAtpEditor29C = function closeQuickAtpEditor29C() {
    const el = document.getElementById("atpEditorBackdrop29C");
    if (el) el.remove();
  };

  function syncEditorInputs29C() {
    if (!quickEditorState) return;

    setInputValue("editorEntry29C", money(quickEditorState.entry));
    setInputValue("editorSl29C", money(quickEditorState.sl));
    setInputValue("editorTp1_29C", money(quickEditorState.tp1));
    setInputValue("editorTp2_29C", money(quickEditorState.tp2));
    setInputValue("editorTp3_29C", money(quickEditorState.tp3));
    setInputValue("editorNote29C", quickEditorState.note || "");
    setInputValue("editorSide29C", quickEditorState.side);
    setInputValue("editorMode29C", quickEditorState.mode);
  }

  function readEditorInputs29C() {
    if (!quickEditorState) return;

    quickEditorState.side = getSettingValue("editorSide29C", quickEditorState.side);
    quickEditorState.mode = getSettingValue("editorMode29C", quickEditorState.mode);
    quickEditorState.entry = getNumberValue("editorEntry29C", quickEditorState.entry);
    quickEditorState.sl = getNumberValue("editorSl29C", quickEditorState.sl);
    quickEditorState.tp1 = getNumberValue("editorTp1_29C", quickEditorState.tp1);
    quickEditorState.tp2 = getNumberValue("editorTp2_29C", quickEditorState.tp2);
    quickEditorState.tp3 = getNumberValue("editorTp3_29C", quickEditorState.tp3);
    quickEditorState.note = getSettingValue("editorNote29C", "");
  }

  window.editorInputChanged29C = function editorInputChanged29C() {
    readEditorInputs29C();
    refreshEditor29C();
  };

  window.editorChangeSide29C = function editorChangeSide29C() {
    readEditorInputs29C();

    const side = quickEditorState.side;
    const price = Number(latestData?.price || quickEditorState.entry);
    const risk = getEditorRisk29C(quickEditorState.mode);

    quickEditorState.entry = round2(price);

    if (side === "BUY") {
      quickEditorState.sl = round2(price - risk);
      quickEditorState.tp1 = round2(price + risk);
      quickEditorState.tp2 = round2(price + risk * 2);
      quickEditorState.tp3 = round2(price + risk * 3);
    } else {
      quickEditorState.sl = round2(price + risk);
      quickEditorState.tp1 = round2(price - risk);
      quickEditorState.tp2 = round2(price - risk * 2);
      quickEditorState.tp3 = round2(price - risk * 3);
    }

    quickEditorState.entrySource = "Live Current Price";

    const badge = document.getElementById("editorSideBadge29C");
    if (badge) {
      badge.innerText = side;
      badge.className = `atp-editor-badge-29c ${side === "BUY" ? "buy" : "sell"}`;
    }

    syncEditorInputs29C();
    refreshEditor29C();
  };

  window.editorRecalculateTpSl29C = function editorRecalculateTpSl29C() {
    readEditorInputs29C();

    const risk = getEditorRisk29C(quickEditorState.mode);
    const entry = quickEditorState.entry;
    const side = quickEditorState.side;

    if (side === "BUY") {
      quickEditorState.sl = round2(entry - risk);
      quickEditorState.tp1 = round2(entry + risk);
      quickEditorState.tp2 = round2(entry + risk * 2);
      quickEditorState.tp3 = round2(entry + risk * 3);
    } else {
      quickEditorState.sl = round2(entry + risk);
      quickEditorState.tp1 = round2(entry - risk);
      quickEditorState.tp2 = round2(entry - risk * 2);
      quickEditorState.tp3 = round2(entry - risk * 3);
    }

    quickEditorState.entrySource = `${getModeLabel29C(quickEditorState.mode)} Auto TP/SL`;

    syncEditorInputs29C();
    refreshEditor29C();
  };

  window.editorUseCurrentPrice29C = function editorUseCurrentPrice29C() {
    readEditorInputs29C();

    const price = Number(latestData?.price);
    if (!Number.isFinite(price)) return;

    quickEditorState.entry = round2(price);
    quickEditorState.entrySource = "Live Current Price";
    syncEditorInputs29C();
    editorRecalculateTpSl29C();
  };

  window.editorUseSr29C = function editorUseSr29C() {
    readEditorInputs29C();

    const support = Number(latestAnalysis?.support);
    const resistance = Number(latestAnalysis?.resistance);

    if (quickEditorState.side === "BUY" && Number.isFinite(support)) {
      quickEditorState.entry = round2(support);
      quickEditorState.entrySource = "Support Zone";
    }

    if (quickEditorState.side === "SELL" && Number.isFinite(resistance)) {
      quickEditorState.entry = round2(resistance);
      quickEditorState.entrySource = "Resistance Zone";
    }

    syncEditorInputs29C();
    editorRecalculateTpSl29C();
  };

  window.editorUseFvg29C = function editorUseFvg29C() {
    readEditorInputs29C();

    const fvg = latestAnalysis?.nearestFvg;

    if (!fvg || !Number.isFinite(Number(fvg.midpoint))) {
      showToast("ยังไม่มี FVG ใกล้ราคา", "ระบบยังไม่พบ FVG ที่ใช้เป็น Entry ได้", "warning");
      return;
    }

    quickEditorState.entry = round2(Number(fvg.midpoint));
    quickEditorState.entrySource = "Nearest FVG";
    syncEditorInputs29C();
    editorRecalculateTpSl29C();
  };

  window.editorWidenSl29C = function editorWidenSl29C() {
    readEditorInputs29C();

    const side = quickEditorState.side;
    const diff = Math.abs(quickEditorState.entry - quickEditorState.sl);
    const add = Math.max(2, diff * 0.25);

    if (side === "BUY") quickEditorState.sl = round2(quickEditorState.sl - add);
    else quickEditorState.sl = round2(quickEditorState.sl + add);

    syncEditorInputs29C();
    refreshEditor29C();
  };

  window.editorTightenSl29C = function editorTightenSl29C() {
    readEditorInputs29C();

    const side = quickEditorState.side;
    const diff = Math.abs(quickEditorState.entry - quickEditorState.sl);
    const reduce = Math.max(1, diff * 0.20);

    if (side === "BUY") quickEditorState.sl = round2(Math.min(quickEditorState.entry - 0.5, quickEditorState.sl + reduce));
    else quickEditorState.sl = round2(Math.max(quickEditorState.entry + 0.5, quickEditorState.sl - reduce));

    syncEditorInputs29C();
    refreshEditor29C();
  };

  window.editorToggleIndicator29C = function editorToggleIndicator29C(key) {
    if (!quickEditorState) return;

    quickEditorState.indicators[key] = !quickEditorState.indicators[key];

    const map = {
      ema: "toggleEma29C",
      rsi: "toggleRsi29C",
      macd: "toggleMacd29C",
      bb: "toggleBb29C",
      fvg: "toggleFvg29C",
      sr: "toggleSr29C"
    };

    const label = {
      ema: "EMA / Trend",
      rsi: "RSI",
      macd: "MACD",
      bb: "Bollinger Bands",
      fvg: "FVG",
      sr: "Support / Resistance"
    };

    const btn = document.getElementById(map[key]);
    if (btn) {
      btn.classList.toggle("on", quickEditorState.indicators[key]);
      btn.innerText = `${quickEditorState.indicators[key] ? "✅" : "○"} ${label[key]}`;
    }

    refreshEditor29C();
  };

  function getModeLabel29C(mode) {
    if (mode === "fast") return "Scalping";
    if (mode === "safe") return "Swing";
    return "Day Trade";
  }

  function getEditorCandles29C() {
    return Array.isArray(latestChartData) ? latestChartData.slice(-90) : [];
  }

  function analyzeEditorPlan29C() {
    if (!quickEditorState) return null;

    const s = quickEditorState;
    const risk = Math.abs(s.entry - s.sl);
    const rr1 = risk > 0 ? Math.abs(s.tp1 - s.entry) / risk : 0;
    const rr3 = risk > 0 ? Math.abs(s.tp3 - s.entry) / risk : 0;

    let score = 50;
    const reasons = [];
    const cautions = [];

    if (s.side === "BUY" && latestAnalysis?.trend === "UPTREND") {
      score += 12;
      reasons.push("BUY ไปตามเทรนด์หลัก");
    }

    if (s.side === "SELL" && latestAnalysis?.trend === "DOWNTREND") {
      score += 12;
      reasons.push("SELL ไปตามเทรนด์หลัก");
    }

    if (s.side === "BUY" && latestAnalysis?.trend === "DOWNTREND") {
      score -= 12;
      cautions.push("BUY สวนเทรนด์หลัก");
    }

    if (s.side === "SELL" && latestAnalysis?.trend === "UPTREND") {
      score -= 12;
      cautions.push("SELL สวนเทรนด์หลัก");
    }

    const rsiValue = Number(latestAnalysis?.rsi);
    if (s.indicators.rsi && Number.isFinite(rsiValue)) {
      if (rsiValue > 35 && rsiValue < 65) {
        score += 6;
        reasons.push("RSI อยู่ในโซนกลาง ไม่ร้อนแรงเกินไป");
      }

      if (s.side === "BUY" && rsiValue >= 70) {
        score -= 10;
        cautions.push("RSI สูงมาก ระวังไล่ BUY");
      }

      if (s.side === "SELL" && rsiValue <= 30) {
        score -= 10;
        cautions.push("RSI ต่ำมาก ระวังไล่ SELL");
      }
    }

    if (s.indicators.macd) {
      const macdPack = calcMacdFromCandles(getEditorCandles29C());
      const hist = macdPack.latest?.histogram;

      if (Number.isFinite(hist)) {
        if (s.side === "BUY" && hist > 0) {
          score += 7;
          reasons.push("MACD Histogram เป็นบวก สนับสนุน BUY");
        } else if (s.side === "SELL" && hist < 0) {
          score += 7;
          reasons.push("MACD Histogram เป็นลบ สนับสนุน SELL");
        } else {
          score -= 5;
          cautions.push(`MACD ยังไม่สนับสนุน ${s.side}`);
        }
      }
    }

    if (s.indicators.fvg && latestAnalysis?.nearestFvg) {
      const fvg = latestAnalysis.nearestFvg;
      if (s.side === "BUY" && fvg.type === "bullish") {
        score += 8;
        reasons.push("Bullish FVG สนับสนุนฝั่ง BUY");
      } else if (s.side === "SELL" && fvg.type === "bearish") {
        score += 8;
        reasons.push("Bearish FVG สนับสนุนฝั่ง SELL");
      } else {
        cautions.push("FVG ใกล้ราคายังไม่ตรงกับฝั่งของแผน");
      }
    }

    if (rr1 >= 1) {
      score += 8;
      reasons.push("Risk/Reward TP1 คุ้มกว่า 1:1");
    } else {
      score -= 8;
      cautions.push("Risk/Reward TP1 ต่ำกว่า 1:1");
    }

    if (rr3 >= 2) {
      score += 6;
      reasons.push("TP3 ให้ Risk/Reward ระยะไกลที่ดี");
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const quality =
      score >= 80 ? "Strong" :
      score >= 65 ? "Good" :
      score >= 50 ? "Caution" :
      "Risky";

    return {
      score,
      quality,
      rr1: round2(rr1),
      rr3: round2(rr3),
      reasons,
      cautions
    };
  }

  function refreshEditor29C() {
    if (!quickEditorState) return;

    readEditorInputs29C();

    const sub = document.getElementById("editorSubText29C");
    if (sub) {
      sub.innerText = `Entry Source: ${quickEditorState.entrySource} • ${getModeLabel29C(quickEditorState.mode)} • ปรับแผนก่อนกด Lock Plan`;
    }

    const analysis = analyzeEditorPlan29C();

    setText("editorPlanScore29C", analysis ? `${analysis.score}/100` : "-");
    setText("editorPlanQuality29C", analysis?.quality || "-");
    setText("editorPlanRr29C", analysis ? analysis.rr1 : "-");

    const reasonBox = document.getElementById("editorReason29C");
    if (reasonBox && analysis) {
      const reasons = analysis.reasons.length
        ? analysis.reasons.map(x => `✅ ${escapeHtml(x)}`).join("<br>")
        : "✅ ยังไม่มีเหตุผลสนับสนุนเด่น";

      const cautions = analysis.cautions.length
        ? analysis.cautions.map(x => `⚠️ ${escapeHtml(x)}`).join("<br>")
        : "ไม่มีจุดเสี่ยงเด่น";

      reasonBox.innerHTML = `<b>เหตุผล:</b><br>${reasons}<br><br><b>ระวัง:</b><br>${cautions}`;
    }

    drawEditorChart29C();
    drawEditorRsi29C();
    drawEditorMacd29C();
  }

  function drawEditorChart29C() {
    const canvas = document.getElementById("atpEditorChart29C");
    if (!canvas || !quickEditorState) return;

    const candles = getEditorCandles29C();
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);

    if (!candles.length) return;

    const s = quickEditorState;
    const levelPrices = [s.entry, s.sl, s.tp1, s.tp2, s.tp3].map(Number);
    const highs = candles.map(c => Number(c.high));
    const lows = candles.map(c => Number(c.low));
    const closes = candles.map(c => Number(c.close));

    if (s.indicators.sr) {
      if (Number.isFinite(Number(latestAnalysis?.support))) levelPrices.push(Number(latestAnalysis.support));
      if (Number.isFinite(Number(latestAnalysis?.resistance))) levelPrices.push(Number(latestAnalysis.resistance));
    }

    if (s.indicators.fvg && latestAnalysis?.nearestFvg) {
      const fvg = latestAnalysis.nearestFvg;
      levelPrices.push(Number(fvg.top), Number(fvg.bottom));
    }

    const max = Math.max(...highs, ...levelPrices);
    const min = Math.min(...lows, ...levelPrices);
    const range = Math.max(0.01, max - min);

    const padLeft = 112;
    const padRight = 88;
    const padTop = 22;
    const padBottom = 34;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    const xAt = i => padLeft + (i / Math.max(1, candles.length - 1)) * plotW;
    const yAt = p => padTop + ((max - p) / range) * plotH;

    drawGrid(ctx, padLeft, padTop, plotW, plotH);

    if (s.indicators.fvg && latestAnalysis?.nearestFvg) {
      const fvg = latestAnalysis.nearestFvg;
      const yTop = yAt(Number(fvg.top));
      const yBottom = yAt(Number(fvg.bottom));

      ctx.fillStyle = fvg.type === "bullish"
        ? "rgba(0,200,83,.10)"
        : "rgba(255,69,94,.10)";

      ctx.fillRect(padLeft, Math.min(yTop, yBottom), plotW, Math.abs(yBottom - yTop));

      ctx.fillStyle = fvg.type === "bullish" ? "#8effb0" : "#ff9baa";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(`FVG ${fvg.bottom}-${fvg.top}`, padLeft + 8, Math.min(yTop, yBottom) + 16);
    }

    if (s.indicators.bb) {
      const bb = calcBollinger(closes, 20, 2);
      drawBollinger(ctx, bb, xAt, yAt, "rgba(65,145,255,.82)", "rgba(65,145,255,.08)");
    }

    if (s.indicators.ema) {
      const ema21 = emaSeries(closes, 21);
      drawLineSeries(ctx, ema21, xAt, yAt, "rgba(245,197,66,.75)", 1.6);
    }

    const candleW = Math.max(4, Math.floor(plotW / candles.length * 0.55));

    candles.forEach((c, i) => {
      const x = xAt(i);
      const open = Number(c.open);
      const close = Number(c.close);
      const high = Number(c.high);
      const low = Number(c.low);
      const up = close >= open;
      const color = up ? "#00c853" : "#ff455e";

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      ctx.beginPath();
      ctx.moveTo(x, yAt(high));
      ctx.lineTo(x, yAt(low));
      ctx.stroke();

      const yOpen = yAt(open);
      const yClose = yAt(close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(2, Math.abs(yOpen - yClose));

      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    });

    const fakePlan = {
      entry: s.entry,
      sl: s.sl,
      tp1: s.tp1,
      tp2: s.tp2,
      tp3: s.tp3
    };

    drawPlanLevels(ctx, fakePlan, yAt, padLeft, w, padRight, true);

    if (s.indicators.sr) {
      drawSrLine29C(ctx, yAt, padLeft, w, padRight, latestAnalysis?.support, "SUPPORT", "#5bc0ff");
      drawSrLine29C(ctx, yAt, padLeft, w, padRight, latestAnalysis?.resistance, "RESIST", "#ffbf5b");
    }

    const last = candles.at(-1);
    const lastPrice = Number(last.close);
    const yLast = yAt(lastPrice);

    ctx.fillStyle = s.side === "BUY" ? "#00c853" : "#ff455e";
    ctx.fillRect(w - padRight + 8, yLast - 13, 72, 26);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(lastPrice.toFixed(2), w - padRight + 12, yLast + 5);

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "13px sans-serif";
    ctx.fillText("ATP Editor • เปิด/ปิด Indicator แล้วแสดงบนกราฟทันที", padLeft, h - 11);
  }

  function drawSrLine29C(ctx, yAt, padLeft, w, padRight, price, label, color) {
    const p = Number(price);
    if (!Number.isFinite(p)) return;

    const y = yAt(p);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = .70;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(`${label} ${p.toFixed(2)}`, padLeft + 8, y - 5);
  }

  function drawEditorRsi29C() {
    const panel = document.getElementById("editorRsiPanel29C");
    const canvas = document.getElementById("atpEditorRsi29C");

    if (!panel || !canvas || !quickEditorState) return;

    panel.style.display = quickEditorState.indicators.rsi ? "block" : "none";
    if (!quickEditorState.indicators.rsi) return;

    const candles = getEditorCandles29C();
    const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
    const values = calcRsiSeries(closes, 14);
    const latest = values.at(-1);

    setText("editorRsiValue29C", Number.isFinite(latest) ? latest.toFixed(1) : "-");

    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255,255,255,.12)";
    [30, 50, 70].forEach(level => {
      const y = h - (level / 100) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    const xAt = i => (i / Math.max(1, values.length - 1)) * w;
    const yAt = v => h - (v / 100) * h;

    drawLineSeries(ctx, values, xAt, yAt, "#00c853", 2);
  }

  function drawEditorMacd29C() {
    const panel = document.getElementById("editorMacdPanel29C");
    const canvas = document.getElementById("atpEditorMacd29C");

    if (!panel || !canvas || !quickEditorState) return;

    panel.style.display = quickEditorState.indicators.macd ? "block" : "none";
    if (!quickEditorState.indicators.macd) return;

    const pack = calcMacdFromCandles(getEditorCandles29C());
    const latest = pack.latest;

    setText(
      "editorMacdValue29C",
      latest
        ? `${latest.macd.toFixed(2)} / ${latest.signal.toFixed(2)} / ${latest.histogram.toFixed(2)}`
        : "-"
    );

    const ctx = canvas.getContext("2d");
    drawMacdCanvas(ctx, pack, canvas.width, canvas.height);
  }

  window.lockQuickAtpPlan29C = function lockQuickAtpPlan29C() {
    if (!quickEditorState || !latestData) return;

    readEditorInputs29C();

    const s = quickEditorState;
    const activeCount = manualAtpPlans.filter(p =>
      !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED", "DELETED"].includes(p.status)
    ).length;

    if (activeCount >= MAX_MANUAL_ATP) {
      showToast("My ATP เต็มแล้ว", "ตอนนี้ใช้ได้สูงสุด 10 แผน", "danger");
      return;
    }

    if (s.side === "BUY" && !(s.sl < s.entry && s.tp1 > s.entry && s.tp2 > s.tp1 && s.tp3 > s.tp2)) {
      showToast("โครง BUY ไม่ถูกต้อง", "BUY ต้องมี SL ต่ำกว่า Entry และ TP สูงกว่า Entry", "danger");
      return;
    }

    if (s.side === "SELL" && !(s.sl > s.entry && s.tp1 < s.entry && s.tp2 < s.tp1 && s.tp3 < s.tp2)) {
      showToast("โครง SELL ไม่ถูกต้อง", "SELL ต้องมี SL สูงกว่า Entry และ TP ต่ำกว่า Entry", "danger");
      return;
    }

    const analysis = analyzeEditorPlan29C();
    const now = new Date();
    const expireHours = Number(getSettingValue("editorExpire29C", "24"));
    const expiresAt = new Date(now.getTime() + expireHours * 60 * 60 * 1000);
    const currentPrice = Number(latestData.price);

    const entryHit =
      Math.abs(currentPrice - s.entry) <= 0.4 ||
      (s.side === "BUY" && currentPrice <= s.entry) ||
      (s.side === "SELL" && currentPrice >= s.entry);

    const plan = {
      id: `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: "MANUAL_ATP",
      side: s.side,
      mode: s.mode,
      entry: round2(s.entry),
      sl: round2(s.sl),
      tp1: round2(s.tp1),
      tp2: round2(s.tp2),
      tp3: round2(s.tp3),
      note: s.note || `Quick ${s.side} from ${s.entrySource}`,
      status: entryHit ? "ACTIVE" : "WAITING_ENTRY",
      result: "pending",
      hits: {
        entry: entryHit,
        tp1: false,
        tp2: false,
        tp3: false,
        sl: false
      },
      score: analysis?.score ?? 0,
      quality: analysis?.quality ?? "Caution",
      rr1: analysis?.rr1 ?? 0,
      rr3: analysis?.rr3 ?? 0,
      reasons: analysis?.reasons ?? [],
      cautions: analysis?.cautions ?? [],
      indicators: { ...s.indicators },
      entrySource: s.entrySource,
      createdAt: now.toISOString(),
      activatedAt: entryHit ? now.toISOString() : null,
      expiresAt: expiresAt.toISOString(),
      updatedAt: now.toISOString(),
      source: latestData.priceSource || latestData.source || "tv_calibrated_proxy",
      priceOffset: latestData.priceOffset ?? 0,
      rawPrice: latestData.rawPrice ?? null,
      createdPrice: currentPrice,
      lastPrice: currentPrice,
      chartSnapshot: Array.isArray(latestChartData) ? latestChartData.slice(-90) : []
    };

    manualAtpPlans.unshift(plan);
    saveManualAtp();
    updateManualAtpByPrice(currentPrice);
    renderManualAtp();
    drawApiChart(latestChartData);
    closeQuickAtpEditor29C();

    showToast("Lock Plan สำเร็จ", `${plan.side} ${money(plan.entry)} เข้า My ATP แล้ว`, "success");
    playTone("success");

    const target = document.getElementById("section-my-atp");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const originalRender29C = typeof render === "function" ? render : null;

  if (originalRender29C && !window.__quickRenderWrapped29C) {
    window.__quickRenderWrapped29C = true;

    render = function renderWithQuickTrade29C(data) {
      originalRender29C(data);
      attachQuickTradePanel29C();
      updateQuickTradePanel29C();
    };
  }

  window.addEventListener("DOMContentLoaded", () => {
    injectQuickTradeStyles29C();
    attachQuickTradePanel29C();
  });

  window.addEventListener("resize", () => {
    if (document.getElementById("atpEditorBackdrop29C")) {
      refreshEditor29C();
    }
  });

})();
