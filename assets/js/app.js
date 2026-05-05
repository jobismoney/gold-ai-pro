console.log("APP JS VERSION 26 LOADED");

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
    showToast("เปิด Admin Panel", "ตั้งค่า Telegram / Sound / VIP ได้ที่นี่", "warning");
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

function formatSource(source) {
  if (!source) return "-";

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
    el.innerText = `Next API update in ${text} | Source: Binance Futures PAXGUSDT`;
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

function render(data) {
  const s = data.currentAnalysis || data.signal || {};
  const activePlan = data.activePlan || s.activePlan || null;
  const learning = data.learning || s.learningStats || {};

  latestData = data;
  latestAnalysis = s;

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
      "ระบบอัปเดตข้อมูลตามรอบ API และใช้ข้อมูลจริงจาก Binance Futures PAXGUSDT";
  }

  const chartSourceText = document.getElementById("chartSourceText");
  if (chartSourceText) {
    chartSourceText.innerText =
      data.dataNotice ||
      "กราฟนี้วาดจาก Binance Futures PAXGUSDT 15m candles";
  }

  const sourceNotice = document.getElementById("sourceNotice");
  if (sourceNotice) {
    sourceNotice.innerText =
      data.proxyNotice ||
      "Gold Proxy Source: Binance Futures PAXGUSDT — อาจต่างจาก XAU/USD Spot/OANDA เล็กน้อย";
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
  ctx.fillText("Binance Futures PAXGUSDT 15m candles", padLeft, h - 12);
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
   PLAN BUILDER + MY ATP
========================= */

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

function generateSuggestedPlan(updateStatus = true) {
  if (!latestAnalysis || !latestData) return;

  const price = Number(latestData.price);
  if (!Number.isFinite(price)) return;

  const mode = getSettingValue("builderMode", "balanced");
  const entryStyle = getSettingValue("builderEntryStyle", "hybrid");
  const riskBase = getBuilderRisk(mode);

  const support = Number(latestAnalysis.support || price - riskBase * 2);
  const resistance = Number(latestAnalysis.resistance || price + riskBase * 2);
  const fvg = latestAnalysis.nearestFvg;

  let entry = price;

  if (entryStyle === "support_resistance") {
    entry = builderSide === "BUY" ? support : resistance;
  }

  if (entryStyle === "fvg" && fvg) {
    entry = Number(fvg.midpoint || ((Number(fvg.top) + Number(fvg.bottom)) / 2));
  }

  if (entryStyle === "hybrid") {
    if (isChecked("indFvg") && fvg && Number.isFinite(Number(fvg.midpoint))) {
      entry = Number(fvg.midpoint);
    } else if (isChecked("indSr")) {
      entry = builderSide === "BUY" ? support : resistance;
    } else {
      entry = price;
    }
  }

  if (!Number.isFinite(entry)) entry = price;

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
    setText("builderStatus", "ระบบคำนวณแผนใหม่แล้ว");
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
    const rsi = Number(latestAnalysis.rsi || 50);

    if (side === "BUY" && rsi > 35 && rsi < 65) {
      score += 6;
      reasons.push("RSI อยู่ในโซนที่ยังพอสนับสนุน BUY ได้");
    } else if (side === "SELL" && rsi > 35 && rsi < 65) {
      score += 6;
      reasons.push("RSI อยู่ในโซนที่ยังพอสนับสนุน SELL ได้");
    }

    if (side === "BUY" && rsi >= 70) {
      score -= 12;
      cautions.push("BUY ขณะ RSI สูงมาก ระวังไล่ราคา");
    }

    if (side === "SELL" && rsi <= 30) {
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
    !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED"].includes(p.status)
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
    source: latestData.priceSource || latestData.source || "binance_futures_paxgusdt",
    createdPrice: Number(latestData.price)
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
    if (["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED"].includes(plan.status)) {
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
  const list = document.getElementById("manualAtpList");
  if (!list) return;

  const activeCount = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "CANCELLED", "EXPIRED"].includes(p.status)
  ).length;

  setText("myAtpCountBadge", `${activeCount}/${MAX_MANUAL_ATP}`);
  setText("myAtpLimitText", `${activeCount}/${MAX_MANUAL_ATP}`);

  renderManualStats();

  if (!manualAtpPlans.length) {
    list.innerHTML = `<div class="note">ยังไม่มี My ATP กด Add to My ATP จาก Plan Builder เพื่อเริ่มเก็บแผน</div>`;
    return;
  }

  list.innerHTML = "";

  manualAtpPlans.forEach(plan => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "12px";
    card.style.padding = "16px";

    const statusColor =
      plan.status === "TP3_HIT" ? "#00c853" :
      plan.status === "SL_HIT" ? "#ff455e" :
      plan.status === "EXPIRED" ? "#9aa3b2" :
      plan.status === "CANCELLED" ? "#9aa3b2" :
      plan.status.includes("TP") ? "#8effb0" :
      plan.status === "ACTIVE" ? "#f5c542" :
      "#cbd2df";

    card.innerHTML = `
      <div class="section-head compact" style="margin-bottom:12px;">
        <div>
          <h2 style="font-size:20px;">
            ${escapeHtml(plan.side)} ${money(plan.entry)}
          </h2>
          <p>
            ${escapeHtml(plan.mode)} • Score ${plan.score}/100 • ${escapeHtml(plan.quality)}
          </p>
        </div>
        <div class="section-head-right">
          <div class="lock-badge" style="color:${statusColor};">${escapeHtml(plan.status)}</div>
          <button class="collapse-btn" type="button" onclick="cancelManualAtp('${plan.id}')">ปิด</button>
        </div>
      </div>

      <div class="plan-strip">
        <div><span>Entry</span><b>${hitIcon(plan.hits.entry)} ${money(plan.entry)}</b></div>
        <div><span>SL</span><b>${hitIcon(plan.hits.sl)} ${money(plan.sl)}</b></div>
        <div><span>TP1</span><b>${hitIcon(plan.hits.tp1)} ${money(plan.tp1)}</b></div>
        <div><span>TP2</span><b>${hitIcon(plan.hits.tp2)} ${money(plan.tp2)}</b></div>
        <div><span>TP3</span><b>${hitIcon(plan.hits.tp3)} ${money(plan.tp3)}</b></div>
      </div>

      <div class="mini-grid" style="margin-top:12px;">
        <div class="mini-card"><span>Result</span><b>${escapeHtml(plan.result || "-")}</b></div>
        <div class="mini-card"><span>RR TP1</span><b>${plan.rr1 ?? "-"}</b></div>
        <div class="mini-card"><span>RR TP3</span><b>${plan.rr3 ?? "-"}</b></div>
        <div class="mini-card"><span>Last Price</span><b>${plan.lastPrice ? money(plan.lastPrice) : "-"}</b></div>
        <div class="mini-card"><span>Created</span><b>${formatThaiDateTime(plan.createdAt)}</b></div>
        <div class="mini-card"><span>Expires</span><b>${formatThaiDateTime(plan.expiresAt)}</b></div>
      </div>

      ${plan.note ? `<div class="note" style="margin-top:12px;">Note: ${escapeHtml(plan.note)}</div>` : ""}

      <div class="two-col" style="margin-top:12px;">
        <div class="reason-list">
          <b>เหตุผลสนับสนุน</b>
          ${(plan.reasons || []).slice(0, 4).map(r => `<div>• ${escapeHtml(r)}</div>`).join("") || "<div>-</div>"}
        </div>
        <div class="reason-list">
          <b>จุดที่ต้องระวัง</b>
          ${(plan.cautions || []).slice(0, 4).map(r => `<div>• ${escapeHtml(r)}</div>`).join("") || "<div>-</div>"}
        </div>
      </div>
    `;

    list.appendChild(card);
  });
}

function hitIcon(value) {
  return value ? "✅" : "○";
}

function renderManualStats() {
  const total = manualAtpPlans.length;
  const active = manualAtpPlans.filter(p =>
    ["WAITING_ENTRY", "ACTIVE", "TP1_HIT", "TP2_HIT"].includes(p.status)
  ).length;

  const closed = manualAtpPlans.filter(p =>
    ["TP3_HIT", "SL_HIT", "EXPIRED", "CANCELLED"].includes(p.status)
  );

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

    if (["TP3_HIT", "SL_HIT", "EXPIRED", "CANCELLED"].includes(plan.status)) {
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
  showToast("ปิด My ATP แล้ว", "แผนนี้ถูกบันทึกเป็น CANCELLED", "warning");
}

function clearClosedManualPlans() {
  manualAtpPlans = manualAtpPlans.filter(p =>
    !["TP3_HIT", "SL_HIT", "EXPIRED", "CANCELLED"].includes(p.status)
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

/* =========================
   AUTO REFRESH
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

window.addEventListener("resize", () => {
  drawApiChart(latestChartData);
});

window.addEventListener("DOMContentLoaded", () => {
  loadSoundSetting();
  loadManualAtp();
  updateModeLabel();
  renderManualAtp();
  loadSignal();
  loadThaiGold();
  startAutoRefresh();
});
