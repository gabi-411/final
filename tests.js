/* =====================================================================
   tests.js — автотесты логики (поиск аудиторий, текущий день, FAQ и др.)
   Запуск в терминале:  node tests.js
   Запуск в браузере:   откройте tests.html
   ===================================================================== */
(function (root) {
  const L = (typeof module === "object" && module.exports) ? require("./logic.js") : root.SDU_LOGIC;
  const D = (typeof module === "object" && module.exports) ? require("./data.js") : root.SDU_DATA;

  const results = [];
  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, error: e.message }); }
  }
  function eq(actual, expected) {
    if (actual !== expected) throw new Error("ожидалось " + JSON.stringify(expected) + ", получено " + JSON.stringify(actual));
  }

  /* --- Поиск аудиторий --- */
  test("G101 находится в блоке G, этаж 1", function () {
    const r = L.findLocation("G101"); eq(r.zone, "G"); eq(r.floor, "1");
  });
  test("поиск не зависит от регистра и пробелов (' b202 ')", function () {
    eq(L.findLocation(" b202 ").zone, "B");
  });
  test("C105 находится в блоке C", function () { eq(L.findLocation("C105").zone, "C"); });
  test("блоки A–H все существуют на карте", function () {
    eq(Object.keys(D.ZONES).join(""), "ABCDEFGH");
  });
  test("несуществующая аудитория -> null", function () { eq(L.findLocation("Z999"), null); });
  test("пустой запрос -> null", function () { eq(L.findLocation("   "), null); });
  test("подсказки для 'G1' начинаются с G1", function () {
    const s = L.suggest("G1"); eq(s.length > 0, true); eq(s[0].indexOf("G1"), 0);
  });

  /* --- Объекты на карте --- */
  test("Библиотека находится в блоке B с меткой", function () {
    const r = L.findLocation("Библиотека"); eq(r.zone, "B"); eq(r.markers.length, 1);
  });
  test("Wi-Fi зона находится в блоке C", function () { eq(L.findLocation("wifi").zone, "C"); });
  test("Red Canteen находится в блоке G", function () { eq(L.findLocation("red canteen").zone, "G"); });
  test("H Canteen находится в блоке H", function () { eq(L.findLocation("H Canteen").zone, "H"); });
  test("«Бочки» показывают 4 метки сразу", function () { eq(L.findLocation("бочки").markers.length, 4); });
  test("Зона отдыха находится", function () { eq(L.findLocation("зона отдыха").title, "Зона отдыха"); });
  test("все метки лежат внутри картинки карты", function () {
    D.PLACES.forEach(function (p) {
      L.placeMarkers(p).forEach(function (m) {
        eq(m[0] > 0 && m[0] < D.MAP_SIZE.w && m[1] > 0 && m[1] < D.MAP_SIZE.h, true);
      });
    });
  });
  test("у каждого объекта указан существующий блок", function () {
    D.PLACES.forEach(function (p) { eq(!!D.ZONES[p.zone], true); });
  });

  /* --- Этажи --- */
  test("этажей 5: 1, 2, 3A, 3B, 4", function () { eq(D.FLOORS.join(","), "1,2,3A,3B,4"); });
  test("в блоке G на 1 этаже 6 аудиторий", function () { eq(L.roomsOnFloor("1", "G").length, 6); });
  test("на 3A в блоке D — 3 аудитории (D301–D303)", function () {
    eq(L.roomsOnFloor("3A", "D").map(function (r) { return r.code; }).join(","), "D301,D302,D303");
  });
  test("поиск D304 даёт этаж 3B", function () { eq(L.findLocation("D304").floor, "3B"); });

  /* --- Текущий день --- */
  test("понедельник -> 1", function () { eq(L.getCurrentDay(new Date(2026, 9, 26)), 1); });   // 26.10.2026
  test("среда -> 3", function () { eq(L.getCurrentDay(new Date(2026, 9, 28)), 3); });
  test("суббота -> 0 (нет подсветки)", function () { eq(L.getCurrentDay(new Date(2026, 9, 31)), 0); });
  test("воскресенье -> 0", function () { eq(L.getCurrentDay(new Date(2026, 10, 1)), 0); });

  /* --- Расписание --- */
  test("пары среды отсортированы по времени", function () {
    const l = L.lessonsForDay(D.DEFAULT_SCHEDULE, 3);
    eq(l.length, 2); eq(l[0].time < l[1].time, true);
  });
  test("validateLesson отклоняет пустой предмет", function () {
    eq(L.validateLesson({ day: 1, time: "09:00", subject: "" }), false);
  });
  test("validateLesson принимает корректную пару", function () {
    eq(L.validateLesson({ day: 2, time: "09:00", subject: "Math" }), true);
  });

  /* --- FAQ и преподаватели --- */
  test("фильтр FAQ по 'wi-fi' находит 1 вопрос", function () { eq(L.filterFAQ(D.FAQ, "wi-fi").length, 1); });
  test("пустой фильтр FAQ возвращает все вопросы", function () { eq(L.filterFAQ(D.FAQ, "").length, D.FAQ.length); });
  test("фильтр FAQ без совпадений -> пусто", function () { eq(L.filterFAQ(D.FAQ, "qwertyuiop").length, 0); });
  test("поиск преподавателя 'ahm' находит Dr. Ahmetov", function () {
    eq(L.filterTeachers(D.TEACHERS, "ahm")[0], "Dr. Ahmetov");
  });

  /* --- Геопривязка: аффинное преобразование GPS ⇄ пиксели --- */
  function near(a, b, tol, what) {
    if (Math.abs(a - b) > tol) throw new Error((what || "") + " ожидалось ≈" + b + ", получено " + a);
  }
  /* Искусственная привязка: повёрнута на 30°, 0.5 м/px — проверяем общий случай */
  function makeSynthetic(noisePx) {
    const lat0 = 43.2, lng0 = 76.67, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 111320;
    const ang = 30 * Math.PI / 180, s = 0.5;          // 0.5 м на пиксель
    function px2gps(x, y) {
      const e = (x * Math.cos(ang) - y * Math.sin(ang)) * s;    // метры на восток
      const n = -(x * Math.sin(ang) + y * Math.cos(ang)) * s;   // метры на север (y вниз)
      return { lat: lat0 + n / ky, lng: lng0 + e / kx };
    }
    const pts = [[0, 0], [739, 0], [0, 1376], [739, 1376], [370, 700]].map(function (p, i) {
      const g = px2gps(p[0], p[1]);
      const jitter = noisePx ? (i % 2 ? noisePx : -noisePx) : 0;
      return { lat: g.lat, lng: g.lng, x: p[0] + jitter, y: p[1] - jitter };
    });
    return { pts: pts, px2gps: px2gps };
  }
  test("аффинное: 3 точки → точное совпадение на контрольных точках", function () {
    const s = makeSynthetic(0);
    const t = L.createGeoTransform(s.pts.slice(0, 3));
    eq(t.rmsPx < 1e-6, true);
  });
  test("аффинное: туда-обратно (GPS→px→GPS и px→GPS→px) с ошибкой < 1 px", function () {
    const s = makeSynthetic(0);
    const t = L.createGeoTransform(s.pts);
    [[100, 200], [500, 1300], [369.5, 688], [-50, 1400]].forEach(function (p) {
      const g = s.px2gps(p[0], p[1]);
      const q = t.convert(g.lat, g.lng);                 // GPS → пиксели
      near(q.x, p[0], 1, "x"); near(q.y, p[1], 1, "y");
      const back = t.invert(q.x, q.y);                   // пиксели → GPS
      const q2 = t.convert(back.lat, back.lng);
      eq(Math.hypot(q2.x - q.x, q2.y - q.y) < 1, true);
    });
  });
  test("аффинное: МНК сглаживает шум в контрольных точках", function () {
    const s = makeSynthetic(3);                          // ±3 px ошибки ввода
    const t = L.createGeoTransform(s.pts);
    const g = s.px2gps(400, 600), q = t.convert(g.lat, g.lng);
    eq(Math.hypot(q.x - 400, q.y - 600) < 5, true);
    near(t.metersPerPixel, 0.5, 0.02, "м/px");
  });
  test("аффинное: направление на север учитывает поворот карты (30°)", function () {
    const t = L.createGeoTransform(makeSynthetic(0).pts);
    near(t.northAngleDeg, 330, 0.5, "угол севера");
    near(t.headingToScreenAngle(90), 60, 0.5, "восток");
  });
  test("аффинное: меньше 3 точек или точки на одной прямой → понятная ошибка", function () {
    let msg = "";
    try { L.createGeoTransform([{ lat: 1, lng: 1, x: 0, y: 0 }]); } catch (e) { msg = e.message; }
    eq(msg.indexOf("3") !== -1, true);
    msg = "";
    try {
      L.createGeoTransform([{ lat: 43, lng: 76, x: 0, y: 0 }, { lat: 43.001, lng: 76.001, x: 10, y: 10 },
                            { lat: 43.002, lng: 76.002, x: 20, y: 20 }]);
    } catch (e) { msg = e.message; }
    eq(msg.indexOf("прямой") !== -1, true);
  });
  test("контрольные точки из data.js дают рабочее преобразование", function () {
    eq(D.GEO_CONTROL_POINTS.length >= 3, true);
    const t = L.createGeoTransform(D.GEO_CONTROL_POINTS);
    eq(t.rmsPx < 5, true);
  });
  test("точка внутри карты / вне кампуса", function () {
    eq(L.isInsideMap(370, 700), true);
    eq(L.isInsideMap(-50, 700, 120), true);              // в пределах запаса
    eq(L.isInsideMap(-500, 700, 120), false);
    eq(L.isInsideMap(370, 1376 + 121, 120), false);
    const t = L.createGeoTransform(D.GEO_CONTROL_POINTS);
    eq(L.locateOnMap(43.25, 76.95, t).inside, false);    // центр Алматы — далеко от кампуса
    const g = t.invert(370, 700);
    eq(L.locateOnMap(g.lat, g.lng, t).inside, true);
  });

  /* --- Граф и Дейкстра --- */
  const tiny = L.buildGraph(
    [{ id: "a", x: 0, y: 0 }, { id: "b", x: 10, y: 0 }, { id: "c", x: 10, y: 10 },
     { id: "d", x: 0, y: 10 }, { id: "z", x: 99, y: 99 }],
    [["a", "b"], ["b", "c"], ["a", "d", 100], ["d", "c"]]);
  test("Дейкстра: выбирает короткий путь, а не меньшее число рёбер", function () {
    const p = L.shortestPath("a", "c", tiny);
    eq(p.nodes.join(">"), "a>b>c"); eq(p.distancePx, 20);
  });
  test("Дейкстра: учитывает ручной вес ребра", function () {
    eq(L.shortestPath("a", "d", tiny).nodes.join(">"), "a>b>c>d");
  });
  test("Дейкстра: недостижимая цель → null", function () { eq(L.shortestPath("a", "z", tiny), null); });
  test("Дейкстра: неизвестный узел → null", function () { eq(L.shortestPath("a", "nope", tiny), null); });
  test("Дейкстра: путь из узла в себя — длина 0", function () { eq(L.shortestPath("b", "b", tiny).distancePx, 0); });
  test("ближайший узел к точке", function () {
    eq(L.nearestNode(9, 1, tiny).id, "b");
    eq(L.nearestNode(9, 1, tiny, function (n) { return n.id !== "b"; }).id, "a");
  });
  test("граф кампуса: ребро на неизвестный узел вызывает ошибку", function () {
    let msg = "";
    try { L.buildGraph([{ id: "a", x: 0, y: 0 }], [["a", "b"]]); } catch (e) { msg = e.message; }
    eq(msg.indexOf("неизвестный") !== -1, true);
  });
  test("граф кампуса: все узлы достижимы от главного входа", function () {
    D.NODES.forEach(function (n) {
      if (!L.shortestPath(D.DEFAULT_START_NODE, n.id)) throw new Error("недостижим узел " + n.id);
    });
  });
  test("граф кампуса: все узлы лежат на картинке", function () {
    D.NODES.forEach(function (n) { eq(L.isInsideMap(n.x, n.y, 0), true); });
  });
  test("граф кампуса: у каждого блока A–H есть вход и лестница", function () {
    Object.keys(D.ZONES).forEach(function (z) {
      const zn = D.ZONE_NODES[z];
      eq(!!(zn && L.getCampusGraph().nodes[zn.entry] && L.getCampusGraph().nodes[zn.stairs].stairs), true);
    });
  });
  test("граф кампуса: к каждому объекту из PLACES есть узел ближе 70 px", function () {
    D.PLACES.forEach(function (p) {
      L.placeMarkers(p).forEach(function (m) {
        const nn = L.nearestNode(m[0], m[1]);
        if (nn.distancePx > 70) throw new Error(p.name + ": ближайший узел в " + Math.round(nn.distancePx) + " px");
      });
    });
  });
  test("привязка точки пользователя к ближайшему узлу графа (у главного входа)", function () {
    eq(L.nearestNode(560, 1160).id, "e-main");
  });

  test("привязка к ближайшему ребру: проекция на отрезок", function () {
    const s = L.snapToGraph(5, 3, tiny);              // над ребром a—b
    eq([s.a, s.b].sort().join(","), "a,b"); eq(s.x, 5); eq(s.y, 0); eq(s.distancePx, 3);
  });
  test("точка в главном коридоре привязывается к коридору, а не к соседней «бочке»", function () {
    const s = L.snapToGraph(432, 700);
    eq([s.a, s.b].sort().join(","), "sp-E,sp-EF"); eq(s.distancePx, 0);
  });
  test("маршрут из коридора вверх не делает крюк назад", function () {
    const r = L.planRoute({ x: 432, y: 700, floor: "1" }, { title: "G101", zone: "G", floor: "1" });
    eq(r.nodes[0], "sp-EF");
    eq(r.nodes.indexOf("sp-E"), -1); eq(r.nodes.indexOf("n-bochka-1"), -1);
    /* по y маршрут всё время идёт только вверх (или прямо), пока не свернёт в крыло */
    for (let i = 1; i < r.points.length; i++) eq(r.points[i][1] <= r.points[i - 1][1], true);
  });

  /* --- Маршруты --- */
  test("маршрут от входа до F101 идёт по главному коридору в крыло F", function () {
    const r = L.planRoute(null, { title: "F101", zone: "F", floor: "1" });
    eq(r.nodes[0], "e-main"); eq(r.nodes[r.nodes.length - 1], "f-wing");
    eq(r.nodes.indexOf("sp-F") !== -1, true);
    eq(r.distanceM > 0 && r.minutes >= 1, true);
    eq(r.steps.some(function (s) { return s.indexOf("главному коридору") !== -1; }), true);
  });
  test("маршрут на другой этаж проходит через лестницу блока и говорит «поднимитесь на 3A»", function () {
    const r = L.planRoute({ x: 560, y: 1160, floor: "1", label: "вручную" }, { title: "F301", zone: "F", floor: "3A" });
    eq(r.floorChange, true); eq(r.stairsNode, "st-F");
    eq(r.nodes.indexOf("st-F") !== -1, true);
    eq(r.steps.some(function (s) { return s.indexOf("поднимитесь на 3A") !== -1; }), true);
  });
  test("спуск с 4 этажа к объекту 1 этажа — «спуститесь на 1 этаж»", function () {
    const r = L.planRoute({ x: 300, y: 345, floor: "4" }, { title: "Библиотека", zone: "B", x: 370, y: 1325 });
    eq(r.steps.some(function (s) { return s.indexOf("спуститесь на 1") !== -1; }), true);
  });
  test("маршрут к «Бочкам» ведёт к ближайшей из 4", function () {
    const p = D.PLACES.find(function (x) { return x.id === "bochki"; });
    const r = L.planRoute({ x: 432, y: 640, floor: "1" }, { title: p.name, zone: p.zone, points: p.points });
    const end = r.points[r.points.length - 1];
    eq(end[0] === 475 && end[1] === 727, true);
  });
  test("маршрут доступен до каждого объекта и каждого блока", function () {
    D.PLACES.forEach(function (p) {
      if (!L.planRoute(null, { title: p.name, zone: p.zone, x: p.x, y: p.y, points: p.points }))
        throw new Error("нет маршрута до " + p.name);
    });
    Object.keys(D.ZONES).forEach(function (z) {
      if (!L.planRoute(null, { title: z, zone: z, floor: "2" })) throw new Error("нет маршрута до блока " + z);
    });
  });
  test("время ходьбы: 72 м ≈ 1 мин, плюс время на этажи", function () {
    eq(L.walkMinutes(72, 0), 1);
    eq(L.walkMinutes(144, 3) > L.walkMinutes(144, 0), true);
  });

  /* --- Вывод --- */
  const passed = results.filter(function (r) { return r.ok; }).length;
  if (typeof module === "object" && module.exports) {
    results.forEach(function (r) { console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : " — " + r.error)); });
    console.log("\n" + passed + "/" + results.length + " тестов пройдено");
    if (passed !== results.length) process.exit(1);
  } else {
    root.SDU_TEST_RESULTS = { results: results, passed: passed };
  }
})(typeof self !== "undefined" ? self : this);
