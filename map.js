/* =====================================================================
   map.js — карта SDU на чистом JavaScript, DOM и SVG, без Leaflet.
   Координаты — пиксели campus-map.jpg (739×1376); GPS — в logic.js.
   Жесты: Pointer Events (мышь, палец, стилус), один палец — pan,
   два пальца — pinch-to-zoom по расстоянию Math.hypot().
   Все расчёты координат делаются в одной системе, не зависят от DPR.
   ===================================================================== */
(function () {
  "use strict";
  const D = window.SDU_DATA;
  if (!D) { window.SDU_MAP = null; return; }

  const W = D.MAP_SIZE.w, H = D.MAP_SIZE.h;
  const NS = "http://www.w3.org/2000/svg";
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const point = (x, y) => ({ x: x, y: y });
  const elem = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function svgElem(name, attrs) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(k => e.setAttribute(k, String(attrs[k])));
    return e;
  }
  function bounds() {
    return {
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
      extend(p) {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          this.minX = Math.min(this.minX, p.x);
          this.minY = Math.min(this.minY, p.y);
          this.maxX = Math.max(this.maxX, p.x);
          this.maxY = Math.max(this.maxY, p.y);
        }
        return this;
      },
      isValid() { return Number.isFinite(this.minX) && Number.isFinite(this.maxX); }
    };
  }

  /* -------------------------------------------------------------------
     1. Ядро карты: один преобразуемый слой map-stage (translate + scale).
     Важно: нельзя масштабировать всю страницу или сам контейнер viewport.
     Масштабируем только картинку + SVG + маркеры внутри stage.
     ------------------------------------------------------------------- */
  function createBaseMap(container, opts = {}) {
    container.classList.add("native-map");
    container.textContent = "";
    const stage = elem("div", "map-stage");
    stage.style.width = W + "px";
    stage.style.height = H + "px";
    const photo = elem("img", "map-image");
    photo.src = opts.image || "campus-map.jpg";
    photo.alt = "Схема кампуса SDU";
    photo.draggable = false;
    stage.appendChild(photo);

    const svg = svgElem("svg", {
      class: "map-svg", viewBox: `0 0 ${W} ${H}`, width: W, height: H,
      "aria-hidden": "true"
    });
    const zoneLayer = svgElem("g", { class: "map-zones" });
    const routeLayer = svgElem("g", { class: "map-route" });
    const gpsLayer = svgElem("g", { class: "map-gps" });
    svg.append(zoneLayer, routeLayer, gpsLayer);
    stage.appendChild(svg);
    const markerLayer = elem("div", "map-markers");
    stage.appendChild(markerLayer);
    container.appendChild(stage);

    const state = { x: 0, y: 0, scale: 1, minScale: 1, maxScale: 8 };
    const listeners = Object.create(null);
    const fingers = new Map();  // pointerId -> {x,y}, координаты относительно viewport
    let gesture = null, didMove = false, suppressClickUntil = 0;
    let lastTap = { time: 0, x: 0, y: 0 };
    let resizeObserver = null;
    let animTimer = 0;

    function emit(name, detail) {
      (listeners[name] || []).forEach(fn => fn(detail));
    }
    function rect() { return container.getBoundingClientRect(); }
    function viewPoint(e) {
      const r = rect();
      return point(e.clientX - r.left, e.clientY - r.top);
    }
    function unproject(p) { return point((p.x - state.x) / state.scale, (p.y - state.y) / state.scale); }
    function constrain() {
      const r = rect(), wide = W * state.scale, high = H * state.scale;
      if (!r.width || !r.height) return;
      state.x = wide <= r.width ? (r.width - wide) / 2 : clamp(state.x, r.width - wide, 0);
      state.y = high <= r.height ? (r.height - high) / 2 : clamp(state.y, r.height - high, 0);
    }
    function paint(animate = false) {
      constrain();
      stage.classList.toggle("map-stage--animated", animate && !matchMedia("(prefers-reduced-motion: reduce)").matches);
      stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
      // Метки остаются 30–44 CSS-пикселей даже при сильном приближении.
      stage.style.setProperty("--marker-inverse", 1 / state.scale);
      if (animTimer) clearTimeout(animTimer);
      if (animate) animTimer = setTimeout(() => stage.classList.remove("map-stage--animated"), 320);
    }
    function setScaleAt(next, screenX, screenY, animate = false) {
      next = clamp(next, state.minScale, state.maxScale);
      const p = unproject(point(screenX, screenY));
      state.scale = next;
      state.x = screenX - p.x * next;
      state.y = screenY - p.y * next;
      paint(animate);
    }
    function fit(keepView = false) {
      const r = rect();
      if (!r.width || !r.height) return;
      const oldCenter = unproject(point(r.width / 2, r.height / 2));
      state.minScale = Math.min(r.width / W, r.height / H);
      state.maxScale = state.minScale * 8;
      if (!keepView) {
        // На телефоне стартуем чуть ближе: карта сразу доступна для pan.
        // На десктопе показываем всю схему целиком.
        state.scale = r.width < 640
          ? clamp((r.width / W) * 1.1, state.minScale, state.maxScale)
          : state.minScale;
        state.x = (r.width - W * state.scale) / 2;
        state.y = (r.height - H * state.scale) / 2;
      } else {
        state.scale = clamp(state.scale, state.minScale, state.maxScale);
        state.x = r.width / 2 - oldCenter.x * state.scale;
        state.y = r.height / 2 - oldCenter.y * state.scale;
      }
      paint();
    }
    function setView(p, zoom, options = {}) {
      if (!p) return;
      if (!Number.isFinite(state.minScale)) return;
      const scale = clamp(state.minScale * Math.pow(2, Number(zoom) || 0), state.minScale, state.maxScale);
      const r = rect();
      state.scale = scale;
      state.x = r.width / 2 - p.x * scale;
      state.y = r.height / 2 - p.y * scale;
      paint(!!options.animate);
    }
    function flyToBounds(b, options = {}) {
      if (!b || !b.isValid()) return;
      const r = rect(), pad = options.padding || [30, 30];
      const availW = Math.max(10, r.width - 2 * pad[0]);
      const availH = Math.max(10, r.height - 2 * pad[1]);
      const spanX = Math.max(90, b.maxX - b.minX);
      const spanY = Math.max(90, b.maxY - b.minY);
      let z = Math.log2(Math.min(availW / spanX, availH / spanY) / state.minScale);
      if (Number.isFinite(options.maxZoom)) z = Math.min(z, options.maxZoom);
      setView(point((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2), z, { animate: true });
    }
    function getZoom() { return Math.log2(state.scale / state.minScale); }

    /* Pan/pinch при любом числе pointer-устройств. Для двух пальцев
       фиксируем точку карты под центром между пальцами — она не «скачет».
       Начальные касания никогда не сравниваем с предыдущим масштабом. */
    function currentGesture() {
      const a = Array.from(fingers.values());
      if (!a.length) return null;
      if (a.length === 1) return { type: "pan", x: a[0].x, y: a[0].y };
      const mid = point((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
      const distance = Math.max(1, Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y));
      return { type: "pinch", distance, initialScale: state.scale,
               anchor: unproject(mid), mid };
    }
    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Кнопки управления и POI нажимаются, но не перетаскивают карту.
      if (e.target.closest(".map-controls, .map-marker--button")) return;
      if (e.cancelable) e.preventDefault();
      stage.classList.remove("map-stage--animated");
      const p = viewPoint(e);
      fingers.set(e.pointerId, p);
      gesture = currentGesture();
      if (fingers.size === 1) { didMove = false; }
      else { didMove = true; }
    }
    function onPointerMove(e) {
      if (!fingers.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();
      const p = viewPoint(e), prev = fingers.get(e.pointerId);
      fingers.set(e.pointerId, p);
      if (fingers.size === 1 && gesture && gesture.type === "pan") {
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.2) {
          if (!didMove && Math.hypot(p.x - gesture.x, p.y - gesture.y) > 5) {
            didMove = true;
            emit("dragstart", {});
          }
          state.x += dx; state.y += dy; paint();
        }
      } else if (fingers.size >= 2 && gesture && gesture.type === "pinch") {
        const a = Array.from(fingers.values());
        const mid = point((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2);
        const distance = Math.max(1, Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y));
        const newScale = clamp(gesture.initialScale * distance / gesture.distance,
                               state.minScale, state.maxScale);
        state.scale = newScale;
        state.x = mid.x - gesture.anchor.x * newScale;
        state.y = mid.y - gesture.anchor.y * newScale;
        paint();
      }
    }
    function onPointerUp(e) {
      if (!fingers.has(e.pointerId)) return;
      const p = fingers.get(e.pointerId);
      const wasPinch = fingers.size > 1;
      fingers.delete(e.pointerId);
      if (didMove || wasPinch) suppressClickUntil = performance.now() + 220;
      if (!wasPinch && !didMove && e.type === "pointerup" && e.pointerType === "touch") {
        const now = performance.now();
        if (now - lastTap.time < 310 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24) {
          setScaleAt(state.scale * 1.8, p.x, p.y, true);
          suppressClickUntil = now + 280;
          lastTap.time = 0;
        } else lastTap = { time: now, x: p.x, y: p.y };
      }
      gesture = currentGesture();
      if (!fingers.size) didMove = false;
    }
    container.addEventListener("pointerdown", onPointerDown, { passive: false });
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    // Для iOS Safari: гарантированно пресекаем системный скролл/пинч.
    container.addEventListener("touchmove", e => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    container.addEventListener("wheel", e => {
      if (e.cancelable) e.preventDefault();
      const p = viewPoint(e);
      setScaleAt(state.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    container.addEventListener("dblclick", e => {
      e.preventDefault();
      const p = viewPoint(e);
      setScaleAt(state.scale * 1.8, p.x, p.y, true);
    });
    container.addEventListener("click", e => {
      if (performance.now() < suppressClickUntil) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      if (e.target.closest(".map-controls")) return;
      emit("click", { latlng: unproject(viewPoint(e)), originalEvent: e });
    }, true);

    /* Нативные плавающие кнопки масштабирования. */
    const zoomControls = elem("div", "map-controls map-controls--zoom");
    function zoomButton(sign, title, factor) {
      const button = elem("button", "map-btn", sign);
      button.type = "button"; button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", () => {
        const r = rect(); setScaleAt(state.scale * factor, r.width / 2, r.height / 2, true);
      });
      zoomControls.appendChild(button);
    }
    zoomButton("+", "Приблизить", Math.SQRT2);
    zoomButton("−", "Отдалить", 1 / Math.SQRT2);
    container.appendChild(zoomControls);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!rect().width) return;
        fit(true);
      });
      resizeObserver.observe(container);
    } else window.addEventListener("resize", () => fit(true));
    fit(false);

    const map = {
      on(type, listener) { (listeners[type] ||= []).push(listener); return this; },
      getContainer: () => container, getZoom, setView, flyToBounds,
      getState: () => ({ x: state.x, y: state.y, scale: state.scale,
                        minScale: state.minScale, maxScale: state.maxScale }),
      setScaleAt, fit
    };
    return { map, fit, ll: (x, y) => point(x, y), px: p => point(p.x, p.y),
             zoneLayer, routeLayer, gpsLayer, markerLayer, bounds };
  }

  /* -------------------------------------------------------------------
     2. Векторные зоны блоков: кликабельны на touch и с клавиатуры.
     ------------------------------------------------------------------- */
  function addZones(ctx, onPick) {
    const layers = {};
    const zoneBounds = {};
    Object.keys(D.ZONES).forEach(key => {
      const b = bounds();
      layers[key] = D.ZONES[key].shapes.map(s => {
        const coords = s.points
          ? s.points.trim().split(/\s+/).map(part => part.split(",").map(Number))
          : [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
        const poly = svgElem("polygon", {
          points: coords.map(p => p.join(",")).join(" "),
          class: "zone-shape zone-" + key,
          tabindex: "0", role: "button", "aria-label": D.ZONES[key].name
        });
        coords.forEach(p => b.extend(point(p[0], p[1])));
        poly.addEventListener("click", e => onPick(key, e));
        poly.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault(); onPick(key, e);
          }
        });
        ctx.zoneLayer.appendChild(poly);
        return poly;
      });
      zoneBounds[key] = b;
    });
    return {
      highlight(key) {
        Object.keys(layers).forEach(k => layers[k].forEach(el =>
          el.classList.toggle("zone--active", k === key)));
      },
      boundsOf(key) { return zoneBounds[key] || null; }
    };
  }

  /* -------------------------------------------------------------------
     3. Маркеры, маршруты, GPS. Позиции используют координаты картинки.
     ------------------------------------------------------------------- */
  function createOverlays(ctx, onPlacePick) {
    const placeNodes = elem("div", "map-places");
    const pinNodes = elem("div", "map-pins");
    const userNodes = elem("div", "map-user");
    ctx.markerLayer.append(placeNodes, pinNodes, userNodes);

    function marker(layer, x, y, cls, content, label, onClick) {
      const el = elem(onClick ? "button" : "div", `map-marker ${cls}${onClick ? " map-marker--button" : ""}`);
      el.style.left = x + "px";
      el.style.top = y + "px";
      if (onClick) {
        el.type = "button";
        el.title = label || "Объект";
        el.setAttribute("aria-label", label || "Объект");
        el.addEventListener("click", e => { e.stopPropagation(); onClick(); });
      } else { el.setAttribute("aria-hidden", "true"); }
      el.appendChild(content);
      layer.appendChild(el);
      return el;
    }
    D.PLACES.forEach(place => {
      if (!Number.isFinite(place.x) || !Number.isFinite(place.y)) return;
      marker(placeNodes, place.x, place.y, "map-marker--poi",
        elem("span", "place-marker", place.emoji || "📍"), place.name,
        () => { if (onPlacePick) onPlacePick(place); });
    });

    function setPins(markers, emoji, onPinPick) {
      pinNodes.replaceChildren();
      (markers || []).forEach(m => {
        const node = elem("span", "pin");
        node.append(elem("span", "pin__ring"), elem("span", "pin__dot", emoji || "📍"));
        // Маркеры поиска кликабельны: по совпадению координат открываем POI.
        const place = D.PLACES.find(p => p.x === m[0] && p.y === m[1]);
        marker(pinNodes, m[0], m[1], "map-marker--pin", node,
          place ? place.name : "Найденный объект",
          () => {
            if (onPlacePick && place) onPlacePick(place);
            else if (onPinPick) onPinPick(m); // маркер аудитории открывает текущую карточку
          });
      });
    }
    function clearRoute() { ctx.routeLayer.replaceChildren(); }
    function setRoute(points) {
      clearRoute();
      if (!points || points.length < 2) return null;
      const b = bounds();
      points.forEach(p => b.extend(point(p[0], p[1])));
      const data = points.map(p => p[0] + "," + p[1]).join(" ");
      ["route-casing", "route-line"].forEach(cls => {
        ctx.routeLayer.appendChild(svgElem("polyline", { points: data, class: cls }));
      });
      const dest = points[points.length - 1];
      // Окончание маршрута рисуем SVG-текстом поверх линии.
      const end = svgElem("text", { x: dest[0], y: dest[1], class: "route-end-svg", "text-anchor": "middle" });
      end.textContent = "🏁";
      ctx.routeLayer.appendChild(end);
      return b;
    }
    function clearUser() { ctx.gpsLayer.replaceChildren(); userNodes.replaceChildren(); }
    let headingCone = null;
    function setHeading(deg) {
      if (!headingCone) return;
      headingCone.style.display = Number.isFinite(deg) ? "block" : "none";
      if (Number.isFinite(deg)) headingCone.style.transform = `rotate(${deg}deg)`;
    }
    function setGps(x, y, accuracyPx, heading) {
      clearUser();
      const circle = svgElem("circle", {
        cx: x, cy: y, r: Math.max(0, accuracyPx || 0), class: "user-acc"
      });
      ctx.gpsLayer.appendChild(circle);
      const dot = elem("div", "user-dot");
      headingCone = elem("div", "user-dot__cone");
      dot.append(headingCone, elem("div", "user-dot__core"));
      marker(userNodes, x, y, "map-marker--user", dot);
      setHeading(heading);
    }
    function setManual(x, y) {
      clearUser();
      headingCone = null;
      const pin = elem("div", "manual-pin");
      const head = elem("div", "manual-pin__head");
      head.appendChild(elem("div", "manual-pin__label", "Я"));
      pin.appendChild(head);
      marker(userNodes, x, y, "map-marker--manual", pin);
    }
    return { setPins, setRoute, clearRoute, setGps, setHeading, setManual, clearUser };
  }

  /* -------------------------------------------------------------------
     4. Кнопки GPS / следование / «Я здесь» поверх viewport.
     ------------------------------------------------------------------- */
  function addButtons(ctx, items) {
    const box = elem("div", "map-controls map-controls--tools map-btns");
    items.forEach(item => {
      const button = elem("button", "map-btn", item.icon);
      button.type = "button"; button.id = item.id; button.title = item.title;
      button.setAttribute("aria-label", item.title);
      button.addEventListener("click", e => item.onClick(e, button));
      box.appendChild(button);
    });
    ctx.map.getContainer().appendChild(box);
  }

  /* GPS и компас не зависят от движка карты, координаты не отправляются. */
  function createGeoTracker(onPosition, onError, onHeading) {
    let watchId = null, compassOn = false;
    function stop() {
      if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    function start() {
      if (!window.isSecureContext) {
        onError({ code: "insecure", message: "GPS доступен только по HTTPS или на localhost." });
        return false;
      }
      if (!navigator.geolocation) {
        onError({ code: "unsupported", message: "Браузер не поддерживает GPS. Выберите «Я здесь»." });
        return false;
      }
      stop();
      try {
        watchId = navigator.geolocation.watchPosition(
          p => onPosition(p.coords),
          error => {
            const message = error.code === 1 ? "Доступ к GPS запрещён. Разрешите его в настройках браузера или выберите «Я здесь»."
              : error.code === 3 ? "GPS не отвечает. Попробуйте на улице или выберите «Я здесь»."
              : "Не удалось получить GPS. Попробуйте выбрать «Я здесь».";
            if (error.code === 1) stop();
            onError({ code: error.code, message });
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        return true;
      } catch (error) {
        onError({ code: "exception", message: "Геолокация недоступна: " + error.message });
        return false;
      }
    }
    function orientation(e) {
      let angle = null;
      if (typeof e.webkitCompassHeading === "number") angle = e.webkitCompassHeading;
      else if (e.absolute && typeof e.alpha === "number") angle = 360 - e.alpha;
      if (angle === null || !onHeading) return;
      const rotate = screen.orientation && typeof screen.orientation.angle === "number"
        ? screen.orientation.angle : (window.orientation || 0);
      onHeading(((angle + rotate) % 360 + 360) % 360);
    }
    function startCompass() {
      if (compassOn || !onHeading || !window.DeviceOrientationEvent) return;
      const DOE = window.DeviceOrientationEvent;
      const task = typeof DOE.requestPermission === "function"
        ? DOE.requestPermission() : Promise.resolve("granted");
      task.then(permission => {
        if (permission !== "granted") return;
        compassOn = true;
        window.addEventListener("deviceorientation", orientation);
      }).catch(() => {});
    }
    return { start, stop, startCompass, isActive: () => watchId !== null };
  }

  window.SDU_MAP = { createBaseMap, addZones, createOverlays, addButtons,
                     createGeoTracker, ll: point, px: p => point(p.x, p.y) };
})();
