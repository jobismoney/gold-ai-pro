console.log("APP JS VERSION 21 LOADED");

const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";
let autoRefreshTimer = null;
let countdownTimer = null;
let nextRefreshAt = null;

const AUTO_REFRESH_SECONDS = 60;

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
}

function getSettingValue(id, fallback) {
  const node = document.getElementById(id);
  return node?.value || fallback;
}

function getAdminKey() {
  const key = getSettingValue("adminKey", "").trim();
  return key;
}

function requireAdminKey() {
  const key = getAdminKey();

  if (!key) {
    alert("กรุณาใส่ Admin Key ก่อน");
    return null;
  }

  return key;
}

function toggleAdminPanel() {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;

  panel.style.display = panel.style.display === "none" ? "block" : "none";
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

    if (isNaN(d.getTime())) {
      return String(value);
    }

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

function addMinutesToIso(value, minutes) {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + minutes * 60 * 1000).toISOString();
  } catch (e) {
    return null;
  }
}

function formatSource(source) {
  if (!source) return "-";

  if (source.includes("twelve_data_real")) return "Real Candles";
  if (source.includes("twelve_data_cache")) return "Real Cache";
  if (source.includes("demo")) return "Demo/Fallback";

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

function updateAutoRefreshStatus() {
  const el = document.getElementById("autoRefreshStatus");
  if (!el || !nextRefreshAt) return;

  const remainMs = nextRefreshAt - Date.now();
  const remainSec = Math.max(0, Math.ceil(remainMs / 1000));

  el.innerText = `Auto refresh: ${remainSec}s | API cache: 5 min`;
}

function resetRefreshCountdown() {
  nextRefreshAt = Date.now() + AUTO_REFRESH_SECONDS * 1000;
  updateAutoRefreshStatus();
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

async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}&t=${Date.now()}`);
    const data = await res.json();

    console.log("SIGNAL DATA:", data);

    render(data);
    resetRefreshCountdown();

  } catch (err) {
    console.error("Signal error:", err);
    setText("marketStatus", "ERROR");
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

    const res = await fetch(url);
    const data = await res.json();

    console.log("VIP ALERT DATA:", data);

    if (data.reason === "unauthorized_admin_key") {
      if (statusEl) statusEl.innerText = "VIP Alert: ❌ Admin Key ไม่ถูกต้อง";
      alert("❌ Admin Key ไม่ถูกต้อง");
      return;
    }

    render(data);
    resetRefreshCountdown();

    const reasonText = formatTelegramReason(data.telegramReason);

    if (data.telegram === true) {
      if (statusEl) {
        statusEl.innerText = `VIP Alert: ✅ sent | Min ${minConf}% | Cooldown ${cooldown}m`;
      }

      alert("✅ ส่ง VIP Signal เข้า Telegram แล้ว");
    } else {
      if (statusEl) {
        statusEl.innerText = "VIP Alert: " + reasonText;
      }

      alert("ℹ️ ยังไม่ส่ง Telegram\n\nเหตุผล: " + reasonText);
    }

  } catch (err) {
    console.error("VIP alert error:", err);

    if (statusEl) {
      statusEl.innerText = "VIP Alert: ❌ connection error";
    }

    alert("❌ VIP Alert error");
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
      `${API_URL}?mode=test-telegram&admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`
    );

    const data = await res.json();

    console.log("TELEGRAM TEST:", data);

    if (data.reason === "unauthorized_admin_key") {
      if (statusEl) statusEl.innerText = "Telegram: ❌ Admin Key ไม่ถูกต้อง";
      alert("❌ Admin Key ไม่ถูกต้อง");
      return;
    }

    if (data.ok === true) {
      if (statusEl) {
        statusEl.innerText = "Telegram: ✅ test sent successfully";
      }

      alert("✅ ส่งข้อความทดสอบเข้า Telegram สำเร็จ");
    } else {
      if (statusEl) {
        statusEl.innerText = `Telegram: ❌ ${data.reason || "test failed"}`;
      }

      alert("❌ ส่ง Telegram ไม่สำเร็จ: " + (data.reason || data.message || "unknown"));
    }

  } catch (err) {
    console.error("Telegram test error:", err);

    if (statusEl) {
      statusEl.innerText = "Telegram: ❌ connection error";
    }

    alert("❌ Telegram test error");
  }
}

async function resetActivePlan() {
  const statusEl = document.getElementById("resetActiveStatus");
  const adminKey = requireAdminKey();

  if (!adminKey) return;

  if (!confirm("ต้องการ Reset Active Trade Plan ใช่ไหม?")) {
    return;
  }

  try {
    if (statusEl) {
      statusEl.innerText = "Active Plan Reset: resetting...";
    }

    const res = await fetch(
      `${API_URL}/reset-active-plan?admin_key=${encodeURIComponent(adminKey)}&t=${Date.now()}`
    );

    const data = await res.json();

    console.log("RESET ACTIVE PLAN:", data);

    if (data.ok === true) {
      if (statusEl) {
        statusEl.innerText = "Active Plan Reset: ✅ done";
      }

      alert("✅ Reset Active Plan สำเร็จ");
      loadSignal();
    } else {
      if (statusEl) {
        statusEl.innerText = `Active Plan Reset: ❌ ${data.reason || "failed"}`;
      }

      alert("❌ Reset ไม่สำเร็จ: " + (data.reason || data.message || "unknown"));
    }

  } catch (err) {
    console.error("Reset active plan error:", err);

    if (statusEl) {
      statusEl.innerText = "Active Plan Reset: ❌ connection error";
    }

    alert("❌ Reset Active Plan error");
  }
}

function render(data) {
  const s = data.currentAnalysis || data.signal || {};
  const activePlan = data.activePlan || s.activePlan || null;
  const learning = data.learning || s.learningStats || {};

  setText("price", data.price);
  setText("signal", s.signal);
  setText("confidence", (s.confidence ?? "-") + "%");

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

  setText("entry", s.entry);
  setText("sl", s.sl || "-");
  setText("tp1", s.tp1 || "-");
  setText("tp2", s.tp2 || "-");
  setText("tp3", s.tp3 || "-");

  setText("marketStatus", data.market === "open" ? "OPEN" : "CLOSED");

  const baseTime =
    s.signalTime ||
    data.updated ||
    new Date().toISOString();

  const validUntil =
    s.validUntil ||
    addMinutesToIso(baseTime, 15);

  const nextCheck =
    s.nextCheck ||
    addMinutesToIso(baseTime, data.apiCacheMinutes || 5);

  setText("signalTime", formatThaiDateTime(baseTime));
  setText("validUntil", formatThaiDateTime(validUntil));
  setText("nextCheck", formatThaiDateTime(nextCheck));
  setText("candleInterval", s.candleInterval || "15min");
  setText("signalSource", formatSource(s.source || data.source));

  const validNote = document.getElementById("validNote");
  if (validNote) {
    validNote.innerText =
      s.validNote ||
      "Current Analysis เปลี่ยนได้ แต่ Active Trade Plan จะล็อกจนกว่า TP1 / SL / Expired";
  }

  renderActivePlan(activePlan);

  setText("memoryType", learning.memoryType || "-");
  setText("totalSignals", learning.totalSignals ?? 0);
  setText("pendingSignals", learning.pending ?? 0);
  setText("totalFinished", learning.totalFinished ?? 0);
  setText("wins", learning.wins ?? 0);
  setText("losses", learning.losses ?? 0);
  setText("winRate", learning.winRate === null || learning.winRate === undefined ? "-" : `${learning.winRate}%`);

  const learningNote = document.getElementById("learningNote");
  if (learningNote) {
    learningNote.innerText =
      learning.note ||
      "Learning จะเริ่มมีผลเมื่อมีข้อมูลย้อนหลังมากพอ";
  }

  const demo = document.getElementById("demoBadge");
  if (demo) {
    demo.style.display = data.demo ? "inline-block" : "none";
  }

  const signalEl = document.getElementById("signal");
  if (signalEl) {
    if (s.signal === "BUY") signalEl.style.color = "#00c853";
    else if (s.signal === "SELL") signalEl.style.color = "#ff1744";
    else signalEl.style.color = "#999";
  }

  const confidenceEl = document.getElementById("confidence");
  if (confidenceEl) {
    const conf = Number(s.confidence || 0);

    if (conf >= 80) {
      confidenceEl.innerText = `${conf}% | Strong`;
    } else if (conf >= 70) {
      confidenceEl.innerText = `${conf}% | Medium`;
    } else if (conf > 0) {
      confidenceEl.innerText = `${conf}% | Weak`;
    } else {
      confidenceEl.innerText = "-";
    }
  }

  const qualityEl = document.getElementById("signalQuality");
  if (qualityEl) {
    if (s.signalQuality === "A_STRONG") qualityEl.style.color = "#00c853";
    else if (s.signalQuality === "B_MEDIUM") qualityEl.style.color = "#f5c542";
    else qualityEl.style.color = "#ff9800";
  }

  const aiScoreEl = document.getElementById("aiScore");
  if (aiScoreEl) {
    const score = Number(s.aiScore || 0);

    if (score >= 75) aiScoreEl.style.color = "#00c853";
    else if (score >= 60) aiScoreEl.style.color = "#f5c542";
    else aiScoreEl.style.color = "#ff9800";
  }

  const vipAllowedEl = document.getElementById("vipAllowed");
  if (vipAllowedEl) {
    vipAllowedEl.style.color = s.vipAllowed ? "#00c853" : "#ff9800";
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

    if (activeStatus) activeStatus.style.color = "#999";
    if (activeSignal) activeSignal.style.color = "#999";
    if (activeNote) {
      activeNote.innerText = "ยังไม่มี Active Trade Plan เพราะระบบยังไม่พบสัญญาณ BUY/SELL ที่คุณภาพผ่าน";
    }

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
    if (plan.status === "ACTIVE") activeStatus.style.color = "#f5c542";
    else if (plan.status === "TP1_HIT") activeStatus.style.color = "#00c853";
    else if (plan.status === "SL_HIT") activeStatus.style.color = "#ff1744";
    else activeStatus.style.color = "#999";
  }

  if (activeSignal) {
    if (plan.signal === "BUY") activeSignal.style.color = "#00c853";
    else if (plan.signal === "SELL") activeSignal.style.color = "#ff1744";
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
}

function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  const activeBtn = document.getElementById(`mode-${mode}`);
  if (activeBtn) activeBtn.classList.add("active");

  loadSignal();
}

async function loadThaiGold() {
  try {
    const res = await fetch("https://api.chnwt.dev/thai-gold-api/latest");
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
  }, AUTO_REFRESH_SECONDS * 1000);

  countdownTimer = setInterval(() => {
    updateAutoRefreshStatus();
  }, 1000);

  resetRefreshCountdown();
}

window.addEventListener("DOMContentLoaded", () => {
  loadSignal();
  loadThaiGold();
  startAutoRefresh();
});
