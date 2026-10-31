// Umumiy ish vaqti holati (admin panelda "server holati" uchun)
export const rt = { running: 0, queued: 0, started: Date.now(), active: new Set() };

/** Handlerni bloklamasdan fonda ishga tushiradi (grammY yangilanishlarni ketma-ket qayta ishlaydi). */
export function spawnTask(fn) {
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error("task xato:", e?.stack || e?.message || e));
}
