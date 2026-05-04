console.log("APP JS VERSION 11 LOADED");

const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
}

function formatThaiDateTime(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH", {
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
    return value;
  }
}

function formatSource(source) {
  if (!source) return "-";

  if (source.includes("twelve_data_real")) return "Real Candles";
  if (source.includes("twelve_data_cache")) return "Real Cache";
  if (source.includes("demo")) return "Demo/Fallback";

  return source;
}

async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}`);
    const data = await res.json();
    console.log("SIGNAL DATA:", data);
    render(data);
  } catch (err) {
    console.error("Signal error:", err);
  }
}

function render(data) {
  const s = data.signal || {};

  setText("price", data.price);
  setText("signal", s.signal);
  setText("confidence", (s.confidence ?? "-") + "%");
  setText("trend", s.trend);
  setText("rsi", s.rsi);
  setText("support", s.support);
  setText("resistance", s.resistance);
  setText("entry", s.entry);
  setText("sl", s.sl || "-");
  setText("tp1", s.tp1 || "-");
  setText("tp2", s.tp2 || "-");
  setText("tp3", s.tp3 || "-");

  setText("marketStatus", data.market === "open" ? "OPEN" : "CLOSED");

  // Timing
  setText("signalTime", formatThaiDateTime(s.signalTime));
  setText("validUntil", formatThaiDateTime(s.validUntil));
  setText("nextCheck", formatThaiDateTime(s.nextCheck));
  setText("candleInterval", s.candleInterval || "-");
  setText("signalSource", formatSource(s.source));

  const validNote = document.getElementById("validNote");
  if (validNote) {
    validNote.innerText = s.validNote || "ใช้ดูภายในแท่ง 15m นี้ หรือจนกว่าจะมีสัญญาณใหม่ / ราคาแตะ SL หรือ TP";
  }

  const demo = document.getElementById("demoBadge");
  if (demo) demo.style.display = data.demo ? "inline-block" : "none";

  const signalEl = document.getElementById("signal");
  if (signalEl) {
    if (s.signal === "BUY") signalEl.style.color = "#00c853";
    else if (s.signal === "SELL") signalEl.style.color = "#ff1744";
    else signalEl.style.color = "#999";
  }

  const reasonBox = document.getElementById("reason");
  if (reasonBox) {
    reasonBox.innerHTML = "";

    if (s.reason && s.reason.length) {
      s.reason.forEach(r => {
        const div = document.createElement("div");
        div.innerText = "• " + r;
        reasonBox.appendChild(div);
      });
    } else {
      reasonBox.innerText = "-";
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

window.addEventListener("DOMContentLoaded", () => {
  loadSignal();
  loadThaiGold();
});
