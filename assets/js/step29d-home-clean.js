/* =========================================================
   Gold AI Pro - Step 29E Chart Clean
   File: assets/js/step29e-chart-clean.js

   เป้าหมาย:
   - ซ่อน / กันการวาดเส้น TP1 / BUY / SL บนกราฟ
   - ไม่ยุ่งกับระบบราคา
   - ไม่ยุ่งกับ Telegram
   - ไม่ยุ่งกับปุ่ม BUY / SELL ด้านล่าง
   - ใช้เป็นไฟล์เสริมก่อนแก้ app.js ตัวจริง
========================================================= */

(function () {
  "use strict";

  console.log("STEP 29E CHART CLEAN LOADED");

  const BLOCK_LABELS = [
    "TP",
    "TP1",
    "TP2",
    "TP3",
    "SL",
    "BUY",
    "SELL",
    "TAKE PROFIT",
    "STOP LOSS"
  ];

  function shouldBlockText(text) {
    if (!text) return false;

    const value = String(text).trim().toUpperCase();

    return BLOCK_LABELS.some((label) => {
      return value === label || value.startsWith(label + " ");
    });
  }

  function shouldBlockStroke(ctx) {
    try {
      const stroke = String(ctx.strokeStyle || "").toLowerCase();
      const dash = ctx.getLineDash ? ctx.getLineDash() : [];

      const isDashed = Array.isArray(dash) && dash.length > 0;

      const isSignalColor =
        stroke.includes("00ff") ||
        stroke.includes("22c55") ||
        stroke.includes("16a3") ||
        stroke.includes("facc") ||
        stroke.includes("eab3") ||
        stroke.includes("ff") ||
        stroke.includes("ef44") ||
        stroke.includes("dc26") ||
        stroke.includes("rgb(34") ||
        stroke.includes("rgb(22") ||
        stroke.includes("rgb(250") ||
        stroke.includes("rgb(239") ||
        stroke.includes("rgb(220");

      return isDashed && isSignalColor;
    } catch (e) {
      return false;
    }
  }

  function patchCanvas() {
    if (!window.CanvasRenderingContext2D) return;

    const proto = window.CanvasRenderingContext2D.prototype;

    if (proto.__step29ePatched) return;
    proto.__step29ePatched = true;

    const originalFillText = proto.fillText;
    const originalStrokeText = proto.strokeText;
    const originalStroke = proto.stroke;

    proto.fillText = function (text, x, y, maxWidth) {
      if (shouldBlockText(text)) {
        console.log("STEP 29E BLOCK fillText:", text);
        return;
      }

      return originalFillText.apply(this, arguments);
    };

    proto.strokeText = function (text, x, y, maxWidth) {
      if (shouldBlockText(text)) {
        console.log("STEP 29E BLOCK strokeText:", text);
        return;
      }

      return originalStrokeText.apply(this, arguments);
    };

    proto.stroke = function () {
      if (shouldBlockStroke(this)) {
        console.log("STEP 29E BLOCK dashed signal line");
        return;
      }

      return originalStroke.apply(this, arguments);
    };
  }

  function hideSvgSignalLines() {
    const all = Array.from(document.querySelectorAll("svg text, svg line, svg path"));

    all.forEach((el) => {
      const text = (el.textContent || "").trim().toUpperCase();
      const stroke = (el.getAttribute("stroke") || "").toLowerCase();
      const cls = (el.getAttribute("class") || "").toLowerCase();
      const id = (el.getAttribute("id") || "").toLowerCase();

      const isLabel = shouldBlockText(text);

      const isSignalLine =
        cls.includes("tp") ||
        cls.includes("sl") ||
        cls.includes("buy") ||
        cls.includes("sell") ||
        id.includes("tp") ||
        id.includes("sl") ||
        id.includes("buy") ||
        id.includes("sell") ||
        stroke.includes("#22c55e") ||
        stroke.includes("#16a34a") ||
        stroke.includes("#facc15") ||
        stroke.includes("#eab308") ||
        stroke.includes("#ef4444") ||
        stroke.includes("#dc2626");

      if (isLabel || isSignalLine) {
        el.style.display = "none";
        el.style.opacity = "0";
        el.style.visibility = "hidden";
      }
    });
  }

  function hideHtmlSignalLabels() {
    const all = Array.from(document.querySelectorAll("body *"));

    all.forEach((el) => {
      if (!el || !el.textContent) return;

      const text = el.textContent.trim().toUpperCase();

      if (
        text === "TP" ||
        text === "TP1" ||
        text === "TP2" ||
        text === "TP3" ||
        text === "SL" ||
        text === "BUY"
      ) {
        el.style.display = "none";
        el.style.opacity = "0";
        el.style.visibility = "hidden";
      }
    });
  }

  function rerenderChartIfPossible() {
    const functionNames = [
      "drawChart",
      "renderChart",
      "loadChart",
      "updateChart",
      "drawProxyChart",
      "renderProxyChart",
      "loadProxyChart"
    ];

    functionNames.forEach((name) => {
      if (typeof window[name] === "function") {
        try {
          console.log("STEP 29E rerender:", name);
          window[name]();
        } catch (e) {
          console.warn("STEP 29E rerender failed:", name, e);
        }
      }
    });

    window.dispatchEvent(new Event("resize"));
  }

  function run() {
    patchCanvas();
    hideSvgSignalLines();
    hideHtmlSignalLabels();

    setTimeout(hideSvgSignalLines, 300);
    setTimeout(hideHtmlSignalLabels, 300);

    setTimeout(hideSvgSignalLines, 1000);
    setTimeout(hideHtmlSignalLabels, 1000);

    setTimeout(rerenderChartIfPossible, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
