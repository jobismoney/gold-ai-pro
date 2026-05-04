console.log("APP JS VERSION 20 LOADED");

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
    vip_quality_filter_blocked: "ไม่ส่ง เพราะ Smart Filter ยังไม่อนุญาตให้ส่ง VIP"
  };

  return map[reason] || reason || "ไม่ทราบสาเหตุ";
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

function render(data) {
  const s = data.signal || {};
  const learning = data.learning || s.learningStats || {};

  setText("price", data.price);
  setText("signal", s.signal);
  setText("confidence", (s.confidence ?? "-") + "%");

  // Smart Engine v2
  setText("engine", s.engine || "-");
  setText("signalQuality", formatQuality(s.signalQuality));
  setText("aiScore", s.aiScore !== undefined ? `${s.aiScore}/100` : "-");
  setText("vipAllowed", formatYesNo(s.vipAllowed));
  setText("riskReward", s.riskReward ?? "-");

  // Market Structure
  setText("trend", s.trend);
  setText("rsi", s.rsi);
  setText("support", s.support);
  setText("resistance", s.resistance);
  setText("buyScore", s.buyScore);
  setText("sellScore", s.sellScore);
  setText("fibZone", s.fibZone);
  setText("trap", s.trap);

  // Trade Plan
  setText("entry", s.entry);
  setText("sl", s.sl || "-");
  setText("tp1", s.tp1 || "-");
  setText("tp2", s.tp2 || "-");
  setText("tp3", s.tp3 || "-");

  // Market status
  setText("marketStatus", data.market === "open" ? "OPEN" : "CLOSED");

  // Timing
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
      "ใช้ดูภายในแท่ง 15m นี้ หรือจนกว่าจะมีสัญญาณใหม่ / ราคาแตะ SL หรือ TP";
  }

  // Learning Stats
  setText("memoryType", learning.memoryType || "-");
  setText("totalSignals", learning.totalSignals ?? 0);
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

  // Quality color
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
