/* =====================================================================
   data.js — все данные приложения SDU Freshman.
   Данные хранятся отдельно от разметки, чтобы их было легко менять.

   КАРТА: campus-map.jpg имеет размер 739 x 1376. Все координаты (x, y)
   ниже — в пикселях ЭТОЙ картинки. Чтобы сдвинуть зону или метку,
   поменяйте числа и обновите страницу.

   ВАЖНО: названия некоторых объектов (красная столовая, кофейня и т.д.)
   определены по иконкам на карте — проверьте и поправьте при необходимости.
   Расписание — пример. Файл работает и в браузере (SDU_DATA), и в Node.
   ===================================================================== */
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.SDU_DATA = data;
})(typeof self !== "undefined" ? self : this, function () {

  /* ---------- 0. Размер картинки карты ---------- */
  const MAP_SIZE = { w: 739, h: 1376 };

  /* ---------- 1. Блоки ----------
     shapes: прямоугольники {x,y,w,h} или многоугольники {points:"x,y x,y ..."} */
  const ZONES = {
    A: { name: "Блок A", desc: "Входная часть университета (слева внизу карты).",
         shapes: [{ x: 123, y: 1085, w: 105, h: 291 }] },
    B: { name: "Блок B", desc: "Входная часть университета. Здесь находится Библиотека.",
         shapes: [{ points: "228,1190 440,1190 500,1376 228,1376" }] },
    C: { name: "Блок C", desc: "Входная часть: главный вход, Info, Wi-Fi зона, гардероб.",
         shapes: [{ points: "410,1100 545,1040 590,1100 590,1160 612,1376 520,1270 430,1160" }] },
    D: { name: "Блок D — Faculty of Law & Social Sciences", desc: "Факультет права и социальных наук.",
         shapes: [{ x: 245, y: 878, w: 172, h: 110 }] },
    E: { name: "Блок E — Faculty of Education & Humanities", desc: "Факультет образования и гуманитарных наук.",
         shapes: [{ x: 245, y: 683, w: 172, h: 110 }] },
    F: { name: "Блок F — Faculty of Engineering and Natural Sciences", desc: "Факультет инженерии и естественных наук.",
         shapes: [{ x: 245, y: 488, w: 172, h: 108 }] },
    G: { name: "Блок G — SDU Business School", desc: "Школа бизнеса SDU.",
         shapes: [{ x: 245, y: 290, w: 172, h: 112 }] },
    H: { name: "Блок H", desc: "Самый дальний блок от главного входа.",
         shapes: [{ x: 245, y: 28, w: 172, h: 175 }, { x: 480, y: 33, w: 125, h: 170 }] }
  };
  /* Примечание: блока I на присланной карте нет. Когда добавите его на карту,
     допишите сюда ZONES.I по образцу и добавьте "I" в ROOM_BLOCKS ниже. */

  /* ---------- 2. Этажи ---------- */
  const FLOORS = ["1", "2", "3A", "3B", "4"];

  /* ---------- 3. Объекты на карте (метки) ----------
     x, y — центр метки на картинке; zone — к какому блоку относится;
     emoji — значок на метке. */
  const PLACES = [
    { id: "library", name: "Библиотека", zone: "B", x: 370, y: 1325, emoji: "📚",
      keywords: ["библиотека", "library", "книги"],
      route: "Войдите через главный вход (Block C), идите в Block B (вниз-влево): Библиотека в центре входной части." },
    { id: "wifi", name: "Wi-Fi зона", zone: "C", x: 472, y: 1215, emoji: "📶",
      keywords: ["wifi", "wi-fi", "вайфай", "интернет"],
      route: "Сразу за главным входом (Block C): круглая зона с Wi-Fi в центре холла." },
    { id: "info", name: "Info (справка)", zone: "C", x: 524, y: 1245, emoji: "ℹ️",
      keywords: ["info", "инфо", "справка", "информация"],
      route: "У главного входа (Block C): стойка Info рядом с Wi-Fi зоной." },
    { id: "wardrobe", name: "Гардероб", zone: "C", x: 619, y: 1048, emoji: "🧥",
      keywords: ["гардероб", "wardrobe", "cloakroom"],
      route: "Block C, справа от главного входа." },
    { id: "entrance", name: "Главный вход", zone: "C", x: 570, y: 1160, emoji: "🚪",
      keywords: ["вход", "entrance", "главный вход"],
      route: "Главный вход — внизу карты, Block C. Отсюда идёт главный коридор вверх ко всем блокам." },
    { id: "entrance-g", name: "Вход у Block G", zone: "G", x: 600, y: 345, emoji: "🚪",
      keywords: ["вход g", "entrance g", "второй вход"],
      route: "Второй вход находится у Block G (правая сторона карты)." },
    { id: "bochki", name: "Бочки (лекционные залы)", zone: "D", emoji: "🛢️",
      points: [[475, 727], [510, 835], [477, 908], [510, 978]],   // все 4 зала сразу
      keywords: ["бочки", "бочка", "lecture hall", "лекционный зал"],
      route: "Большие круглые лекционные залы вдоль главного коридора между Block D и Block E (4 зала)." },
    { id: "bochka-1", name: "Бочка 1", zone: "E", x: 475, y: 727, emoji: "🛢️",
      keywords: ["бочка 1"], route: "Первая «бочка» — рядом с Block E, самая верхняя из четырёх." },
    { id: "bochka-2", name: "Бочка 2", zone: "E", x: 510, y: 835, emoji: "🛢️",
      keywords: ["бочка 2"], route: "Вторая «бочка» — между Block E и Block D, самая большая." },
    { id: "bochka-3", name: "Бочка 3", zone: "D", x: 477, y: 908, emoji: "🛢️",
      keywords: ["бочка 3"], route: "Третья «бочка» — рядом с Block D." },
    { id: "bochka-4", name: "Бочка 4", zone: "D", x: 510, y: 978, emoji: "🛢️",
      keywords: ["бочка 4"], route: "Четвёртая «бочка» — ближе всего к главному входу." },
    { id: "rest", name: "Зона отдыха", zone: "E", x: 500, y: 665, emoji: "🛋️",
      keywords: ["зона отдыха", "отдых", "rest", "lounge"],
      route: "Между Block F и Block E, справа от главного коридора (точечная голубая зона)." },
    { id: "cafe", name: "Кофейня", zone: "F", x: 603, y: 620, emoji: "☕",
      keywords: ["кофейня", "кофе", "cafe", "coffee"],
      route: "Block F, справа от коридора, рядом с зоной отдыха." },
    { id: "canteen-f", name: "Столовая (Block F)", zone: "F", x: 525, y: 530, emoji: "🍽️",
      keywords: ["столовая", "canteen", "cafeteria", "еда", "кантин", "столовая f"],
      route: "Block F, правая сторона главного коридора: большая зона с вилкой и ножом." },
    { id: "canteen-red", name: "Red Canteen", zone: "G", x: 527, y: 310, emoji: "🍴",
      keywords: ["red canteen", "красная столовая", "red кантин", "red"],
      route: "Block G, правая сторона: красное здание у второго входа." },
    { id: "canteen-h", name: "H Canteen", zone: "H", x: 485, y: 228, emoji: "🍴",
      keywords: ["h canteen", "h кантин", "столовая h"],
      route: "Между Block H и Block G, правая сторона главного коридора." },
    { id: "medical", name: "Медпункт", zone: "G", x: 398, y: 258, emoji: "➕",
      keywords: ["медпункт", "медицинский", "medical", "врач"],
      route: "Block G, левая сторона главного коридора (розовая зона с крестом)." },
    { id: "support", name: "Support", zone: "D", x: 402, y: 838, emoji: "🙋",
      keywords: ["support", "поддержка", "саппорт"],
      route: "Между Block E и Block D, слева от главного коридора (зелёная зона)." }
  ];

  /* ---------- 4. Аудитории ----------
     У каждого блока 4 этажа: 1, 2, 3A, 3B, 4.
     Номер аудитории: БЛОК + этаж + 0 + номер, например G101, B202, C105.
     ДОПУЩЕНИЕ: 3-й этаж делится на 3A (301–303) и 3B (304–306).
     Если у вас иначе — поменяйте floorRooms ниже. */
  const ROOM_BLOCKS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const FLOOR_ROOMS = {
    "1":  { digit: 1, nums: [1, 2, 3, 4, 5, 6] },
    "2":  { digit: 2, nums: [1, 2, 3, 4, 5, 6] },
    "3A": { digit: 3, nums: [1, 2, 3] },
    "3B": { digit: 3, nums: [4, 5, 6] },
    "4":  { digit: 4, nums: [1, 2, 3, 4, 5, 6] }
  };

  /* Как дойти: главный вход — Block C (внизу карты) */
  function makeRoute(zone, floor) {
    let way;
    if (zone === "C") way = "Block C — это сама входная часть, вы уже рядом.";
    else if (zone === "A" || zone === "B") way = "От главного входа (Block C) идите влево, в " + ZONES[zone].name + ".";
    else way = "От главного входа (Block C) идите по главному коридору вверх до " + ZONES[zone].name + ".";
    return way + " Поднимитесь на " + floor + " этаж.";
  }

  const ROOMS = [];
  ROOM_BLOCKS.forEach(function (zone) {
    FLOORS.forEach(function (floor) {
      const cfg = FLOOR_ROOMS[floor];
      cfg.nums.forEach(function (n) {
        ROOMS.push({ code: zone + cfg.digit + "0" + n, zone: zone, floor: floor,
                     route: makeRoute(zone, floor) });
      });
    });
  });

  /* ---------- 5. Расписание (пример; пользователь может редактировать) ----------
     day: 1=Пн ... 5=Пт  (как в Date.getDay()) */
  const DEFAULT_SCHEDULE = [
    { day: 1, time: "09:00–10:50", subject: "Calculus I",             room: "G101", teacher: "Dr. Ahmetov" },
    { day: 1, time: "11:00–12:50", subject: "Introduction to ICT",    room: "C105", teacher: "Ms. Serikova" },
    { day: 2, time: "10:00–11:50", subject: "English (Academic)",     room: "B202", teacher: "Mr. Johnson" },
    { day: 2, time: "13:00–14:50", subject: "Programming Principles", room: "C201", teacher: "Dr. Nurlan" },
    { day: 3, time: "09:00–10:50", subject: "Calculus I (practice)",  room: "G102", teacher: "Dr. Ahmetov" },
    { day: 3, time: "12:00–13:50", subject: "History of Kazakhstan",  room: "D101", teacher: "Mr. Bekov" },
    { day: 4, time: "10:00–11:50", subject: "Introduction to ICT",    room: "C105", teacher: "Ms. Serikova" },
    { day: 5, time: "09:00–10:50", subject: "Programming Principles", room: "C201", teacher: "Dr. Nurlan" },
    { day: 5, time: "11:00–12:50", subject: "Physical Education",     room: "D103", teacher: "Mr. Aslan" }
  ];

  /* ---------- 6. Преподаватели (запасной поиск во вкладке «Отзывы») ---------- */
  const TEACHERS = [
    "Dr. Ahmetov", "Ms. Serikova", "Mr. Johnson", "Dr. Nurlan", "Mr. Bekov", "Mr. Aslan"
  ];

  /* ---------- 7. FAQ ---------- */
  const FAQ = [
    { q: "Как узнать расписание?",
      a: "Откройте my.sdu.edu.kz → «Расписание». Здесь, во вкладке «Мой SDU», можно также записать свои пары вручную: они сохраняются на вашем устройстве." },
    { q: "Как заказать справку в Student Services?",
      a: "Зайдите в Student Services или оставьте заявку через my.sdu.edu.kz. Возьмите студенческий билет. Сроки уточняйте на месте." },
    { q: "Как подключиться к SDU Wi-Fi?",
      a: "Выберите сеть университета в списке Wi-Fi и войдите с логином и паролем от my.sdu.edu.kz. Если не работает — обратитесь в IT-отдел." },
    { q: "Как подать апелляцию по оценке?",
      a: "Обратитесь к преподавателю сразу после объявления оценки, затем к своему Advisor или в деканат. Подавать нужно в установленные сроки — уточните их в Student Services." },
    { q: "Что такое GPA и как избежать Retake?",
      a: "GPA — средний балл по всем курсам. Retake — повторное прохождение курса при провале. Чтобы избежать: не пропускайте занятия, сдавайте Midterm и ДЗ вовремя, при проблемах сразу идите к Advisor." }
  ];

  /* ---------- 8. Разговорник сленга ---------- */
  const SLANG = [
    { term: "Canvas / Moodle", meaning: "Платформа с учебными материалами, ДЗ и тестами." },
    { term: "Advisor",         meaning: "Академический наставник: помогает с выбором курсов и учебными проблемами." },
    { term: "Midterm",         meaning: "Промежуточный экзамен в середине семестра." },
    { term: "Syllabus",        meaning: "Силлабус: план курса, темы, правила оценивания и сроки." },
    { term: "Retake",          meaning: "Повторное прохождение курса." },
    { term: "GPA",             meaning: "Средний балл (Grade Point Average)." },
    { term: "Бочки",           meaning: "Большие круглые лекционные залы в главном коридоре." }
  ];

  /* =====================================================================
     9. ГЕОПРИВЯЗКА КАРТИНКИ К GPS
     ---------------------------------------------------------------------
     Контрольная точка = место, которое вы знаете и на картинке (x, y в
     пикселях campus-map.jpg), и в реальности (lat, lng по GPS телефона).
     По 3+ точкам logic.js строит аффинное преобразование GPS → пиксели.

     КАК ИЗМЕРИТЬ (≈10 минут):
       1. Откройте на телефоне https://<ваш-сайт>/calibrate.html (нужен HTTPS).
       2. Встаньте в узнаваемое место У КРАЯ здания, лучше снаружи, под
          открытым небом (углы здания, главный вход, вход у Block G,
          торец Block H). Внутри здания GPS ошибается на 10–50 м.
       3. Нажмите «Включить GPS», подождите, пока точность станет ≤ 5–10 м.
       4. Тапните на карте это же место → «Добавить точку».
       5. Повторите для 4–6 точек, разнесённых по всей карте (не на одной
          прямой!), и скопируйте готовый массив сюда.
     Чем дальше точки друг от друга, тем точнее привязка.

     TODO: ниже — ЗАГЛУШКИ (примерные координаты района SDU, Каскелен,
     посчитанные из METERS_PER_PIXEL = 0.3 и «север вверх»). Пока они не
     заменены реальными измерениями, синяя точка будет неточной.
     ===================================================================== */
  const GEO_CONTROL_POINTS = [
    // TODO: заменить реальными измерениями из calibrate.html
    { lat: 43.2096541, lng: 76.6684320, x: 0,   y: 0,    note: "TODO: левый верхний угол картинки" },
    { lat: 43.2096541, lng: 76.6711643, x: 739, y: 0,    note: "TODO: правый верхний угол картинки" },
    { lat: 43.2059459, lng: 76.6684320, x: 0,   y: 1376, note: "TODO: левый нижний угол картинки" },
    { lat: 43.2059459, lng: 76.6711643, x: 739, y: 1376, note: "TODO: правый нижний угол картинки" }
  ];
  /* Поставьте true, когда впишете реальные точки: тогда исчезнет
     предупреждение «привязка GPS не откалибрована». */
  const GEO_CALIBRATED = false;

  /* Запас вокруг картинки (в пикселях), в пределах которого пользователь
     ещё считается «на кампусе» (стоит у входа, на парковке и т.п.). */
  const GEO_MARGIN_PX = 120;

  /* Сколько метров в одном пикселе картинки. Нужен для расстояний
     и времени ходьбы. TODO: проверить. Способы:
       а) calibrate.html после 3+ точек показывает оценку «м/px»;
       б) измерить шагами длину коридора между двумя узлами и разделить
          на расстояние в пикселях между ними. */
  const METERS_PER_PIXEL = 0.3;

  /* Средняя скорость пешехода в помещении, м/с (≈4.3 км/ч) */
  const WALK_SPEED_MPS = 1.2;
  /* Дополнительное время на один пролёт лестницы (этаж), секунд */
  const SECONDS_PER_FLOOR = 20;

  /* =====================================================================
     10. ГРАФ ПРОХОДОВ ДЛЯ МАРШРУТОВ
     ---------------------------------------------------------------------
     NODES — узлы (перекрёстки коридоров, входы в крылья, лестницы, точки
     у объектов). Координаты — пиксели campus-map.jpg (смотрите их в
     calibrate.html: тап по карте показывает x, y).
       id     — уникальное имя (латиница, без пробелов)
       x, y   — положение на картинке
       floor  — этаж узла. Картинка — план 1 этажа, поэтому почти все узлы "1".
       area   — человекочитаемое название участка; из него собирается
                текстовая инструкция («Главный коридор», «Крыло Block F»…)
       stairs — true, если здесь лестница (на ней меняем этаж)
     EDGES — проходы между узлами: [из, в]. Вес (расстояние в пикселях)
       считается автоматически по координатам. Если проход длиннее/тяжелее
       (дверь, улица), можно задать вес вручную третьим элементом:
       ["a", "b", 250]. Все рёбра двусторонние.

     КАК ДОБАВИТЬ УЗЕЛ: допишите строку в NODES и хотя бы одно ребро в
     EDGES к соседнему узлу. Тест «все узлы достижимы» в tests.js
     подскажет, если вы забыли ребро.
     ===================================================================== */
  const MC = "Главный коридор";     // короткие имена для area, чтобы строки были короче
  const NODES = [
    /* --- Главный коридор (идёт вертикально по центру карты, снизу вверх) --- */
    { id: "sp-C",  x: 440, y: 1040, floor: "1", area: MC },
    { id: "sp-D",  x: 432, y: 935,  floor: "1", area: MC },
    { id: "sp-DE", x: 432, y: 838,  floor: "1", area: MC },
    { id: "sp-E",  x: 432, y: 738,  floor: "1", area: MC },
    { id: "sp-EF", x: 432, y: 640,  floor: "1", area: MC },
    { id: "sp-F",  x: 432, y: 543,  floor: "1", area: MC },
    { id: "sp-FG", x: 432, y: 430,  floor: "1", area: MC },
    { id: "sp-G",  x: 432, y: 345,  floor: "1", area: MC },
    { id: "sp-GH", x: 432, y: 250,  floor: "1", area: MC },
    { id: "sp-H",  x: 430, y: 140,  floor: "1", area: MC },

    /* --- Холл Block C (главный вход) --- */
    { id: "c-hall",     x: 480, y: 1085, floor: "1", area: "Холл Block C" },
    { id: "e-main",     x: 555, y: 1150, floor: "1", area: "Главный вход" },
    { id: "n-wifi",     x: 472, y: 1175, floor: "1", area: "Холл Block C" },
    { id: "n-info",     x: 515, y: 1185, floor: "1", area: "Холл Block C" },
    { id: "n-wardrobe", x: 570, y: 1095, floor: "1", area: "Холл Block C" },
    { id: "st-C",       x: 455, y: 1052, floor: "1", area: "Холл Block C", stairs: true },

    /* --- Блоки A и B (входная часть, слева внизу) --- */
    { id: "b-in",      x: 405, y: 1130, floor: "1", area: "Холл Block B" },
    { id: "b-hall",    x: 330, y: 1165, floor: "1", area: "Холл Block B" },
    { id: "n-library", x: 365, y: 1262, floor: "1", area: "Холл Block B" },
    { id: "st-B",      x: 298, y: 1228, floor: "1", area: "Холл Block B", stairs: true },
    { id: "a-in",      x: 235, y: 1150, floor: "1", area: "Вход в Block A" },
    { id: "a-wing",    x: 180, y: 1180, floor: "1", area: "Block A" },

    /* --- Крылья блоков D–H: вход в крыло у коридора и середина крыла --- */
    { id: "d-in",   x: 402, y: 935, floor: "1", area: "Крыло Block D" },
    { id: "d-wing", x: 300, y: 935, floor: "1", area: "Крыло Block D" },
    { id: "e-in",   x: 402, y: 738, floor: "1", area: "Крыло Block E" },
    { id: "e-wing", x: 300, y: 738, floor: "1", area: "Крыло Block E" },
    { id: "f-in",   x: 402, y: 543, floor: "1", area: "Крыло Block F" },
    { id: "f-wing", x: 300, y: 543, floor: "1", area: "Крыло Block F" },
    { id: "g-in",   x: 402, y: 345, floor: "1", area: "Крыло Block G" },
    { id: "g-wing", x: 300, y: 345, floor: "1", area: "Крыло Block G" },
    { id: "h-in",   x: 402, y: 140, floor: "1", area: "Крыло Block H" },
    { id: "h-wing", x: 300, y: 140, floor: "1", area: "Крыло Block H" },
    { id: "h-mid",  x: 465, y: 150, floor: "1", area: "Проход в правую часть Block H" },
    { id: "h-right",x: 520, y: 125, floor: "1", area: "Block H (правая часть)" },

    /* --- Лестницы (иконки-«ступеньки» на карте) --- */
    { id: "st-H", x: 422, y: 165, floor: "1", area: MC, stairs: true },
    { id: "st-G", x: 437, y: 380, floor: "1", area: MC, stairs: true },
    { id: "st-F", x: 437, y: 655, floor: "1", area: MC, stairs: true },
    { id: "st-E", x: 455, y: 820, floor: "1", area: MC, stairs: true },
    { id: "st-D", x: 437, y: 985, floor: "1", area: MC, stairs: true },

    /* --- Узлы у объектов из PLACES --- */
    { id: "n-bochka-1", x: 455, y: 727, floor: "1", area: "Бочка 1" },
    { id: "n-bochka-2", x: 462, y: 830, floor: "1", area: "Бочка 2" },
    { id: "n-bochka-3", x: 452, y: 905, floor: "1", area: "Бочка 3" },
    { id: "n-bochka-4", x: 465, y: 975, floor: "1", area: "Бочка 4" },
    { id: "n-support",  x: 418, y: 838, floor: "1", area: "Support" },
    { id: "n-rest",     x: 475, y: 660, floor: "1", area: "Зона отдыха" },
    { id: "n-cafe",     x: 548, y: 618, floor: "1", area: "Кофейня" },
    { id: "n-canteen-f",x: 470, y: 530, floor: "1", area: "Столовая (Block F)" },
    { id: "g-yard",     x: 490, y: 405, floor: "1", area: "Площадка у входа Block G" },
    { id: "e-g",        x: 585, y: 355, floor: "1", area: "Вход у Block G" },
    { id: "n-red",      x: 470, y: 300, floor: "1", area: "Red Canteen" },
    { id: "n-canteen-h",x: 458, y: 225, floor: "1", area: "H Canteen" },
    { id: "n-medical",  x: 418, y: 258, floor: "1", area: "Медпункт" }
  ];

  const EDGES = [
    /* главный коридор снизу вверх */
    ["sp-C", "sp-D"], ["sp-D", "sp-DE"], ["sp-DE", "sp-E"], ["sp-E", "sp-EF"],
    ["sp-EF", "sp-F"], ["sp-F", "sp-FG"], ["sp-FG", "sp-G"], ["sp-G", "sp-GH"], ["sp-GH", "sp-H"],
    /* холл C и главный вход */
    ["sp-C", "c-hall"], ["sp-C", "st-C"], ["st-C", "c-hall"], ["c-hall", "e-main"],
    ["c-hall", "n-wifi"], ["n-wifi", "n-info"], ["n-info", "e-main"],
    ["c-hall", "n-wardrobe"], ["n-wardrobe", "e-main"],
    /* блоки B и A */
    ["c-hall", "b-in"], ["sp-C", "b-in"], ["b-in", "b-hall"], ["b-hall", "n-library"],
    ["b-hall", "st-B"], ["b-hall", "a-in"], ["a-in", "a-wing"],
    /* крылья */
    ["sp-D", "d-in"], ["d-in", "d-wing"],
    ["sp-E", "e-in"], ["e-in", "e-wing"],
    ["sp-F", "f-in"], ["f-in", "f-wing"],
    ["sp-G", "g-in"], ["g-in", "g-wing"],
    ["sp-H", "h-in"], ["h-in", "h-wing"],
    ["sp-H", "h-mid"], ["h-mid", "h-right"],
    /* лестницы */
    ["sp-H", "st-H"], ["st-H", "sp-GH"],
    ["sp-G", "st-G"], ["st-G", "sp-FG"],
    ["sp-EF", "st-F"], ["st-F", "sp-E"],
    ["sp-DE", "st-E"], ["st-E", "sp-D"],
    ["sp-D", "st-D"], ["st-D", "sp-C"],
    /* объекты */
    ["sp-E", "n-bochka-1"], ["sp-DE", "n-bochka-2"], ["sp-D", "n-bochka-3"], ["st-D", "n-bochka-4"],
    ["sp-DE", "n-support"],
    ["sp-EF", "n-rest"], ["n-rest", "n-cafe"], ["sp-F", "n-canteen-f"],
    ["sp-FG", "g-yard"], ["g-yard", "e-g"], ["sp-G", "n-red"],
    ["sp-GH", "n-canteen-h"], ["sp-GH", "n-medical"]
  ];

  /* В каком узле начинается каждый блок (вход в крыло) и какой
     лестницей в нём подниматься на другие этажи. */
  const ZONE_NODES = {
    A: { entry: "a-wing", stairs: "st-B" },
    B: { entry: "b-hall", stairs: "st-B" },
    C: { entry: "c-hall", stairs: "st-C" },
    D: { entry: "d-wing", stairs: "st-D" },
    E: { entry: "e-wing", stairs: "st-E" },
    F: { entry: "f-wing", stairs: "st-F" },
    G: { entry: "g-wing", stairs: "st-G" },
    H: { entry: "h-wing", stairs: "st-H" }
  };

  /* Узел, откуда стартует маршрут, если положение пользователя неизвестно */
  const DEFAULT_START_NODE = "e-main";

  return { MAP_SIZE: MAP_SIZE, ZONES: ZONES, FLOORS: FLOORS, PLACES: PLACES, ROOMS: ROOMS,
           DEFAULT_SCHEDULE: DEFAULT_SCHEDULE, TEACHERS: TEACHERS, FAQ: FAQ, SLANG: SLANG,
           makeRoute: makeRoute,
           GEO_CONTROL_POINTS: GEO_CONTROL_POINTS, GEO_CALIBRATED: GEO_CALIBRATED,
           GEO_MARGIN_PX: GEO_MARGIN_PX, METERS_PER_PIXEL: METERS_PER_PIXEL,
           WALK_SPEED_MPS: WALK_SPEED_MPS, SECONDS_PER_FLOOR: SECONDS_PER_FLOOR,
           NODES: NODES, EDGES: EDGES, ZONE_NODES: ZONE_NODES, DEFAULT_START_NODE: DEFAULT_START_NODE };
});
