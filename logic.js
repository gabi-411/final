/* =====================================================================
   logic.js — чистая логика без работы с DOM (поэтому её легко тестировать).
   Работает в браузере (глобальная SDU_LOGIC) и в Node (для tests.js).
   ===================================================================== */
(function (root, factory) {
  const data = (typeof module === "object" && module.exports)
    ? require("./data.js") : root.SDU_DATA;
  const api = factory(data);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SDU_LOGIC = api;
})(typeof self !== "undefined" ? self : this, function (DATA) {

  /* Нормализация строки: нижний регистр, без лишних пробелов */
  function normalize(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* Точки-метки объекта на карте (у «Бочек» их четыре) */
  function placeMarkers(p) {
    return p.points ? p.points.slice() : [[p.x, p.y]];
  }

  /* Поиск локации: сначала точный код аудитории (G101),
     затем объекты по названию или ключевым словам. Возвращает объект или null. */
  function findLocation(query) {
    const compact = normalize(query).replace(/\s/g, "");
    if (!compact) return null;

    const room = DATA.ROOMS.find(function (r) { return r.code.toLowerCase() === compact; });
    if (room) {
      return { type: "room", title: "Аудитория " + room.code, zone: room.zone,
               floor: room.floor, route: room.route, markers: [] };
    }

    const nq = normalize(query);
    /* 1-й проход: точное совпадение; 2-й: начало слова (от 2 символов) */
    function match(p, loose) {
      return normalize(p.name) === nq || p.keywords.some(function (k) {
        return k === nq || (loose && nq.length >= 2 && k.indexOf(nq) === 0);
      });
    }
    const place = DATA.PLACES.find(function (p) { return match(p, false); }) ||
                  DATA.PLACES.find(function (p) { return match(p, true); });
    if (place) {
      return { type: "place", title: place.name, zone: place.zone, floor: null,
               route: place.route, markers: placeMarkers(place), emoji: place.emoji };
    }
    return null;
  }

  /* Подсказки для поиска (автодополнение): до 6 вариантов */
  function suggest(query) {
    const q = normalize(query);
    if (!q) return [];
    const out = [];
    DATA.PLACES.forEach(function (p) {
      if (normalize(p.name).indexOf(q) !== -1 || p.keywords.some(function (k) { return k.indexOf(q) !== -1; }))
        out.push(p.name);
    });
    DATA.ROOMS.forEach(function (r) {
      if (r.code.toLowerCase().indexOf(q.replace(/\s/g, "")) === 0) out.push(r.code);
    });
    return out.slice(0, 6);
  }

  /* Аудитории этажа (floor: "1","2","3A","3B","4"); zone — необязательно, один блок */
  function roomsOnFloor(floor, zone) {
    return DATA.ROOMS.filter(function (r) {
      return r.floor === String(floor) && (!zone || r.zone === zone);
    });
  }

  /* Текущий день недели: 1=Пн ... 5=Пт; выходные -> 0 (нет подсветки) */
  function getCurrentDay(date) {
    const d = (date || new Date()).getDay();     // 0=Вс, 6=Сб
    return (d >= 1 && d <= 5) ? d : 0;
  }

  /* Пары конкретного дня, отсортированные по времени */
  function lessonsForDay(schedule, day) {
    return schedule.filter(function (l) { return l.day === day; })
                   .sort(function (a, b) { return a.time.localeCompare(b.time); });
  }

  /* Фильтрация FAQ по подстроке в вопросе или ответе */
  function filterFAQ(list, query) {
    const q = normalize(query);
    if (!q) return list.slice();
    return list.filter(function (f) {
      return normalize(f.q).indexOf(q) !== -1 || normalize(f.a).indexOf(q) !== -1;
    });
  }

  /* Фильтр списка преподавателей (запасной поиск во вкладке «Отзывы») */
  function filterTeachers(list, query) {
    const q = normalize(query);
    return list.filter(function (t) { return normalize(t).indexOf(q) !== -1; });
  }

  /* Проверка новой пары перед сохранением */
  function validateLesson(l) {
    if (!l || !(l.day >= 1 && l.day <= 5)) return false;
    return ["time", "subject"].every(function (k) { return normalize(l[k]).length > 0; });
  }

  /* =====================================================================
     ГЕОПРИВЯЗКА: GPS (lat, lng) ⇄ пиксели картинки (x, y)
     ---------------------------------------------------------------------
     Шаг 1. Локальная проекция. Градусы неудобны (1° долготы ≠ 1° широты),
            поэтому переводим их в метры от «центра» контрольных точек:
              u = (lng − lng0) · 111320 · cos(lat0)   — метры на восток
              v = (lat − lat0) · 111320               — метры на север
            На размерах кампуса (сотни метров) ошибка такой проекции — мм.
     Шаг 2. Аффинное преобразование (сдвиг + поворот + масштаб + перекос):
              x = a·u + b·v + c
              y = d·u + e·v + f
            6 неизвестных, каждая точка даёт 2 уравнения → нужно ≥ 3 точек.
            Если точек больше, ищем a…f методом наименьших квадратов
            (минимум суммы квадратов ошибок в пикселях).
            Так как u и v отсчитаны от среднего, Σu = Σv = 0, и система
            распадается: c = среднее x, f = среднее y, а (a,b) и (d,e)
            находятся из системы 2×2:
              [Suu Suv] [a]   [Sux]
              [Suv Svv] [b] = [Svx]     (и так же для y)
     ===================================================================== */
  const M_PER_DEG = 111320;           // метров в 1° широты (и в 1° долготы на экваторе)

  function createGeoTransform(points) {
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error("Нужно минимум 3 контрольные точки");
    }
    const n = points.length;
    let lat0 = 0, lng0 = 0, mx = 0, my = 0;
    points.forEach(function (p) { lat0 += p.lat; lng0 += p.lng; mx += p.x; my += p.y; });
    lat0 /= n; lng0 /= n; mx /= n; my /= n;
    const kx = M_PER_DEG * Math.cos(lat0 * Math.PI / 180);   // метров в 1° долготы здесь
    const ky = M_PER_DEG;

    function toMeters(lat, lng) { return { u: (lng - lng0) * kx, v: (lat - lat0) * ky }; }

    /* Суммы для нормальных уравнений (всё относительно средних) */
    let Suu = 0, Svv = 0, Suv = 0, Sux = 0, Svx = 0, Suy = 0, Svy = 0;
    points.forEach(function (p) {
      const m = toMeters(p.lat, p.lng);
      const dx = p.x - mx, dy = p.y - my;
      Suu += m.u * m.u; Svv += m.v * m.v; Suv += m.u * m.v;
      Sux += m.u * dx;  Svx += m.v * dx;  Suy += m.u * dy;  Svy += m.v * dy;
    });
    const det = Suu * Svv - Suv * Suv;
    /* Если точки лежат на одной прямой (или совпадают), det ≈ 0 —
       по ним нельзя восстановить поворот и масштаб. */
    if (!(Math.abs(det) > 1e-9 * Math.pow(Suu + Svv, 2)) || Suu + Svv === 0) {
      throw new Error("Контрольные точки лежат на одной прямой — добавьте точку в стороне");
    }
    const a = (Sux * Svv - Svx * Suv) / det;
    const b = (Svx * Suu - Sux * Suv) / det;
    const d = (Suy * Svv - Svy * Suv) / det;
    const e = (Svy * Suu - Suy * Suv) / det;

    /* Определитель матрицы [a b; d e] — во сколько раз площадь растягивается
       (пикс² на м²). Нужен для обратного преобразования и масштаба. */
    const detM = a * e - b * d;
    if (Math.abs(detM) < 1e-12) throw new Error("Вырожденное преобразование");

    /* GPS → пиксели */
    function convert(lat, lng) {
      const m = toMeters(lat, lng);
      return { x: a * m.u + b * m.v + mx, y: d * m.u + e * m.v + my };
    }
    /* Пиксели → GPS (обратная матрица 2×2) */
    function invert(x, y) {
      const dx = x - mx, dy = y - my;
      const u = (e * dx - b * dy) / detM;
      const v = (-d * dx + a * dy) / detM;
      return { lat: lat0 + v / ky, lng: lng0 + u / kx };
    }
    /* Ошибка на каждой контрольной точке (в пикселях) — показывает,
       насколько точки согласованы между собой. */
    const residuals = points.map(function (p) {
      const q = convert(p.lat, p.lng);
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    const rmsPx = Math.sqrt(residuals.reduce(function (s, r) { return s + r * r; }, 0) / n);

    /* Направление по компасу (0° = север, по часовой) → угол на экране
       (0° = вверх по картинке, по часовой). Нужен для конуса взгляда. */
    function headingToScreenAngle(headingDeg) {
      const h = headingDeg * Math.PI / 180;
      const su = Math.sin(h), sv = Math.cos(h);          // единичный вектор в метрах (восток, север)
      const px = a * su + b * sv, py = d * su + e * sv;  // тот же вектор в пикселях
      return (Math.atan2(px, -py) * 180 / Math.PI + 360) % 360;
    }

    return {
      convert: convert, invert: invert,
      toPixel: convert, toLatLng: invert,               // понятные синонимы
      residuals: residuals, rmsPx: rmsPx,
      metersPerPixel: 1 / Math.sqrt(Math.abs(detM)),    // средний масштаб по контрольным точкам
      northAngleDeg: headingToScreenAngle(0),           // куда «смотрит» север на картинке
      headingToScreenAngle: headingToScreenAngle,
      matrix: { a: a, b: b, c: mx, d: d, e: e, f: my, lat0: lat0, lng0: lng0 }
    };
  }

  /* Точка внутри картинки карты (с запасом margin пикселей по краям)? */
  function isInsideMap(x, y, margin, size) {
    const s = size || DATA.MAP_SIZE;
    const m = margin === undefined ? DATA.GEO_MARGIN_PX : margin;
    return x >= -m && y >= -m && x <= s.w + m && y <= s.h + m;
  }

  /* Удобная обёртка: GPS → {x, y, inside}. inside=false — «Вы вне кампуса». */
  function locateOnMap(lat, lng, transform, margin) {
    const p = transform.convert(lat, lng);
    return { x: p.x, y: p.y, inside: isInsideMap(p.x, p.y, margin) };
  }

  /* =====================================================================
     ГРАФ ПРОХОДОВ И КРАТЧАЙШИЙ ПУТЬ (алгоритм Дейкстры)
     ===================================================================== */

  /* Строим список смежности: { nodes: {id: узел}, adj: {id: [{to, w}]} }.
     Вес ребра = расстояние между узлами в пикселях (или явно заданный). */
  function buildGraph(nodes, edges) {
    const g = { nodes: {}, adj: {} };
    nodes.forEach(function (n) {
      if (g.nodes[n.id]) throw new Error("Повторяющийся id узла: " + n.id);
      g.nodes[n.id] = n; g.adj[n.id] = [];
    });
    edges.forEach(function (e) {
      const A = g.nodes[e[0]], B = g.nodes[e[1]];
      if (!A || !B) throw new Error("Ребро ссылается на неизвестный узел: " + e[0] + " — " + e[1]);
      const w = e[2] !== undefined ? e[2] : Math.hypot(A.x - B.x, A.y - B.y);
      g.adj[A.id].push({ to: B.id, w: w });
      g.adj[B.id].push({ to: A.id, w: w });       // все проходы двусторонние
    });
    return g;
  }

  /* Граф кампуса строится один раз и переиспользуется */
  let campusGraph = null;
  function getCampusGraph() {
    if (!campusGraph && DATA.NODES) campusGraph = buildGraph(DATA.NODES, DATA.EDGES);
    return campusGraph;
  }

  /* Дейкстра: кратчайший путь между узлами.
     Возвращает { nodes: [id...], distancePx } или null, если цель недостижима.
     Узлов меньше сотни, поэтому вместо кучи берём простой поиск минимума — O(V²),
     этого с запасом хватает и код проще читать. */
  function shortestPath(fromId, toId, graph) {
    const g = graph || getCampusGraph();
    if (!g.nodes[fromId] || !g.nodes[toId]) return null;
    const dist = {}, prev = {}, done = {};
    Object.keys(g.nodes).forEach(function (id) { dist[id] = Infinity; });
    dist[fromId] = 0;
    for (;;) {
      /* берём ещё не обработанный узел с минимальным расстоянием */
      let cur = null;
      Object.keys(dist).forEach(function (id) {
        if (!done[id] && dist[id] < Infinity && (cur === null || dist[id] < dist[cur])) cur = id;
      });
      if (cur === null || cur === toId) break;     // всё достижимое обошли / дошли до цели
      done[cur] = true;
      g.adj[cur].forEach(function (e) {             // «релаксация» рёбер
        const nd = dist[cur] + e.w;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = cur; }
      });
    }
    if (dist[toId] === Infinity) return null;
    const path = [toId];
    while (path[0] !== fromId) path.unshift(prev[path[0]]);
    return { nodes: path, distancePx: dist[toId] };
  }

  /* Ближайший к точке (x, y) узел графа. filter(node) — необязательный отбор
     (например, только лестницы). Возвращает { id, distancePx } или null. */
  function nearestNode(x, y, graph, filter) {
    const g = graph || getCampusGraph();
    let best = null;
    Object.keys(g.nodes).forEach(function (id) {
      const n = g.nodes[id];
      if (filter && !filter(n)) return;
      const d = Math.hypot(n.x - x, n.y - y);
      if (!best || d < best.distancePx) best = { id: id, distancePx: d };
    });
    return best;
  }

  /* Привязка точки к ближайшему РЕБРУ графа (проекция на отрезок).
     Так делают навигаторы: человек стоит посреди коридора, а не в узле.
     Если брать только ближайший узел, маршрут может сначала «вернуться
     назад» к узлу и потом пойти вперёд. Возвращает
     { a, b, x, y, distancePx } — концы ребра и точку проекции. */
  function snapToGraph(x, y, graph) {
    const g = graph || getCampusGraph();
    let best = null;
    Object.keys(g.adj).forEach(function (a) {
      g.adj[a].forEach(function (e) {
        if (a > e.to) return;                         // каждое ребро смотрим один раз
        const A = g.nodes[a], B = g.nodes[e.to];
        const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
        /* t — где на отрезке A→B лежит проекция (0 = в A, 1 = в B) */
        const t = len2 ? Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / len2)) : 0;
        const px = A.x + t * dx, py = A.y + t * dy;
        const d = Math.hypot(x - px, y - py);
        if (!best || d < best.distancePx) best = { a: a, b: e.to, x: px, y: py, distancePx: d };
      });
    });
    return best;
  }

  /* Номер этажа для сравнения: "3A" и "3B" — это 3-й этаж */
  function floorLevel(f) { return parseInt(String(f || "1"), 10) || 1; }

  /* Длина ломаной [[x,y], ...] в пикселях */
  function polylineLength(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  }

  /* Пиксели → метры и время ходьбы */
  function pxToMeters(px) { return px * DATA.METERS_PER_PIXEL; }
  function walkMinutes(meters, floors) {
    const sec = meters / DATA.WALK_SPEED_MPS + (floors || 0) * DATA.SECONDS_PER_FLOOR;
    return Math.max(1, Math.round(sec / 60));
  }

  /* Направление движения по карте словами (верх карты = дальние блоки H, G) */
  function directionWord(dx, dy) {
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "вверх по карте" : "вниз по карте";
    return dx < 0 ? "влево" : "вправо";
  }

  /* Склеиваем два пути (конец первого = начало второго) */
  function joinPaths(p1, p2) {
    if (!p1 || !p2) return null;
    return { nodes: p1.nodes.concat(p2.nodes.slice(1)), distancePx: p1.distancePx + p2.distancePx };
  }

  /* =====================================================================
     ПОСТРОЕНИЕ МАРШРУТА «как в картах»
     start:  { x, y, floor, label } — где пользователь (GPS или вручную).
             Если null — стартуем от главного входа (DEFAULT_START_NODE).
     target: { title, zone, floor, x, y } или { points: [[x,y], ...] }
             для объекта с несколькими метками (Бочки) — выберем ближайшую.
             Для аудитории (x/y нет) цель — вход в крыло её блока.
     Результат: { points, nodes, distancePx, distanceM, minutes, steps,
                  floorChange, stairsNode } или null, если пути нет.
     ===================================================================== */
  function planRoute(start, target, graph) {
    const g = graph || getCampusGraph();

    /* Объект с несколькими метками: пробуем каждую и берём кратчайший маршрут */
    if (target.points && target.points.length > 1) {
      let best = null;
      target.points.forEach(function (pt) {
        const r = planRoute(start, Object.assign({}, target, { points: null, x: pt[0], y: pt[1] }), g);
        if (r && (!best || r.distancePx < best.distancePx)) best = r;
      });
      return best;
    }
    if (target.points && target.points.length === 1) {
      target = Object.assign({}, target, { x: target.points[0][0], y: target.points[0][1], points: null });
    }

    const startFloor = String((start && start.floor) || "1");

    /* 1. Узел цели: у объекта — ближайший к его метке; у аудитории — вход в крыло блока */
    const zn = target.zone && DATA.ZONE_NODES[target.zone];
    const hasPoint = typeof target.x === "number" && typeof target.y === "number";
    const targetNodeId = hasPoint ? nearestNode(target.x, target.y, g).id : (zn && zn.entry);
    if (!targetNodeId) return null;
    const targetFloor = String(target.floor || "1");
    const floorChange = startFloor !== targetFloor;

    /* 2. Путь от узла startId до цели с учётом этажа. GPS этаж не знает —
          его выбирает пользователь. Если этажи разные, путь идёт через лестницу:
          • к аудитории наверху — через лестницу её блока;
          • вниз к объекту 1-го этажа — через ближайшую к старту лестницу. */
    function pathFrom(startId) {
      if (!floorChange) return { path: shortestPath(startId, targetNodeId, g), stairs: null };
      let stairsId = null;
      if (zn && targetFloor !== "1") stairsId = zn.stairs;
      else {
        let bestLen = Infinity;
        Object.keys(g.nodes).forEach(function (id) {
          if (!g.nodes[id].stairs) return;
          const p = shortestPath(startId, id, g);
          if (p && p.distancePx < bestLen) { bestLen = p.distancePx; stairsId = id; }
        });
      }
      return {
        path: stairsId ? joinPaths(shortestPath(startId, stairsId, g), shortestPath(stairsId, targetNodeId, g))
                       : shortestPath(startId, targetNodeId, g),
        stairs: stairsId
      };
    }

    /* 3. Старт. Пользователя проецируем на ближайший коридор (ребро) и
          пробуем оба конца ребра — берём тот, через который путь короче.
          Если положение неизвестно — стартуем от главного входа. */
    let candidates;
    if (start) {
      const s = snapToGraph(start.x, start.y, g);
      candidates = s ? [{ id: s.a, via: [s.x, s.y] }, { id: s.b, via: [s.x, s.y] }]
                     : [{ id: nearestNode(start.x, start.y, g).id, via: null }];
    } else {
      candidates = [{ id: DATA.DEFAULT_START_NODE, via: null }];
    }
    let best = null;
    candidates.forEach(function (c) {
      const res = pathFrom(c.id);
      if (!res.path) return;
      const n0 = g.nodes[c.id];
      const lead = c.via ? Math.hypot(start.x - c.via[0], start.y - c.via[1]) +
                           Math.hypot(c.via[0] - n0.x, c.via[1] - n0.y) : 0;
      const cost = lead + res.path.distancePx;
      if (!best || cost < best.cost) best = { cost: cost, path: res.path, stairs: res.stairs, via: c.via };
    });
    if (!best) return null;
    const path = best.path, stairsId = best.stairs;

    /* 4. Ломаная для карты: точка пользователя → проекция на коридор → узлы → метка объекта */
    const points = [];
    if (start) points.push([start.x, start.y]);
    if (best.via) points.push(best.via);
    path.nodes.forEach(function (id) { points.push([g.nodes[id].x, g.nodes[id].y]); });
    if (hasPoint) points.push([target.x, target.y]);
    /* убираем подряд идущие совпадающие точки */
    const clean = points.filter(function (p, i) {
      return i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.5;
    });

    const distancePx = polylineLength(clean);
    const distanceM = pxToMeters(distancePx);
    const floorsDiff = Math.abs(floorLevel(targetFloor) - floorLevel(startFloor));
    const r = {
      points: clean, nodes: path.nodes, distancePx: distancePx,
      distanceM: distanceM, minutes: walkMinutes(distanceM, floorsDiff),
      floorChange: floorChange, stairsNode: stairsId,
      startFloor: startFloor, targetFloor: targetFloor
    };
    r.steps = routeSteps(r, start, target, g);
    return r;
  }

  /* Текстовая инструкция по узлам маршрута.
     Соседние узлы с одинаковым area склеиваются в один шаг:
     «Идите по главному коридору вверх по карте ~120 м». */
  function routeSteps(r, start, target, g) {
    const steps = [];
    const m = function (px) { return Math.max(1, Math.round(pxToMeters(px))) + " м"; };
    steps.push("Старт: " + (start && start.label ? start.label : "главный вход (Block C)") +
               ", этаж " + r.startFloor + ".");

    /* Если на другом этаже и спуск нужен в начале — говорим об этом сразу у лестницы */
    let prevPt = start ? [start.x, start.y] : [g.nodes[r.nodes[0]].x, g.nodes[r.nodes[0]].y];
    let i = 0;
    while (i < r.nodes.length) {
      const area = g.nodes[r.nodes[i]].area || "проход";
      let j = i, len = 0, last = prevPt, hitStairs = false;
      /* собираем подряд идущие узлы с тем же area */
      while (j < r.nodes.length && (g.nodes[r.nodes[j]].area || "проход") === area) {
        const n = g.nodes[r.nodes[j]];
        len += Math.hypot(n.x - last[0], n.y - last[1]);
        last = [n.x, n.y];
        if (r.nodes[j] === r.stairsNode) { hitStairs = true; break; }
        j++;
      }
      if (pxToMeters(len) >= 4) {   // совсем короткие куски (пара метров) не озвучиваем
        const dir = directionWord(last[0] - prevPt[0], last[1] - prevPt[1]);
        /* первый участок, где человек уже стоит, — «выходим из него» */
        const leaving = i === 0 && start && Math.hypot(start.x - last[0], start.y - last[1]) > 0 && j < r.nodes.length;
        steps.push(area === "Главный коридор"
          ? "Идите по главному коридору " + dir + " ~" + m(len) + "."
          : leaving ? "Из «" + area + "» идите " + dir + " (~" + m(len) + ")."
                    : "Идите " + dir + ": " + area + " (~" + m(len) + ").");
      }
      if (hitStairs) {
        const up = floorLevel(r.targetFloor) - floorLevel(r.startFloor);
        steps.push(up > 0 ? "У лестницы поднимитесь на " + r.targetFloor + " этаж."
                 : up < 0 ? "У лестницы спуститесь на " + r.targetFloor + " этаж."
                 : "Перейдите в часть " + r.targetFloor + " этажа.");
        j++;
      }
      prevPt = last;
      i = j;
    }
    if (r.floorChange && !r.stairsNode) steps.push("Перейдите на " + r.targetFloor + " этаж.");
    steps.push("Вы на месте: " + (target.title || "цель") +
               (target.floor ? " (этаж " + target.floor + ")" : "") + ".");
    return steps;
  }

  return { normalize: normalize, placeMarkers: placeMarkers, findLocation: findLocation,
           suggest: suggest, roomsOnFloor: roomsOnFloor, getCurrentDay: getCurrentDay,
           lessonsForDay: lessonsForDay, filterFAQ: filterFAQ,
           filterTeachers: filterTeachers, validateLesson: validateLesson,
           /* геопривязка */
           createGeoTransform: createGeoTransform, isInsideMap: isInsideMap, locateOnMap: locateOnMap,
           /* граф и маршруты */
           buildGraph: buildGraph, getCampusGraph: getCampusGraph, shortestPath: shortestPath,
           nearestNode: nearestNode, snapToGraph: snapToGraph, planRoute: planRoute, floorLevel: floorLevel,
           polylineLength: polylineLength, pxToMeters: pxToMeters, walkMinutes: walkMinutes };
});
