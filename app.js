(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const ACTIVE = ["HOMING","PICKING","MOVING","PLANTING","WATERING"];
  const LABEL = {
    IDLE: "Ready",
    HOMING: "Homing",
    PICKING: "Picking seeds",
    MOVING: "Moving",
    PLANTING: "Planting",
    WATERING: "Watering",
    PAUSED: "Paused",
    DONE: "Tray complete",
    ESTOP: "Emergency stop",
    ERROR: "Error",
    OFFLINE: "Offline"
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch(e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch(e) {} }
  };

  const blank = () => ({
    state: "OFFLINE",
    rows: +$("rows").value || 7,
    cols: +$("cols").value || 15,
    row: 0,
    col: 0,
    done: 0,
    total: 0,
    tankLow: false,
    hopperEmpty: false,
    trayPresent: true,
    estop: false,
    vacuum: false,
    pump: false,
    x: 0,
    y: 0,
    z: 0
  });

  let S = blank();
  let ws = null, wantOpen = false, demoOn = false, lastMsg = 0, retry = null;
  let runStart = 0, prevState = "OFFLINE", gridKey = "";

  function log(text) {
    const d = document.createElement("div");
    const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const b = document.createElement("b"); 
    b.textContent = t + "  ";
    d.appendChild(b); 
    d.appendChild(document.createTextNode(text));
    const box = $("log"); 
    box.appendChild(d);
    while (box.children.length > 200) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function setLink(kind, text) {
    $("linkDot").className = "dot " + kind;
    $("linkText").textContent = text;
  }

  function buildGrid(rows, cols) {
    const key = rows + "x" + cols;
    if (key === gridKey) return;
    gridKey = key;
    const g = $("grid");
    g.textContent = "";
    g.style.gridTemplateColumns = "repeat(" + cols + ",1fr)";
    g.style.maxWidth = Math.min(760, cols * 78) + "px";
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const p = document.createElement("div");
        p.className = "pot"; 
        p.title = "Row " + r + ", column " + c;
        g.appendChild(p);
      }
    }
  }

  function paintGrid() {
    const pots = $("grid").children, cols = S.cols;
    const cur = (S.row > 0 && S.col > 0 && S.state !== "DONE") ? (S.row - 1) * cols + (S.col - 1) : -1;
    for (let i = 0; i < pots.length; i++) {
      const done = i < S.done;
      pots[i].className = "pot" + (done ? " done" : "") + (i === cur ? " now" + (S.state === "WATERING" ? " watering" : "") : "");
    }
  }

  const mmss = s => { 
    s = Math.max(0, Math.round(s)); 
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); 
  };

  function updateTimes() {
    const running = runStart && S.state !== "OFFLINE";
    const el = running ? (Date.now() - runStart) / 1000 : 0;
    $("elapsed").textContent = running ? mmss(el) : $("elapsed").textContent;
    $("eta").textContent = (running && S.done > 0 && S.done < S.total) 
      ? mmss(el / S.done * (S.total - S.done)) 
      : (S.state === "DONE" ? "0:00" : "—");
  }

  function tele(id, kind, text) { 
    $("d-" + id).className = "dot " + kind; 
    $("v-" + id).textContent = text; 
  }

  function render() {
    const st = S.state;
    buildGrid(S.rows, S.cols);
    paintGrid();

    const sEl = $("state");
    sEl.textContent = LABEL[st] || st;
    sEl.className = "state s-" + st;
    const hasPot = S.row > 0 && S.col > 0 && ACTIVE.concat("PAUSED").includes(st);
    $("where").textContent = st === "OFFLINE" ? "Connect to the machine to begin."
      : hasPot ? "Pot " + (S.done + 1) + " of " + S.total + " (row " + S.row + ", column " + S.col + ")"
      : st === "DONE" ? "All " + S.total + " pots planted and watered."
      : st === "ESTOP" ? "Release the emergency stop button, then press Reset."
      : st === "ERROR" ? "Check the machine, then press Reset."
      : "Set the tray size and press Start.";

    $("done").textContent = S.done;
    $("total").textContent = S.total || S.rows * S.cols;
    const pct = S.total ? Math.round(S.done / S.total * 100) : 0;
    $("pct").textContent = pct + "%";
    $("bar").style.width = pct + "%";

    if (st !== prevState) {
      if (ACTIVE.includes(st) && !ACTIVE.includes(prevState) && prevState !== "PAUSED" && S.done === 0) { 
        runStart = Date.now(); 
        $("elapsed").textContent = "0:00"; 
      }
      if (st === "DONE") updateTimes();
      if (prevState !== "OFFLINE" || st !== "OFFLINE")
        log((LABEL[st] || st) + (hasPot ? " at row " + S.row + ", column " + S.col : ""));
      prevState = st;
    }
    updateTimes();

    const live = st !== "OFFLINE";
    tele("tank", !live ? "" : S.tankLow ? "bad" : "ok", !live ? "—" : S.tankLow ? "Low, refill" : "OK");
    tele("hopper", !live ? "" : S.hopperEmpty ? "bad" : "ok", !live ? "—" : S.hopperEmpty ? "Empty, refill" : "OK");
    tele("tray", !live ? "" : S.trayPresent ? "ok" : "warn", !live ? "—" : S.trayPresent ? "In place" : "Not detected");
    tele("estop", !live ? "" : S.estop ? "bad" : "ok", !live ? "—" : S.estop ? "Pressed" : "Released");
    tele("vac", !live ? "" : S.vacuum ? "warn" : "", !live ? "—" : S.vacuum ? "On" : "Off");
    tele("pump", !live ? "" : S.pump ? "warn" : "", !live ? "—" : S.pump ? "Running" : "Off");
    $("v-pos").textContent = live ? "X " + (+S.x).toFixed(1) + "  Y " + (+S.y).toFixed(1) + "  Z " + (+S.z).toFixed(1) : "—";

    const can = {
      start: ["IDLE", "DONE"].includes(st),
      pause: ACTIVE.includes(st) && st !== "HOMING",
      resume: st === "PAUSED",
      stop: ACTIVE.includes(st) || st === "PAUSED",
      home: ["IDLE", "DONE"].includes(st),
      reset: ["IDLE", "DONE", "ESTOP", "ERROR"].includes(st)
    };
    document.querySelectorAll("[data-cmd]").forEach(b => { b.disabled = !can[b.dataset.cmd]; });
    const locked = ACTIVE.includes(st) || st === "PAUSED";
    ["rows", "cols", "depth", "water"].forEach(id => $(id).disabled = locked);
    $("estop").disabled = !live;
    $("estop").style.opacity = live ? 1 : 0.4;
  }

  function settings() {
    return {
      rows: Math.max(1, Math.min(20, +$("rows").value || 1)), 
      cols: Math.max(1, Math.min(20, +$("cols").value || 1)), 
      depth: +$("depth").value || 0, 
      water: +$("water").value || 0
    };
  }

  function send(obj) {
    if (demoOn) { demoCmd(obj); return true; }
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    log("Not connected. Command not sent: " + obj.cmd);
    return false;
  }

  document.querySelectorAll("[data-cmd]").forEach(b => b.addEventListener("click", () => {
    const cmd = b.dataset.cmd;
    send(cmd === "start" ? Object.assign({cmd}, settings()) : {cmd});
  }));
  $("estop").addEventListener("click", () => { send({cmd: "estop"}); });

  function onMessage(raw) {
    let m; try { m = JSON.parse(raw); } catch(e) { return; }
    lastMsg = Date.now();
    if (m.type === "log") { log(String(m.msg || "")); return; }
    if (m.type !== "status") return;
    const keys = ["state","rows","cols","row","col","done","total","tankLow","hopperEmpty","trayPresent","estop","vacuum","pump","x","y","z"];
    keys.forEach(k => { if (m[k] !== undefined) S[k] = m[k]; });
    S.state = String(S.state || "IDLE").toUpperCase();
    if (m.rows !== undefined) $("rows").value = S.rows;
    if (m.cols !== undefined) $("cols").value = S.cols;
    render();
  }

  function wsUrl(h) {
    h = h.trim();
    if (/^wss?:\/\//i.test(h)) return h;
    return "ws://" + h.replace(/^https?:\/\//i, "").replace(/\/+$/, "") + "/ws";
  }

  function connect() {
    const host = $("host").value.trim();
    if (!host) { log("Enter the ESP32 address first."); $("host").focus(); return; }
    if (demoOn) stopDemo();
    store.set("seedsow.host", host);
    wantOpen = true; clearTimeout(retry);
    if (ws) { try { ws.onclose = null; ws.close(); } catch(e) {} }
    const url = wsUrl(host);
    setLink("warn", "Connecting…");
    log("Connecting to " + url);
    try { ws = new WebSocket(url); } catch(e) { setLink("bad", "Bad address"); log("Could not open " + url); return; }
    ws.onopen = () => { setLink("ok", "Connected"); $("connect").textContent = "Disconnect"; log("Connected."); send({cmd: "hello"}); };
    ws.onmessage = ev => onMessage(ev.data);
    ws.onerror = () => { log("Connection error. Check address and local network."); };
    ws.onclose = () => {
      S = blank(); render();
      $("connect").textContent = "Connect";
      if (wantOpen) { setLink("warn", "Reconnecting…"); retry = setTimeout(connect, 2500); }
      else setLink("", "Not connected");
    };
  }

  function disconnect() {
    wantOpen = false; clearTimeout(retry);
    if (ws) { try { ws.close(); } catch(e) {} }
    setLink("", "Not connected"); $("connect").textContent = "Connect";
  }

  $("connect").addEventListener("click", () => { (wantOpen || demoOn) ? (demoOn ? stopDemo() : disconnect()) : connect(); });
  $("host").addEventListener("keydown", e => { if (e.key === "Enter") connect(); });

  setInterval(() => {
    if (ws && ws.readyState === 1 && lastMsg && Date.now() - lastMsg > 5000) setLink("warn", "No data from machine");
    else if (ws && ws.readyState === 1 && lastMsg) setLink("ok", "Connected");
    if (S.state !== "OFFLINE") updateTimes();
  }, 1000);

  function showCam() {
    const url = $("camUrl").value.trim();
    if (!url) return;
    store.set("seedsow.cam", url);
    const cam = $("cam"); cam.textContent = "Loading camera…";
    const img = new Image();
    img.alt = "Live view from the planting head";
    img.onload = () => { cam.textContent = ""; cam.appendChild(img); };
    img.onerror = () => { cam.textContent = "Could not load camera stream."; };
    img.src = url;
  }
  $("camBtn").addEventListener("click", showCam);
  $("camUrl").addEventListener("keydown", e => { if (e.key === "Enter") showCam(); });

  const PH = ["MOVING", "PICKING", "MOVING", "PLANTING", "WATERING"];
  let sim = { timer: null, p: 0, homeLeft: 0, planting: false, paused: null, depth: 8 };

  function startDemo() {
    if (wantOpen) disconnect();
    demoOn = true; lastMsg = Date.now();
    S = blank(); S.state = "IDLE"; S.total = 0;
    setLink("warn", "Demo mode"); $("connect").textContent = "Stop demo";
    log("Demo mode: simulated machine.");
    clearInterval(sim.timer); sim.timer = setInterval(simTick, 650);
    render();
  }

  function stopDemo() {
    demoOn = false; clearInterval(sim.timer);
    S = blank(); render(); setLink("", "Not connected"); $("connect").textContent = "Connect";
  }

  function demoCmd(c) {
    if (c.cmd === "estop") { S.state = "ESTOP"; S.estop = true; S.vacuum = S.pump = false; }
    else if (c.cmd === "reset" && ["ESTOP", "ERROR", "IDLE", "DONE"].includes(S.state)) { S = Object.assign(blank(), {state: "IDLE", rows: S.rows, cols: S.cols}); sim.paused = null; }
    else if (c.cmd === "home" && ["IDLE", "DONE"].includes(S.state)) { sim.homeLeft = 3; sim.planting = false; S.state = "HOMING"; }
    else if (c.cmd === "start" && ["IDLE", "DONE"].includes(S.state)) {
      S.rows = c.rows; S.cols = c.cols; S.total = c.rows * c.cols; S.done = 0; S.row = S.col = 0; sim.depth = c.depth;
      sim.homeLeft = 3; sim.planting = true; sim.p = 0; S.state = "HOMING";
    }
    else if (c.cmd === "pause" && ACTIVE.includes(S.state)) { sim.paused = S.state; S.state = "PAUSED"; S.vacuum = S.pump = false; }
    else if (c.cmd === "resume" && S.state === "PAUSED") { S.state = sim.paused || "MOVING"; }
    else if (c.cmd === "stop") { S.state = "IDLE"; S.row = S.col = 0; S.vacuum = S.pump = false; sim.homeLeft = 0; }
    render();
  }

  function simTick() {
    lastMsg = Date.now();
    if (!ACTIVE.includes(S.state)) return;
    if (sim.homeLeft > 0) {
      sim.homeLeft--; S.x = S.y = S.z = 0;
      if (sim.homeLeft === 0) {
        if (sim.planting) { S.row = 1; S.col = 1; sim.p = 0; S.state = PH[0]; } else S.state = "IDLE";
      }
    } else {
      sim.p++;
      if (sim.p >= PH.length) {
        sim.p = 0; S.done++;
        if (S.done >= S.total) { S.state = "DONE"; S.row = S.col = 0; }
        else { S.row = Math.floor(S.done / S.cols) + 1; S.col = S.done % S.cols + 1; S.state = PH[0]; }
      } else S.state = PH[sim.p];
    }
    S.vacuum = S.state === "PICKING" || (S.state === "MOVING" && sim.p === 2);
    S.pump = S.state === "WATERING";
    S.z = S.state === "PLANTING" ? sim.depth : 0;
    if (S.row) { S.x = S.col * 22; S.y = S.row * 22; }
    render();
  }

  $("demo").addEventListener("click", () => demoOn ? stopDemo() : startDemo());

  ["rows", "cols"].forEach(id => $(id).addEventListener("input", () => {
    if (["OFFLINE", "IDLE", "DONE"].includes(S.state) && S.done === 0) {
      S.rows = Math.max(1, Math.min(20, +$("rows").value || 1)); 
      S.cols = Math.max(1, Math.min(20, +$("cols").value || 1)); 
      render();
    }
  }));

  $("host").value = store.get("seedsow.host") || "";
  $("camUrl").value = store.get("seedsow.cam") || "";
  render();
  if ($("host").value) log("Press Connect to reach " + $("host").value);
})();