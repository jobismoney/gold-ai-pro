console.log("APP JS VERSION 10 LOADED");

const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.innerText = value ?? "-";
}

async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}`);
    const data = await res.json();
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
