/* =====================================================================
   calibrate.js — логика страницы calibrate.html (режим калибровки).
   Все данные живут только в памяти страницы: обновили страницу — всё
   стёрлось. Скопируйте результат в data.js до закрытия!
   ===================================================================== */
(function () {
  "use strict";
  const D = window.SDU_DATA, G = window.SDU_LOGIC, M = window.SDU_MAP;
  const $ = function (s) { return document.querySelector(s); };
  if (!M) { $("#tapOut").textContent = "Модуль карты не загрузился."; return; }

  const ctx = M.createBaseMap($("#calMap"));
  const marks = document.createElement("div");
  marks.className = "map-places";
  const cpLayer = document.createElement("div");
  cpLayer.className = "map-pins";
  ctx.markerLayer.append(marks, cpLayer);
  const NS = "http://www.w3.org/2000/svg";
  const graphLayer = document.createElementNS(NS, "g");
  graphLayer.setAttribute("pointer-events", "none");
  graphLayer.style.display = "none";
  ctx.routeLayer.appendChild(graphLayer);

  function svg(name, attrs) {
    const n = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function dot(layer, x, y, element) {
    const m = document.createElement("div");
    m.className = "map-marker";
    m.style.left = x + "px"; m.style.top = y + "px";
    m.appendChild(element); layer.appendChild(m);
  }

  let lastTap = null;          // {x, y}
  const fixes = [];            // последние замеры GPS: {lat, lng, acc, t}
  let points = [];             // контрольные точки {lat, lng, x, y, acc}
  let watchId = null;

  function round(v, n) { const k = Math.pow(10, n); return Math.round(v * k) / k; }
  function copy(text, btn) {
    const done = function () { const o = btn.textContent; btn.textContent = "Скопировано ✔"; setTimeout(function () { btn.textContent = o; }, 1200); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { prompt("Скопируйте:", text); });
    else prompt("Скопируйте:", text);
  }

  /* ---- 1. Тап по карте → x, y в пикселях картинки ---- */
  ctx.map.on("click", function (e) {
    const p = ctx.px(e.latlng);
    lastTap = { x: Math.round(p.x), y: Math.round(p.y) };
    const nn = G.nearestNode(lastTap.x, lastTap.y);
    $("#tapOut").textContent = "x: " + lastTap.x + ", y: " + lastTap.y +
      (nn ? "   (ближайший узел: " + nn.id + ", " + Math.round(nn.distancePx) + " px)" : "");
    drawMarks();
  });
  $("#copyNode").addEventListener("click", function (e) {
    if (!lastTap) return;
    copy('{ id: "new-node", x: ' + lastTap.x + ", y: " + lastTap.y + ', floor: "1", area: "Главный коридор" },', e.target);
  });

  /* ---- 2. Граф проходов поверх карты (нативный SVG) ---- */
  (function buildGraphLayer() {
    const g = G.getCampusGraph();
    D.EDGES.forEach(function (e) {
      const a = g.nodes[e[0]], b = g.nodes[e[1]];
      graphLayer.appendChild(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: "#ea580c", "stroke-width": "3", opacity: ".8" }));
    });
    D.NODES.forEach(function (n) {
      graphLayer.appendChild(svg("circle", { cx: n.x, cy: n.y, r: 4,
        fill: n.stairs ? "#7c3aed" : "#9a3412" }));
      const label = svg("text", { x: n.x + 6, y: n.y - 5, fill: "#7c2d12",
        "font-size": "11", "paint-order": "stroke", stroke: "white", "stroke-width": "3" });
      label.textContent = n.id;
      graphLayer.appendChild(label);
    });
  })();
  $("#showGraph").addEventListener("change", function (e) {
    graphLayer.style.display = e.target.checked ? "" : "none";
  });

  /* ---- 3. GPS ---- */
  /* Среднее по замерам за последние 15 секунд: так дрожание GPS меньше */
  function averagedFix() {
    const now = Date.now();
    const recent = fixes.filter(function (f) { return now - f.t < 15000; });
    if (!recent.length) return null;
    const s = recent.reduce(function (a, f) { return { lat: a.lat + f.lat, lng: a.lng + f.lng, acc: Math.min(a.acc, f.acc) }; },
                            { lat: 0, lng: 0, acc: Infinity });
    return { lat: s.lat / recent.length, lng: s.lng / recent.length, acc: s.acc, n: recent.length };
  }
  $("#gpsBtn").addEventListener("click", function () {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      $("#gpsBtn").textContent = "Включить GPS"; $("#gpsOut").textContent = "выключен";
      return;
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      $("#gpsOut").textContent = "GPS недоступен: нужен HTTPS (или localhost) и браузер с геолокацией.";
      return;
    }
    $("#gpsOut").textContent = "ждём спутники…";
    $("#gpsBtn").textContent = "Выключить GPS";
    watchId = navigator.geolocation.watchPosition(function (pos) {
      const c = pos.coords;
      fixes.push({ lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: Date.now() });
      if (fixes.length > 60) fixes.shift();
      const a = averagedFix();
      $("#gpsOut").textContent = "lat: " + c.latitude.toFixed(7) + ", lng: " + c.longitude.toFixed(7) +
        "  ±" + Math.round(c.accuracy) + " м\nсреднее за 15 с (" + a.n + " замеров): " + a.lat.toFixed(7) + ", " + a.lng.toFixed(7);
      /* Где эта точка по ТЕКУЩЕЙ привязке из data.js — удобно проверять результат */
      try {
        const t = G.createGeoTransform(points.length >= 3 ? points : D.GEO_CONTROL_POINTS);
        const p = t.convert(c.latitude, c.longitude);
        $("#gpsMapOut").textContent = "По " + (points.length >= 3 ? "новой" : "текущей (data.js)") + " привязке вы в x: " +
          Math.round(p.x) + ", y: " + Math.round(p.y) + (G.isInsideMap(p.x, p.y) ? "" : " — за пределами карты");
        drawMarks(p);
      } catch (err) { $("#gpsMapOut").textContent = err.message; }
    }, function (err) {
      $("#gpsOut").textContent = err.code === 1 ? "Доступ к геолокации запрещён (разрешите в настройках сайта)."
                                                 : "Ошибка GPS: " + err.message;
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  });

  function drawMarks(gpsPx) {
    marks.replaceChildren();
    if (lastTap) {
      const d = document.createElement("div"); d.className = "tap-mark";
      dot(marks, lastTap.x, lastTap.y, d);
    }
    if (gpsPx) {
      const d = document.createElement("div");
      d.style.cssText = "width:16px;height:16px;border:3px solid #fff;border-radius:50%;background:#2563eb;box-shadow:0 0 0 2px #2563eb";
      dot(marks, gpsPx.x, gpsPx.y, d);
    }
  }

  /* ---- 4. Контрольные точки и расчёт привязки ---- */
  $("#addPoint").addEventListener("click", function () {
    const a = averagedFix();
    if (!lastTap) { alert("Сначала тапните на карте место, где вы стоите."); return; }
    if (!a) { alert("Нет свежих данных GPS. Включите GPS и подождите несколько секунд."); return; }
    points.push({ lat: round(a.lat, 7), lng: round(a.lng, 7), x: lastTap.x, y: lastTap.y, acc: Math.round(a.acc) });
    renderPoints();
  });
  $("#loadCurrent").addEventListener("click", function () {
    points = D.GEO_CONTROL_POINTS.map(function (p) { return { lat: p.lat, lng: p.lng, x: p.x, y: p.y, acc: null }; });
    renderPoints();
  });

  function renderPoints() {
    const body = $("#cpBody");
    body.textContent = "";
    cpLayer.replaceChildren();
    let t = null, err = "";
    if (points.length >= 3) { try { t = G.createGeoTransform(points); } catch (e) { err = e.message; } }
    points.forEach(function (p, i) {
      const tr = document.createElement("tr");
      [i + 1, p.x + ", " + p.y, p.lat.toFixed(7) + ", " + p.lng.toFixed(7), p.acc === null ? "—" : p.acc,
       t ? t.residuals[i].toFixed(1) : "—"].forEach(function (v) {
        const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
      });
      const td = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button"; del.className = "lesson__del"; del.textContent = "удалить";
      del.addEventListener("click", function () { points.splice(i, 1); renderPoints(); });
      td.appendChild(del); tr.appendChild(td);
      body.appendChild(tr);
      const m = document.createElement("div"); m.className = "cp-mark"; m.textContent = "📌";
      dot(cpLayer, p.x, p.y, m);
    });
    $("#fitOut").textContent = t
      ? "Средняя ошибка: " + t.rmsPx.toFixed(1) + " px (≈ " + (t.rmsPx * t.metersPerPixel).toFixed(1) + " м). " +
        "Оценка масштаба: METERS_PER_PIXEL ≈ " + t.metersPerPixel.toFixed(3) + ". Север на карте повёрнут на " +
        t.northAngleDeg.toFixed(0) + "° от верха. Точка с большой ошибкой — вероятно, неточный замер: удалите её."
      : (err || "Добавьте минимум 3 точки, не на одной прямой.");
    $("#snippet").value = "  const GEO_CONTROL_POINTS = [\n" + points.map(function (p) {
      return "    { lat: " + p.lat.toFixed(7) + ", lng: " + p.lng.toFixed(7) + ", x: " + p.x + ", y: " + p.y + " },";
    }).join("\n") + "\n  ];\n  const GEO_CALIBRATED = true;\n" +
      (t ? "  const METERS_PER_PIXEL = " + t.metersPerPixel.toFixed(3) + ";   // оценка по контрольным точкам\n" : "");
  }
  $("#copySnippet").addEventListener("click", function (e) { copy($("#snippet").value, e.target); });
  renderPoints();
})();
