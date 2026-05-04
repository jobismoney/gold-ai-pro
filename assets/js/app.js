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
  const s = data.signal;

  setText("price", data.price);
  setText("signal", s.signal);
  setText("confidence", s.confidence + "%");
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

function findNumberLike(obj, keywords) {
  const results = [];

  function walk(value, path = "") {
    if (value === null || value === undefined) return;

    if (typeof value === "object") {
      Object.keys(value).forEach(key => {
        walk(value[key], path ? `${path}.${key}` : key);
      });
      return;
    }

    const text = String(value);
    const pathLower = path.toLowerCase();

    const matchKeyword = keywords.some(k => pathLower.includes(k));
    const hasNumber = /[0-9]/.test(text);

    if (matchKeyword && hasNumber) {
      results.push({ path, value: text });
    }
  }

  walk(obj);
  return results;
}

async function loadThaiGold() {
  try {
    const res = await fetch("https://api.chnwt.dev/thai-gold-api/latest");
    const data = await res.json();

    console.log("Thai Gold RAW:", data);

    const found = findNumberLike(data, [
      "buy",
      "sell",
      "bid",
      "ask",
      "bar",
      "jewelry",
      "ornament",
      "ทอง"
    ]);

    console.log("Thai Gold FOUND:", found);

    let barBuy = "-";
    let barSell = "-";
    let jewBuy = "-";
    let jewSell = "-";

    const textAll = JSON.stringify(data);

    const nums = textAll.match(/\d{2,3},?\d{3}(?:\.\d+)?/g) || [];

    if (nums.length >= 4) {
      barBuy = nums[0];
      barSell = nums[1];
      jewBuy = nums[2];
      jewSell = nums[3];
    }

    // ถ้าเจอ path ที่ชัดกว่า ใช้ก่อน
    const byPath = (words) => {
      const item = found.find(x =>
        words.every(w => x.path.toLowerCase().includes(w))
      );
      return item ? item.value : null;
    };

    barBuy = byPath(["bar", "buy"]) || byPath(["ทองแท่ง", "buy"]) || barBuy;
    barSell = byPath(["bar", "sell"]) || byPath(["ทองแท่ง", "sell"]) || barSell;
    jewBuy = byPath(["jewelry", "buy"]) || byPath(["ornament", "buy"]) || byPath(["รูปพรรณ", "buy"]) || jewBuy;
    jewSell = byPath(["jewelry", "sell"]) || byPath(["ornament", "sell"]) || byPath(["รูปพรรณ", "sell"]) || jewSell;

    console.log("Thai Gold Parsed:", {
      barBuy,
      barSell,
      jewBuy,
      jewSell
    });

    setText("thai_buy", barBuy);
    setText("thai_sell", barSell);
    setText("thai_buy_jewelry", jewBuy);
    setText("thai_sell_jewelry", jewSell);

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
