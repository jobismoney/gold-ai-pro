const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";

// =========================
// LOAD SIGNAL
// =========================
async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}`);
    const data = await res.json();
    render(data);
  } catch (err) {
    console.error("Signal error:", err);
  }
}

// =========================
// RENDER
// =========================
function render(data) {
  const s = data.signal;

  document.getElementById("price").innerText = data.price;
  document.getElementById("signal").innerText = s.signal;
  document.getElementById("confidence").innerText = s.confidence + "%";

  document.getElementById("trend").innerText = s.trend;
  document.getElementById("rsi").innerText = s.rsi;
  document.getElementById("support").innerText = s.support;
  document.getElementById("resistance").innerText = s.resistance;

  document.getElementById("entry").innerText = s.entry;
  document.getElementById("sl").innerText = s.sl || "-";
  document.getElementById("tp1").innerText = s.tp1 || "-";
  document.getElementById("tp2").innerText = s.tp2 || "-";
  document.getElementById("tp3").innerText = s.tp3 || "-";

  document.getElementById("marketStatus").innerText =
    data.market === "open" ? "OPEN" : "CLOSED";

  document.getElementById("demoBadge").style.display =
    data.demo ? "inline-block" : "none";

  const signalEl = document.getElementById("signal");

  if (s.signal === "BUY") signalEl.style.color = "#00c853";
  else if (s.signal === "SELL") signalEl.style.color = "#ff1744";
  else signalEl.style.color = "#999";

  const reasonBox = document.getElementById("reason");
  reasonBox.innerHTML = "";

  s.reason.forEach(r => {
    const div = document.createElement("div");
    div.innerText = "• " + r;
    reasonBox.appendChild(div);
  });
}

// =========================
// MODE
// =========================
function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  document.getElementById(`mode-${mode}`).classList.add("active");

  loadSignal();
}

// =========================
// 🔥 THAI GOLD FIX REAL
// =========================
async function loadThaiGold() {
  try {
    const res = await fetch("https://api.chnwt.dev/thai-gold-api/latest");
    const data = await res.json();

    console.log("Thai Gold RAW:", data);

    const d = data.response;

    // 🔥 ใช้ field ที่ถูกต้องจริง
    const barBuy = d.price.gold.bar.buy;
    const barSell = d.price.gold.bar.sell;
    const jewBuy = d.price.gold.jewelry.buy;
    const jewSell = d.price.gold.jewelry.sell;

    console.log("Parsed:", barBuy, barSell, jewBuy, jewSell);

    document.getElementById("thai_buy").innerText = barBuy;
    document.getElementById("thai_sell").innerText = barSell;
    document.getElementById("thai_buy_jewelry").innerText = jewBuy;
    document.getElementById("thai_sell_jewelry").innerText = jewSell;

  } catch (e) {
    console.log("Thai gold error:", e);
  }
}

// =========================
// INIT
// =========================
window.addEventListener("DOMContentLoaded", () => {
  loadSignal();
  loadThaiGold();
});
