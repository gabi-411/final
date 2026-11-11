/* =====================================================================
   sw.js — Service Worker: кэширует «оболочку» приложения,
   чтобы карта, расписание и FAQ работали офлайн.
   При изменении файлов увеличьте номер в CACHE_NAME.
   ===================================================================== */
const CACHE_NAME = "sdu-freshman-native-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./logic.js",
  "./map.js",
  "./script.js",
  "./manifest.json",
  "./campus-map.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  /* Режим калибровки (для разработчика) — тоже офлайн */
  "./calibrate.html",
  "./calibrate.js"
];
/* Геолокация не требует сети: координаты даёт сам телефон (GPS),
   а перевод в пиксели карты считается в logic.js на устройстве. */

/* Установка: сохраняем файлы приложения в кэш */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); })
  );
  self.skipWaiting();
});

/* Активация: удаляем старые версии кэша */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
                             .map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

/* Запросы: свои файлы — сначала кэш; внешние сайты (отзывы, my.sdu) не трогаем */
self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (resp) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        return resp;
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
