const API_URL = "https://white-fog-ba70.porapat-su1975.workers.dev";

let currentMode = "balanced";

const el = {
  price: document.getElementById("price"),
  signal: document.getElementById("signal"),
  confidence: document.getElementById("confidence"),
  trend: document.getElementById("trend"),
  rsi: document.getElementById("rsi"),
  support: document.getElementById("support"),
  resistance: document.getElementById("resistance"),
  reason: document.getElementById("reason"),
  entry: document.getElementById("entry"),
  sl: document.getElementById("sl"),
  tp1: document.getElementById("tp1"),
  tp2: document.getElementById("tp2"),
  tp3: document.getElementById("tp3"),
  market: document.getElementById("marketStatus"),
  demo: document.getElementById("demoBadge")
};

// 🔥 โหลดข้อมูล
async function loadSignal() {
  try {
    const res = await fetch(`${API_URL}?mode=${currentMode}`);
    const data = await res.json();

    render(data);

  } catch (err) {
    console.error(err);
  }
}

// 🔥 แสดงผล
function render(data) {
  const s = data.signal;

  el.price.innerText = data.price;
  el.signal.innerText = s.signal;
  el.confidence.innerText = s.confidence + "%";

  el.trend.innerText = s.trend;
  el.rsi.innerText = s.rsi;

  el.support.innerText = s.support;
  el.resistance.innerText = s.resistance;

  el.entry.innerText = s.entry;
  el.sl.innerText = s.sl || "-";
  el.tp1.innerText = s.tp1 || "-";
  el.tp2.innerText = s.tp2 || "-";
  el.tp3.innerText = s.tp3 || "-";

  el.market.innerText = data.market === "open" ? "OPEN" : "CLOSED";

  // Demo badge
  el.demo.style.display = data.demo ? "inline-block" : "none";

  // สี signal
  if (s.signal === "BUY") {
    el.signal.style.color = "#00c853";
  } else if (s.signal === "SELL") {
    el.signal.style.color = "#ff1744";
  } else {
    el.signal.style.color = "#999";
  }

  // reason
  el.reason.innerHTML = "";
  s.reason.forEach(r => {
    const li = document.createElement("div");
    li.innerText = "• " + r;
    el.reason.appendChild(li);
  });
}

// 🔥 เปลี่ยนโหมด
function setMode(mode) {
  currentMode = mode;

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  document.getElementById(`mode-${mode}`).classList.add("active");

  loadSignal();
}

// 🔥 initial load
loadSignal();
