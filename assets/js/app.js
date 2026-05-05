console.log("APP JS VERSION 25 LOADED");

const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";
let autoRefreshTimer = null;
let countdownTimer = null;
let nextApiUpdateAt = null;

const API_REFRESH_SECONDS = 30;

let previousPrice = null;
let previousSignal = null;
let previousActiveStatus = null;
let soundEnabled = true;
let latestChartData = [];

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
}

function getSettingValue(id, fallback) {
  const node = document.getElementById(id);
  return node?.value || fallback;
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
    current_signal_wait: "ไม่ส่ง เพราะ Current Analysis เป็น WAIT",
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

      showToast("Reset Active Plan สำเร็จ", "ระบบล้างแผนที่ล็อกไว้แล้ว", "success");
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
      activeNote.innerText = "ยังไม่มี Active Trade Plan เพราะระบบยังไม่พบสัญญาณ BUY/SELL ที่คุณภาพผ่าน";
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
      activeNote.innerText = "แผนนี้ถูกล็อกไว้แล้ว Entry / SL / TP จะไม่เปลี่ยนจนกว่า TP1 / SL / Expired";
    } else if (plan.status === "TP1_HIT") {
      activeNote.innerText = "แผนนี้จบแล้ว: ราคาแตะ TP1";
    } else if (plan.status === "SL_HIT") {
      activeNote.innerText = "แผนนี้จบแล้ว: ราคาแตะ SL";
    } else if (plan.status === "EXPIRED") {
      activeNote.innerText = "แผนนี้หมดเวลาแล้ว: ยังไม่แตะ TP1 หรือ SL ภายในช่วงที่กำหนด";
    } else {
      activeNote.innerText = "Active Trade Plan มีสถานะล่าสุดตามที่แสดง";
    }
  }

  if (previousActiveStatus && previousActiveStatus !== plan.status) {
    if (plan.status === "TP1_HIT") {
      showToast("TP1 Hit", "Active Trade Plan ทำกำไรถึงเป้าแรกแล้ว", "success");
      playTone("success");
    } else if (plan.status === "SL_HIT") {
      showToast("SL Hit", "Active Trade Plan แตะ Stop Loss", "danger");
      playTone("danger");
    } else if (plan.status === "EXPIRED") {
      showToast("Plan Expired", "แผนหมดเวลาโดยยังไม่ถึง TP1/SL", "warning");
    } else if (plan.status === "ACTIVE") {
      showToast("New Active Plan", `${plan.signal} plan locked`, "success");
      playTone("info");
    }
  } else if (!previousActiveStatus && plan.status === "ACTIVE") {
    showToast("New Active Plan", `${plan.signal} plan locked`, "success");
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

  ctx.fillStyle = "#9aa3b2";
  ctx.font = "13px sans-serif";
  ctx.fillText("Binance Futures PAXGUSDT 15m candles", padLeft, h - 12);
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

window.addEventListener("resize", () => {
  drawApiChart(latestChartData);
});

window.addEventListener("DOMContentLoaded", () => {
  loadSoundSetting();
  updateModeLabel();
  loadSignal();
  loadThaiGold();
  startAutoRefresh();
});
