

// ตอนนี้ทดสอบ VIP แบบ local ก่อน
let isVip = localStorage.getItem("vip") === "true";

function updateVipBadge(){
  const badge = document.getElementById("vipBadge");
  badge.innerText = isVip ? "VIP" : "FREE";
  badge.style.background = isVip ? "#00e676" : "#ffe66d";
}

function toggleSettings(){
  const p = document.getElementById("settings");
  p.style.display = p.style.display === "block" ? "none" : "block";
}

function toggleChart(){
  const p = document.getElementById("chart");
  p.style.display = p.style.display === "block" ? "none" : "block";
}

function saveSettings(){
  localStorage.setItem("telegram", document.getElementById("telegram").value);
  localStorage.setItem("minConf", document.getElementById("minConf").value);
  localStorage.setItem("cooldown", document.getElementById("cooldown").value);
  alert("บันทึก Setting แล้ว");
}

function loadSettings(){
  document.getElementById("telegram").value = localStorage.getItem("telegram") || "off";
  document.getElementById("minConf").value = localStorage.getItem("minConf") || "70";
  document.getElementById("cooldown").value = localStorage.getItem("cooldown") || "15";
}

async function loadSignal(){
  const btn = document.querySelector(".main");
  btn.innerText = "Loading...";

  try{
    const telegramOn = localStorage.getItem("telegram") === "on";
    const minConf = localStorage.getItem("minConf") || "70";
    const cooldown = localStorage.getItem("cooldown") || "15";

    const vipParam = isVip && telegramOn ? "true" : "false";
const url = `${CONFIG.API_URL}/?vip=${vipParam}&min_conf=${minConf}&cooldown=${cooldown}`;

    const res = await fetch(url);
    const data = await res.json();

    if(data.market === "closed"){
      document.getElementById("marketStatus").innerText = "🔴 Market Closed";
      document.getElementById("marketStatus").className = "status closed";
      document.getElementById("price").innerText = "XAU/USD: " + data.price;
      document.getElementById("signal").innerText = "WAIT";
      document.getElementById("signal").className = "signal wait";
      document.getElementById("entry").innerText = "--";
      document.getElementById("sl").innerText = "--";
      document.getElementById("tp1").innerText = "--";
      document.getElementById("tp2").innerText = isVip ? "--" : "VIP";
      document.getElementById("tp3").innerText = isVip ? "--" : "VIP";
      document.getElementById("confidence").innerText = "--";
      return;
    }

    const s = data.signal;

    document.getElementById("marketStatus").innerText = "🟢 Market Open";
    document.getElementById("marketStatus").className = "status open";

    document.getElementById("price").innerText = "XAU/USD: " + Number(data.price).toFixed(2);

    const sig = document.getElementById("signal");
    sig.innerText = s.signal;
    sig.className = "signal " + s.signal.toLowerCase();

    document.getElementById("entry").innerText = s.entry ?? "--";
    document.getElementById("sl").innerText = s.sl ?? "--";
    document.getElementById("tp1").innerText = s.tp1 ?? "--";
    document.getElementById("tp2").innerText = isVip ? (s.tp2 ?? "--") : "VIP";
    document.getElementById("tp3").innerText = isVip ? (s.tp3 ?? "--") : "VIP";
    document.getElementById("confidence").innerText = s.confidence + "%";

  }catch(e){
    console.log(e);
    document.getElementById("marketStatus").innerText = "API Error";
    document.getElementById("marketStatus").className = "status closed";
    alert("โหลดข้อมูลไม่ได้ ตรวจ Worker หรือ CORS");
  }finally{
    btn.innerText = "🚀 Load Signal";
  }
}

async function testTelegram(){
  try{
    const res = await fetch(CONFIG.API_URL + "/?mode=test-telegram")
    const data = await res.json();
    alert(data.market || data.message || "Test sent");
  }catch(e){
    alert("Test Telegram ไม่สำเร็จ");
  }
}

loadSettings();
updateVipBadge();
loadSignal();
