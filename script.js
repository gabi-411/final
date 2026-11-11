/* =====================================================================
   script.js — интерфейс SDU Freshman: вкладки, карта, расписание,
   отзывы (iframe + запасной вариант), FAQ, установка PWA.
   Использует SDU_DATA (data.js) и SDU_LOGIC (logic.js).
   ===================================================================== */
(function () {
  "use strict";

  /* Скрытый режим калибровки: index.html?calibrate=1 → calibrate.html */
  if (/[?&]calibrate=1\b/.test(location.search)) { location.replace("calibrate.html"); return; }

  const D = window.SDU_DATA;
  const L = window.SDU_LOGIC;
  const $ = function (sel) { return document.querySelector(sel); };
  const $$ = function (sel) { return Array.from(document.querySelectorAll(sel)); };

  /* Безопасная вставка текста (защита от HTML-инъекций) */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ============ 1. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ============ */
  let reviewsLoaded = false;
  function showTab(id) {
    $$(".tab").forEach(function (t) { t.classList.toggle("tab--active", t.id === id); });
    $$(".nav-btn").forEach(function (b) { b.classList.toggle("nav-btn--active", b.dataset.tab === id); });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (id === "tab-reviews" && !reviewsLoaded) { reviewsLoaded = true; loadReviews(); }
    /* После скрытой вкладки повторно измеряем viewport карты */
    if (id === "tab-map" && ctx) setTimeout(function () { ctx.fit(true); }, 50);
  }
  $$(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.dataset.tab); });
  });

  /* ============ 2. КАРТА И НАВИГАТОР ============ */
  /* Карта рисуется чистым JS и SVG (map.js). Здесь — связь с интерфейсом:
     поиск, блоки, этажи, положение пользователя (GPS / вручную) и маршруты. */
  const M = window.SDU_MAP;                 // без сторонних зависимостей
  let selectedZone = null;                  // блок, выбранный кликом (для списка аудиторий)
  let selectedFloor = "1";                  // этаж для списка аудиторий
  let target = null;                        // цель маршрута: {title, zone, floor, x, y, points, isZone}
  let routeShown = false;                   // маршрут сейчас нарисован?
  let lastRouteStart = null;                // откуда строили маршрут в прошлый раз (для перестройки)

  /* Положение пользователя. ХРАНИТСЯ ТОЛЬКО В ПАМЯТИ СТРАНИЦЫ:
     ни localStorage, ни отправки на сервер. lat/lng сразу переводим в
     пиксели карты и сами градусы не храним. */
  const pos = {
    gps: null,        // {x, y, inside, accuracyM} — последняя точка GPS
    manual: null,     // {x, y, label} — точка «Я здесь» (важнее GPS)
    myFloor: "1",     // этаж, на котором стоит пользователь (GPS его не знает)
    heading: null,    // направление по компасу, градусы (0 = север)
    follow: false,    // режим «следовать за мной»
    picking: false,   // ждём тап по карте для «Я здесь»
    gpsMsg: "",       // последнее сообщение о GPS (ошибка, ожидание)
    centerOnFix: false // отцентрировать карту на первой точке GPS
  };

  /* Аффинная привязка GPS → пиксели по контрольным точкам из data.js */
  let geoT = null;
  try { geoT = L.createGeoTransform(D.GEO_CONTROL_POINTS); }
  catch (err) { console.warn("Геопривязка не настроена:", err.message); }

  let ctx = null, zones = null, overlay = null, tracker = null;

  if (M) {
    ctx = M.createBaseMap($("#campusMap"));
    zones = M.addZones(ctx, function (key) {
      if (pos.picking) return;              // в режиме «Я здесь» клик ставит точку (см. map.on("click"))
      pick(key);
    });
    overlay = M.createOverlays(ctx, function (place) {
      if (pos.picking) return;
      doSearch(place.name);
    });
    /* Кнопки поверх карты, справа сверху — как в Google Maps / 2GIS */
    M.addButtons(ctx, [
      { id: "locateBtn", icon: "⌖", title: "Где я? Определить местоположение по GPS", onClick: startGps },
      { id: "followBtn", icon: "🎯", title: "Центрировать на мне и следовать", onClick: toggleFollow },
      { id: "hereBtn",   icon: "📍", title: "Я здесь: отметить себя на карте вручную", onClick: startPicking }
    ]);
    ctx.map.on("click", function (e) {
      if (!pos.picking) return;
      const p = ctx.px(e.latlng);
      /* не даём поставить точку в пустоту за пределами картинки */
      const x = Math.min(D.MAP_SIZE.w, Math.max(0, p.x)), y = Math.min(D.MAP_SIZE.h, Math.max(0, p.y));
      setManual(x, y, "точка на карте");
    });
    /* Пользователь сам потянул карту — выключаем «следовать за мной» */
    ctx.map.on("dragstart", function () { if (pos.follow) setFollow(false); });

    /* Для автотестов: доступ к API карты и состоянию. */
    window.SDU_MAP_DEBUG = { map: ctx.map, ll: ctx.ll, px: ctx.px, pos: pos,
                             getTarget: function () { return target; } };
  } else {
    /* Запасной вариант: данные карты недоступны — показываем картинку */
    const box = $("#campusMap");
    box.classList.add("map-view--static");
    const img = el("img", "map-img");
    img.src = "campus-map.jpg";
    img.alt = "Карта кампуса SDU";
    box.appendChild(img);
    $("#locStatus").textContent = "Интерактивная карта не загрузилась — показана обычная схема.";
  }

  /* Мобильная карточка объекта: снизу, на ПК — в существующей колонке. */
  const details = $("#routeCard");
  function openDetails() {
    details.classList.add("route-card--open");
    $("#closeDetails").setAttribute("aria-expanded", "true");
  }
  function closeDetails() {
    details.classList.remove("route-card--open");
    $("#closeDetails").setAttribute("aria-expanded", "false");
  }
  $("#closeDetails").addEventListener("click", closeDetails);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetails();
  });
  /* Закрытие свайпом вниз за верхнюю ручку, не мешая прокрутке текста. */
  (function () {
    const handle = details.querySelector(".route-card__handle");
    let startY = null;
    handle.addEventListener("touchstart", function (e) {
      startY = e.touches[0].clientY;
    }, { passive: true });
    handle.addEventListener("touchend", function (e) {
      if (startY !== null && e.changedTouches[0].clientY - startY > 55) closeDetails();
      startY = null;
    }, { passive: true });
  })();

  /* 2.1 Выбор блока кликом по карте */
  function pick(key) {
    selectedZone = key;
    target = { title: D.ZONES[key].name, zone: key, isZone: true };
    showResult(D.ZONES[key].name, key, D.ZONES[key].desc, [], null, false);
    renderFloorRooms();
  }

  function clearHighlights() {
    if (zones) zones.highlight(null);
    if (overlay) overlay.setPins([]);
  }

  /* 2.2 Показать результат: подсветить зону, поставить метки, вывести «Как пройти».
     scroll=true — прокрутить страницу к карте (после поиска с клавиатуры). */
  function showResult(title, zoneKey, route, markers, emoji, scroll) {
    clearRoute();
    if (zones) zones.highlight(zoneKey);
    if (overlay) overlay.setPins(markers, emoji, openDetails);
    $("#routeCard").classList.add("route-card--found");
    openDetails();
    const zoneName = D.ZONES[zoneKey].name;
    $("#routeText").textContent = (title === zoneName ? zoneName : title + " — " + zoneName) + ". " + route;
    $("#routeBtn").hidden = !ctx;
    /* Плавно подлетаем к найденному: блок + метки */
    if (ctx) {
      const b = zones.boundsOf(zoneKey);
      markers.forEach(function (m) { if (b) b.extend(ctx.ll(m[0], m[1])); });
      if (b) ctx.map.flyToBounds(b, { padding: [30, 30], maxZoom: 0.5, duration: 0.6 });
    }
    if (scroll !== false && window.matchMedia("(min-width: 960px)").matches) $(".map-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* 2.3 Поиск по тексту */
  function doSearch(query) {
    const res = L.findLocation(query);
    if (!res) {
      clearHighlights();
      clearRoute();
      target = null;
      $("#routeBtn").hidden = true;
      $("#routeCard").classList.remove("route-card--found");
      closeDetails();
      $("#routeText").textContent = "Ничего не найдено по запросу «" + query + "». Попробуйте, например, G101, Библиотека или Wi-Fi.";
      return;
    }
    selectedZone = res.zone;
    if (res.floor) { selectedFloor = res.floor; syncFloorButtons(); }
    target = { title: res.title, zone: res.zone, floor: res.floor,
               points: res.markers.length ? res.markers : null };
    const floorNote = res.floor ? " (этаж " + res.floor + ")" : "";
    showResult(res.title + floorNote, res.zone, res.route, res.markers, res.emoji, true);
    renderFloorRooms();
  }

  $("#searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    $("#searchInput").blur();               // прячем клавиатуру телефона, чтобы была видна карта
    doSearch($("#searchInput").value);
  });

  /* Подсказки (datalist) во время набора */
  $("#searchInput").addEventListener("input", function (e) {
    const dl = $("#searchSuggest");
    dl.textContent = "";
    L.suggest(e.target.value).forEach(function (s) {
      const o = document.createElement("option");
      o.value = s;
      dl.appendChild(o);
    });
  });

  /* 2.4 Быстрые локации (все объекты карты, кроме отдельных «Бочка 1–4») */
  D.PLACES.filter(function (p) { return p.id.indexOf("bochka-") !== 0; }).forEach(function (p) {
    const b = el("button", "chip", (p.emoji || "") + " " + p.name);
    b.type = "button";
    b.addEventListener("click", function () {
      $("#searchInput").value = p.name;
      doSearch(p.name);
    });
    $("#quickPlaces").appendChild(b);
  });

  /* 2.5 Этажи: показываем аудитории выбранного блока на выбранном этаже */
  function syncFloorButtons() {
    $$(".floor-btn").forEach(function (x) {
      x.classList.toggle("chip--active", x.dataset.floor === selectedFloor);
    });
  }
  function renderFloorRooms() {
    const box = $("#floorRooms");
    box.textContent = "";
    if (!selectedZone) return;
    $("#floorHint").textContent = D.ZONES[selectedZone].name + ", этаж " + selectedFloor + ":";
    L.roomsOnFloor(selectedFloor, selectedZone).forEach(function (r) {
      const c = el("button", "chip", r.code);
      c.type = "button";
      c.addEventListener("click", function () {
        $("#searchInput").value = r.code;
        doSearch(r.code);
      });
      box.appendChild(c);
    });
  }
  $$(".floor-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectedFloor = btn.dataset.floor;
      syncFloorButtons();
      renderFloorRooms();
    });
  });

  /* ---------------- 2.6 Где пользователь: старт маршрута ----------------
     Ручная точка важнее GPS. GPS учитываем, только если он внутри кампуса. */
  function currentStart() {
    if (pos.manual) {
      return { x: pos.manual.x, y: pos.manual.y, floor: pos.myFloor, source: "manual",
               label: "вы (отмечено вручную" + (pos.manual.label ? ": " + pos.manual.label : "") + ")" };
    }
    if (pos.gps && pos.gps.inside) {
      return { x: pos.gps.x, y: pos.gps.y, floor: pos.myFloor, source: "gps",
               label: "вы (по GPS, ±" + Math.round(pos.gps.accuracyM) + " м)" };
    }
    return null;
  }

  /* Строка состояния под картой: «по GPS (±N м)» или «вручную» */
  function renderStatus() {
    const box = $("#locStatus");
    let t, warn = false;
    if (pos.manual) {
      t = "📍 Ваше положение: вручную" + (pos.manual.label ? " (" + pos.manual.label + ")" : "") +
          ", этаж " + pos.myFloor + ".";
      if (pos.gps) t += " GPS не используется — нажмите «Использовать GPS», чтобы вернуться к нему.";
    } else if (pos.gps && pos.gps.inside) {
      const acc = Math.round(pos.gps.accuracyM);
      t = "🔵 Ваше положение: по GPS (±" + acc + " м), этаж " + pos.myFloor + ".";
      if (acc > 30) t += " Точность низкая (внутри здания это нормально) — уточните кнопкой «Я здесь».";
    } else if (pos.gps && !pos.gps.inside) {
      t = "Вы вне кампуса. Синяя точка появится, когда вы будете на территории SDU. Можно отметить себя вручную: «Я здесь».";
      warn = true;
    } else {
      t = pos.gpsMsg || "Положение не определено. Нажмите ⌖ «Где я?» или 📍 «Я здесь».";
    }
    if (pos.gpsMsg && pos.gps && !pos.manual) { t += " " + pos.gpsMsg; warn = true; }
    if (pos.gpsMsg && !pos.gps && !pos.manual) warn = /запрещ|не удалось|не умеет|только по HTTPS|недоступн|не настроена/i.test(pos.gpsMsg);
    if (pos.gps && !pos.manual && !D.GEO_CALIBRATED) {
      t += " ⚠ Привязка GPS к схеме ещё не откалибрована — точка может быть смещена.";
    }
    box.textContent = t;
    box.classList.toggle("loc-status--warn", warn);
    $("#useGpsBtn").hidden = !pos.manual;
    const fb = $("#followBtn");
    if (fb) fb.classList.toggle("map-btn--active", pos.follow);
    const lb = $("#locateBtn");
    if (lb) lb.classList.toggle("map-btn--active", !!(tracker && tracker.isActive()));
  }

  /* Нарисовать пользователя на карте */
  function drawUser() {
    if (!overlay) return;
    if (pos.manual) overlay.setManual(pos.manual.x, pos.manual.y);
    else if (pos.gps && pos.gps.inside) {
      overlay.setGps(pos.gps.x, pos.gps.y, pos.gps.accuracyM / D.METERS_PER_PIXEL, screenHeading());
    } else overlay.clearUser();       // вне кампуса точку за картой не рисуем
  }
  function screenHeading() {
    return (pos.heading === null || !geoT) ? null : geoT.headingToScreenAngle(pos.heading);
  }
  function centerOnMe() {
    const me = currentStart();
    if (me && ctx) ctx.map.setView(ctx.ll(me.x, me.y), Math.max(ctx.map.getZoom(), 0), { animate: true });
  }

  /* ---------------- 2.7 GPS: кнопка «Где я?» ---------------- */
  function startGps() {
    if (!M) return;
    if (!tracker) tracker = M.createGeoTracker(onGps, onGpsError, onHeading);
    tracker.startCompass();     // на iPhone разрешение на компас спрашивается только в обработчике нажатия
    if (!geoT) {
      pos.gpsMsg = "Привязка GPS не настроена: проверьте GEO_CONTROL_POINTS в data.js. Используйте «Я здесь».";
      renderStatus();
      return;
    }
    if (tracker.isActive()) {   // GPS уже работает — просто центрируем
      if (pos.manual) useGps(); else centerOnMe();
      return;
    }
    pos.gpsMsg = "Определяю местоположение… Разрешите доступ к геолокации, если браузер спросит.";
    pos.centerOnFix = true;
    tracker.start();
    renderStatus();
  }

  function onGps(coords) {
    const p = L.locateOnMap(coords.latitude, coords.longitude, geoT);
    pos.gps = { x: p.x, y: p.y, inside: p.inside, accuracyM: coords.accuracy || 0 };
    pos.gpsMsg = "";
    if (!pos.manual) {
      drawUser();
      if (p.inside && (pos.follow || pos.centerOnFix)) {
        pos.centerOnFix = false;
        ctx.map.setView(ctx.ll(p.x, p.y), Math.max(ctx.map.getZoom(), 0), { animate: true });
      }
      /* Маршрут перестраиваем, если человек сдвинулся заметно (> 8 px) */
      if (routeShown && p.inside && (!lastRouteStart ||
          Math.hypot(lastRouteStart.x - p.x, lastRouteStart.y - p.y) > 8)) buildRoute(false);
    }
    renderStatus();
  }
  function onGpsError(err) {
    pos.gpsMsg = err.message;
    renderStatus();
  }
  /* Компас: обновляем конус не чаще кадра анимации */
  let headingFrame = 0;
  function onHeading(h) {
    pos.heading = h;
    if (headingFrame) return;
    headingFrame = requestAnimationFrame(function () {
      headingFrame = 0;
      if (overlay && !pos.manual) overlay.setHeading(screenHeading());
    });
  }

  /* «Следовать за мной»: карта двигается вслед за синей точкой */
  function setFollow(on) {
    pos.follow = on;
    if (on) centerOnMe();
    renderStatus();
  }
  function toggleFollow() {
    if (!currentStart()) {          // положения ещё нет — сначала включаем GPS
      startGps();
      pos.follow = true;
      renderStatus();
      return;
    }
    setFollow(!pos.follow);
  }

  /* ---------------- 2.8 «Я здесь»: ручное положение ---------------- */
  function startPicking() {
    if (!ctx) return;
    pos.picking = true;
    $("#pickHint").hidden = false;
    ctx.map.getContainer().classList.add("map-view--picking");
    $(".map-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function stopPicking() {
    pos.picking = false;
    $("#pickHint").hidden = true;
    if (ctx) ctx.map.getContainer().classList.remove("map-view--picking");
  }
  function setManual(x, y, label, floor) {
    pos.manual = { x: x, y: y, label: label };
    if (floor) setMyFloor(floor, true);
    pos.follow = false;
    stopPicking();
    drawUser();
    renderStatus();
    if (routeShown) buildRoute(false);
  }
  /* «Использовать GPS»: забываем ручную точку */
  function useGps() {
    pos.manual = null;
    $("#hereSelect").value = "";
    if (!tracker || !tracker.isActive()) { drawUser(); startGps(); }
    else { drawUser(); centerOnMe(); }
    renderStatus();
    if (routeShown) buildRoute(false);
  }
  $("#pickCancel").addEventListener("click", stopPicking);
  $("#useGpsBtn").addEventListener("click", useGps);
  $("#locateBtn2").addEventListener("click", function () { if (pos.manual) useGps(); else startGps(); });
  $("#hereBtn2").addEventListener("click", startPicking);

  /* Список «где я»: объекты, блоки и аудитории (у аудитории — вход в крыло её блока) */
  (function fillHereSelect() {
    const sel = $("#hereSelect");
    const graph = L.getCampusGraph();
    function group(label, items) {
      const g = document.createElement("optgroup");
      g.label = label;
      items.forEach(function (it) {
        const o = document.createElement("option");
        o.value = it[0];
        o.textContent = it[1];
        g.appendChild(o);
      });
      sel.appendChild(g);
    }
    group("Объекты", D.PLACES.filter(function (p) { return typeof p.x === "number"; })
                             .map(function (p) { return ["place:" + p.id, (p.emoji || "") + " " + p.name]; }));
    group("Блоки", Object.keys(D.ZONES).map(function (z) { return ["zone:" + z, D.ZONES[z].name]; }));
    Object.keys(D.ZONES).forEach(function (z) {
      group("Аудитории " + z, D.ROOMS.filter(function (r) { return r.zone === z; })
                                    .map(function (r) { return ["room:" + r.code, r.code + " (этаж " + r.floor + ")"]; }));
    });
    sel.addEventListener("change", function () {
      const v = sel.value;
      if (!v) return;
      const kind = v.slice(0, v.indexOf(":")), id = v.slice(v.indexOf(":") + 1);
      if (kind === "place") {
        const p = D.PLACES.find(function (x) { return x.id === id; });
        setManual(p.x, p.y, p.name, "1");
      } else if (kind === "zone") {
        const n = graph.nodes[D.ZONE_NODES[id].entry];
        setManual(n.x, n.y, D.ZONES[id].name);
      } else if (kind === "room") {
        const r = D.ROOMS.find(function (x) { return x.code === id; });
        const n = graph.nodes[D.ZONE_NODES[r.zone].entry];
        setManual(n.x, n.y, "у аудитории " + r.code, r.floor);
      }
      if (ctx && pos.manual) ctx.map.setView(ctx.ll(pos.manual.x, pos.manual.y), Math.max(ctx.map.getZoom(), 0));
    });
  })();

  /* «Я на этаже»: GPS этаж не определяет — пользователь выбирает сам */
  function setMyFloor(f, silent) {
    pos.myFloor = f;
    $$(".myfloor-btn").forEach(function (b) { b.classList.toggle("chip--active", b.dataset.floor === f); });
    if (!silent) { renderStatus(); if (routeShown) buildRoute(false); }
  }
  $$(".myfloor-btn").forEach(function (b) {
    b.addEventListener("click", function () { setMyFloor(b.dataset.floor); });
  });

  /* ---------------- 2.9 Маршрут «как в картах» ---------------- */
  function buildRoute(fit) {
    if (!target || !ctx) return;
    const start = currentStart();
    const tgt = Object.assign({}, target);
    /* У блока нет «своего» этажа — считаем, что идём по тому же этажу */
    if (tgt.isZone) tgt.floor = pos.myFloor;
    const r = L.planRoute(start, tgt);
    const sum = $("#routeSummary"), list = $("#routeSteps");
    sum.hidden = false;
    if (!r) {
      sum.textContent = "Не удалось построить маршрут: проверьте граф проходов (NODES/EDGES в data.js).";
      list.hidden = true;
      return;
    }
    routeShown = true;
    lastRouteStart = start ? { x: start.x, y: start.y } : null;
    const b = overlay.setRoute(r.points);
    if (fit !== false && b) ctx.map.flyToBounds(b, { padding: [40, 40], maxZoom: 0.5, duration: 0.6 });

    sum.textContent = "≈ " + Math.round(r.distanceM) + " м · ~" + r.minutes + " мин пешком" +
      (r.floorChange ? " · этаж " + r.startFloor + " → " + r.targetFloor : "") +
      (start ? "" : " · от главного входа (ваше положение не определено)");
    list.textContent = "";
    r.steps.forEach(function (s) { list.appendChild(el("li", "", s)); });
    list.hidden = false;
    $("#routeClear").hidden = false;
  }
  function clearRoute() {
    routeShown = false;
    lastRouteStart = null;
    if (overlay) overlay.clearRoute();
    $("#routeSummary").hidden = true;
    $("#routeSteps").hidden = true;
    $("#routeClear").hidden = true;
  }
  $("#routeBtn").addEventListener("click", function () {
    buildRoute(true);
    $(".map-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#routeClear").addEventListener("click", clearRoute);

  renderStatus();

  /* ============ 3. МОЙ SDU: РАСПИСАНИЕ ============ */
  const STORAGE_KEY = "sdu-freshman-schedule-v1";
  const DAY_NAMES = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];

  function loadSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) { /* повреждённые данные — берём пример */ }
    return D.DEFAULT_SCHEDULE.map(function (l) { return Object.assign({}, l); });
  }
  function saveSchedule() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule)); } catch (err) { /* нет места */ }
  }
  let schedule = loadSchedule();

  function renderSchedule() {
    const box = $("#schedule");
    box.textContent = "";
    const today = L.getCurrentDay();           // авто-подсветка текущего дня

    for (let day = 1; day <= 5; day++) {
      const card = el("div", "day" + (day === today ? " day--today" : ""));
      const head = el("div", "day__head");
      head.appendChild(el("span", "day__name", DAY_NAMES[day]));
      if (day === today) head.appendChild(el("span", "day__badge", "СЕГОДНЯ"));
      card.appendChild(head);

      const lessons = L.lessonsForDay(schedule, day);
      if (!lessons.length) card.appendChild(el("p", "day__empty", "Пар нет"));

      lessons.forEach(function (lesson) {
        const row = el("div", "lesson");
        row.appendChild(el("div", "lesson__time", lesson.time));
        row.appendChild(el("div", "lesson__subject", lesson.subject));
        const meta = el("div", "lesson__meta");
        if (lesson.teacher) meta.appendChild(el("span", "", lesson.teacher));
        if (lesson.room) {
          meta.appendChild(el("span", "", "ауд. " + lesson.room));
          const find = el("button", "lesson__btn", "Найти на карте");
          find.type = "button";
          find.addEventListener("click", function () {      // связь с вкладкой «Карта»
            showTab("tab-map");
            $("#searchInput").value = lesson.room;
            doSearch(lesson.room);
          });
          meta.appendChild(find);
        }
        const del = el("button", "lesson__del", "удалить");
        del.type = "button";
        del.addEventListener("click", function () {
          schedule.splice(schedule.indexOf(lesson), 1);
          saveSchedule();
          renderSchedule();
        });
        meta.appendChild(del);
        row.appendChild(meta);
        card.appendChild(row);
      });
      box.appendChild(card);
    }
  }

  $("#lessonForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const lesson = {
      day: Number($("#lfDay").value),
      time: $("#lfTime").value.trim(),
      subject: $("#lfSubject").value.trim(),
      room: $("#lfRoom").value.trim().toUpperCase(),
      teacher: $("#lfTeacher").value.trim()
    };
    if (!L.validateLesson(lesson)) { alert("Укажите время и предмет."); return; }
    schedule.push(lesson);
    saveSchedule();
    renderSchedule();
    e.target.reset();
  });

  $("#resetSchedule").addEventListener("click", function () {
    if (!confirm("Вернуть расписание к примеру? Ваши пары будут удалены.")) return;
    schedule = D.DEFAULT_SCHEDULE.map(function (l) { return Object.assign({}, l); });
    saveSchedule();
    renderSchedule();
  });

  /* ============ 4. ОТЗЫВЫ: iframe + запасной вариант ============ */
  function showFallback() {
    $("#reviewLoading").hidden = true;
    $("#reviewFrame").hidden = true;
    $("#reviewFallback").hidden = false;
    renderTeachers("");
  }
  function renderTeachers(q) {
    const ul = $("#teacherList");
    ul.textContent = "";
    L.filterTeachers(D.TEACHERS, q).forEach(function (t) { ul.appendChild(el("li", "", t)); });
  }
  function loadReviews() {
    if (!navigator.onLine) { showFallback(); return; }
    const frame = $("#reviewFrame");
    let done = false;
    const timer = setTimeout(function () { if (!done) showFallback(); }, 8000);
    frame.addEventListener("load", function () {
      done = true; clearTimeout(timer);
      $("#reviewLoading").hidden = true;
      frame.hidden = false;
      /* Примечание: сайт, запрещающий встраивание, может всё равно вызвать load
         с пустой страницей — тогда пользователь использует кнопку «Открыть сайт». */
    });
    frame.addEventListener("error", function () { done = true; clearTimeout(timer); showFallback(); });
    frame.src = "https://review.javazhan.tech";
  }
  $("#teacherSearch").addEventListener("input", function (e) { renderTeachers(e.target.value); });

  /* ============ 5. FAQ: аккордеон и сленг ============ */
  function renderFAQ(query) {
    const list = $("#faqList");
    list.textContent = "";
    const items = L.filterFAQ(D.FAQ, query);
    $("#faqEmpty").hidden = items.length > 0;

    items.forEach(function (f) {
      const item = el("div", "acc-item");
      const q = el("button", "acc-q", f.q);
      q.type = "button";
      q.setAttribute("aria-expanded", "false");
      const a = el("div", "acc-a", f.a);
      q.addEventListener("click", function () {
        const open = item.classList.toggle("acc-item--open");
        q.setAttribute("aria-expanded", String(open));
        a.style.maxHeight = open ? a.scrollHeight + 30 + "px" : "0";
      });
      item.appendChild(q);
      item.appendChild(a);
      list.appendChild(item);
    });
  }
  $("#faqSearch").addEventListener("input", function (e) { renderFAQ(e.target.value); });

  function renderSlang() {
    const dl = $("#slangList");
    D.SLANG.forEach(function (s) {
      const row = document.createElement("div");
      row.appendChild(el("dt", "", s.term));
      row.appendChild(el("dd", "", s.meaning));
      dl.appendChild(row);
    });
  }

  /* ============ 6. PWA: service worker ============ */
  /* Регистрация service worker (нужен HTTPS или localhost) */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("Service worker не зарегистрирован:", err);
      });
    });
  }

  /* ============ 7. СТАРТ ============ */
  renderSchedule();
  renderFAQ("");
  renderSlang();
})();
