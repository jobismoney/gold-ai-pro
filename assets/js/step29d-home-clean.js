/* =========================================================
   Gold AI Pro - Step 29D Home Clean
   File: assets/js/step29d-home-clean.js

   หน้าที่ของไฟล์นี้:
   1) จัดหน้า Home ให้ดูสะอาดขึ้น
   2) ย้ายปุ่ม Buy / Sell ไปไว้ใต้กราฟ
   3) ซ่อนเส้น TP / SL ที่ทับบนกราฟ
   4) เพิ่มปุ่มเปิด/ปิด Indicator Panel
   5) ไม่ลบระบบเดิม ไม่แตะ Worker ไม่แตะ Telegram
========================================================= */

(function () {
  "use strict";

  console.log("STEP 29D HOME CLEAN LOADED");

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function $all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function injectStyle() {
    if ($("#step29d-style")) return;

    const style = document.createElement("style");
    style.id = "step29d-style";
    style.innerHTML = `
      .step29d-home-wrap {
        width: 100%;
      }

      .step29d-chart-actions {
        width: 100%;
        margin-top: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .step29d-buy-sell-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        width: 100%;
      }

      .step29d-buy-btn,
      .step29d-sell-btn {
        border: none;
        border-radius: 16px;
        padding: 14px 16px;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        color: #ffffff;
        box-shadow: 0 12px 30px rgba(0,0,0,.25);
      }

      .step29d-buy-btn {
        background: linear-gradient(135deg, #16a34a, #22c55e);
      }

      .step29d-sell-btn {
        background: linear-gradient(135deg, #dc2626, #ef4444);
      }

      .step29d-indicator-toggle {
        width: 100%;
        border: 1px solid rgba(148,163,184,.25);
        background: rgba(15,23,42,.78);
        color: #e5e7eb;
        border-radius: 16px;
        padding: 13px 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
      }

      .step29d-indicator-panel {
        display: none;
        border: 1px solid rgba(148,163,184,.22);
        background: rgba(15,23,42,.70);
        border-radius: 18px;
        padding: 14px;
        color: #e5e7eb;
      }

      .step29d-indicator-panel.active {
        display: block;
      }

      .step29d-indicator-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .step29d-indicator-item {
        border: 1px solid rgba(148,163,184,.18);
        background: rgba(2,6,23,.35);
        border-radius: 14px;
        padding: 10px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }

      .step29d-indicator-name {
        color: #cbd5e1;
        font-weight: 700;
      }

      .step29d-indicator-status {
        color: #38bdf8;
        font-weight: 800;
      }

      .step29d-hidden-tpsl {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      @media (max-width: 640px) {
        .step29d-buy-sell-row {
          grid-template-columns: 1fr;
        }

        .step29d-indicator-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function findChartArea() {
    const possibleSelectors = [
      "#tradingview-chart",
      "#chart",
      "#chartBox",
      "#chartContainer",
      ".tradingview-widget-container",
      ".chart-container",
      ".chart-box",
      ".tv-chart"
    ];

    for (const selector of possibleSelectors) {
      const el = $(selector);
      if (el) return el;
    }

    const iframe = $("iframe");
    if (iframe) return iframe.parentElement || iframe;

    return null;
  }

  function hideTpSlLines() {
    const keywords = [
      "tp",
      "sl",
      "take-profit",
      "takeprofit",
      "stop-loss",
      "stoploss",
      "target-line",
      "entry-line",
      "signal-line"
    ];

    const all = $all("body *");

    all.forEach((el) => {
      const id = (el.id || "").toLowerCase();
      const cls = (el.className || "").toString().toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();

      const looksLikeTpSl =
        keywords.some((key) => id.includes(key)) ||
        keywords.some((key) => cls.includes(key)) ||
        text === "tp" ||
        text === "sl" ||
        text.includes("take profit") ||
        text.includes("stop loss");

      if (looksLikeTpSl) {
        const tag = el.tagName.toLowerCase();

        if (
          tag === "canvas" ||
          tag === "svg" ||
          cls.includes("line") ||
          id.includes("line") ||
          text === "tp" ||
          text === "sl" ||
          text.includes("take profit") ||
          text.includes("stop loss")
        ) {
          el.classList.add("step29d-hidden-tpsl");
        }
      }
    });
  }

  function findExistingBuySellButtons() {
    const buttons = $all("button, a, div");

    let buy = null;
    let sell = null;

    buttons.forEach((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();

      if (!buy && (text === "buy" || text.includes("buy") || cls.includes("buy") || id.includes("buy"))) {
        buy = el;
      }

      if (!sell && (text === "sell" || text.includes("sell") || cls.includes("sell") || id.includes("sell"))) {
        sell = el;
      }
    });

    return { buy, sell };
  }

  function createBuySellRow() {
    const row = document.createElement("div");
    row.className = "step29d-buy-sell-row";

    const buyBtn = document.createElement("button");
    buyBtn.className = "step29d-buy-btn";
    buyBtn.type = "button";
    buyBtn.innerHTML = "BUY";

    const sellBtn = document.createElement("button");
    sellBtn.className = "step29d-sell-btn";
    sellBtn.type = "button";
    sellBtn.innerHTML = "SELL";

    buyBtn.addEventListener("click", function () {
      const oldBuy = $("#buyBtn") || $(".buy-btn") || $('[data-action="buy"]');
      if (oldBuy && oldBuy !== buyBtn) {
        oldBuy.click();
      } else {
        window.dispatchEvent(new CustomEvent("gold-ai-pro-buy"));
        console.log("BUY CLICKED");
      }
    });

    sellBtn.addEventListener("click", function () {
      const oldSell = $("#sellBtn") || $(".sell-btn") || $('[data-action="sell"]');
      if (oldSell && oldSell !== sellBtn) {
        oldSell.click();
      } else {
        window.dispatchEvent(new CustomEvent("gold-ai-pro-sell"));
        console.log("SELL CLICKED");
      }
    });

    row.appendChild(buyBtn);
    row.appendChild(sellBtn);

    return row;
  }

  function createIndicatorPanel() {
    const wrap = document.createElement("div");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "step29d-indicator-toggle";
    toggle.innerHTML = "เปิด / ปิด Indicator";

    const panel = document.createElement("div");
    panel.className = "step29d-indicator-panel";

    panel.innerHTML = `
      <div class="step29d-indicator-grid">
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">EMA</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">RSI</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">MACD</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">FVG</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">Tiger Claw</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
        <div class="step29d-indicator-item">
          <span class="step29d-indicator-name">Support / Resistance</span>
          <span class="step29d-indicator-status">ON</span>
        </div>
      </div>
    `;

    toggle.addEventListener("click", function () {
      panel.classList.toggle("active");
    });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);

    return wrap;
  }

  function moveBuySellBelowChart() {
    if ($("#step29d-chart-actions")) return;

    const chartArea = findChartArea();
    if (!chartArea) {
      console.warn("STEP 29D: chart area not found");
      return;
    }

    const actions = document.createElement("div");
    actions.id = "step29d-chart-actions";
    actions.className = "step29d-chart-actions";

    const existing = findExistingBuySellButtons();

    if (existing.buy && existing.sell) {
      const row = document.createElement("div");
      row.className = "step29d-buy-sell-row";

      existing.buy.classList.add("step29d-buy-btn");
      existing.sell.classList.add("step29d-sell-btn");

      row.appendChild(existing.buy);
      row.appendChild(existing.sell);

      actions.appendChild(row);
    } else {
      actions.appendChild(createBuySellRow());
    }

    actions.appendChild(createIndicatorPanel());

    chartArea.insertAdjacentElement("afterend", actions);
  }

  function cleanDuplicateHomeBlocks() {
    const possibleDuplicateSelectors = [
      ".atp-duplicate",
      ".duplicate-atp",
      ".home-atp-copy",
      "#home-atp",
      "#atpHomeCopy",
      ".tp-sl-summary",
      ".tpsl-summary"
    ];

    possibleDuplicateSelectors.forEach((selector) => {
      $all(selector).forEach((el) => {
        el.classList.add("step29d-hidden-tpsl");
      });
    });
  }

  function moveCurrentAnalysisUp() {
    const currentAnalysis =
      $("#currentAnalysis") ||
      $("#current-analysis") ||
      $(".current-analysis") ||
      $(".analysis-current");

    const chartArea = findChartArea();

    if (!currentAnalysis || !chartArea) return;

    const chartParent = chartArea.parentElement;
    const analysisParent = currentAnalysis.parentElement;

    if (!chartParent || !analysisParent) return;

    const alreadyNearChart =
      currentAnalysis.compareDocumentPosition(chartArea) & Node.DOCUMENT_POSITION_FOLLOWING;

    if (alreadyNearChart) return;

    chartParent.insertAdjacentElement("beforebegin", currentAnalysis);
  }

  function runStep29D() {
    injectStyle();
    hideTpSlLines();
    cleanDuplicateHomeBlocks();
    moveCurrentAnalysisUp();
    moveBuySellBelowChart();

    setTimeout(hideTpSlLines, 800);
    setTimeout(moveBuySellBelowChart, 1000);
  }

  ready(function () {
    runStep29D();
  });
})();
