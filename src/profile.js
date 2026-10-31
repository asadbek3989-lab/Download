import { settings, persist } from "./store.js";

// ---------- 1) Eski username'ni saqlangan matnlardan yangisiga almashtirish ----------
// Admin panelda saqlangan reklama / start xabarlarida eski username qolgan bo'lsa,
// bot ishga tushganda avtomatik tuzatiladi. (Kod ichida username yozilmaydi: bot uni Telegram'dan o'zi oladi.)
const OLD = "YouTube_Instagram_videosaverbot";
const has = (s) => typeof s === "string" && s.toLowerCase().includes(OLD.toLowerCase());
const re = (src) => new RegExp(src, "gi");

export function migrateUsername(bot) {
  let n = 0;
  const html = (s) => {
    if (!has(s)) return s;
    n++;
    return s
      .replace(re(`https?://t\\.me/${OLD}`), "{link}")
      .replace(re(`t\\.me/${OLD}`), "{link}")
      .replace(re(`@${OLD}`), "{bot}")
      .replace(re(OLD), bot);
  };
  const url = (s) => {
    if (!has(s)) return s;
    n++;
    return s.replace(re(OLD), bot);
  };

  settings.promo = html(settings.promo);
  for (const m of Object.values(settings.start || {})) {
    if (!m) continue;
    m.html = html(m.html);
    for (const row of m.buttons || []) for (const b of row) b.url = url(b.url);
  }
  if (n) {
    persist();
    console.log(`Eski username ${n} joyda @${bot} ga almashtirildi`);
  }
  return n;
}

// ---------- 2) Bot profili: nom, qisqa tavsif, tavsif (uz / ru / en) ----------
// Qidiruvda topilish uchun nom kalit so'zlar bilan boshlanadi. O'chirish: AUTO_PROFILE=0
const P = {
  uz: {
    name: "Video Save | Instagram, YouTube yuklovchi",
    short: "📥 YouTube va Instagramdan video va MP3 yuklaydi. Havolani yuboring, tayyor!",
    desc:
      "📥 Video yuklovchi bot\n\n" +
      "🎬 YouTube va Instagram videolari\n" +
      "🎵 Videoni MP3 ga aylantirish\n" +
      "⚡️ Sifatni o'zingiz tanlaysiz\n" +
      "🆓 Bepul, ro'yxatdan o'tish shart emas\n" +
      "📤 Do'stlarga bir tugmada ulashish\n\n" +
      "Havolani yuboring, qolganini bot qiladi!",
  },
  ru: {
    name: "Video Save | Скачать видео Instagram, YouTube",
    short: "📥 Скачивает видео и MP3 с YouTube и Instagram. Отправьте ссылку — готово!",
    desc:
      "📥 Бот для скачивания видео\n\n" +
      "🎬 Видео с YouTube и Instagram\n" +
      "🎵 Конвертация видео в MP3\n" +
      "⚡️ Качество выбираете сами\n" +
      "🆓 Бесплатно, без регистрации\n" +
      "📤 Делитесь с друзьями одной кнопкой\n\n" +
      "Отправьте ссылку, остальное сделает бот!",
  },
  en: {
    name: "Video Save | Instagram & YouTube Downloader",
    short: "📥 Downloads videos & MP3 from YouTube and Instagram. Just send a link!",
    desc:
      "📥 Video downloader bot\n\n" +
      "🎬 YouTube & Instagram videos\n" +
      "🎵 Convert any video to MP3\n" +
      "⚡️ Choose the quality yourself\n" +
      "🆓 Free, no sign-up needed\n" +
      "📤 Share with friends in one tap\n\n" +
      "Just send a link and the bot does the rest!",
  },
};

// Telegram profil matnini foydalanuvchining TELEGRAM ILOVASI tiliga qarab ko'rsatadi (ko'p o'zbeklarda u
// inglizcha yoki ruscha). Shuning uchun standart rejimda hamma tilga O'ZBEKCHA matn qo'yiladi
// (tavsif oxirida bitta ruscha qator bilan). Uch tilli rejim: PROFILE_MODE=multi
const MULTI = process.env.PROFILE_MODE === "multi";
const RU_LINE = "\n\n🇷🇺 Скачивает видео и MP3 с YouTube и Instagram. Отправьте ссылку!";
// [Telegram til kodi, matn tili]. Til kodisiz yozuv — boshqa barcha tillar uchun.
const TARGETS = MULTI
  ? [["uz", "uz"], ["ru", "ru"], ["en", "en"], [undefined, "uz"]]
  : [["uz", "uz"], ["ru", "uz"], ["en", "uz"], [undefined, "uz"]];

export async function applyProfile(api) {
  if (process.env.AUTO_PROFILE === "0") return;
  for (const [code, l] of TARGETS) {
    const p = P[l];
    const extra = code ? { language_code: code } : {};
    const tag = code || "default";
    const desc = !MULTI ? p.desc + RU_LINE : p.desc;
    const steps = [
      ["name", () => api.getMyName(extra), (v) => v?.name, () => api.setMyName(p.name, extra), p.name],
      ["short", () => api.getMyShortDescription(extra), (v) => v?.short_description, () => api.setMyShortDescription(p.short, extra), p.short],
      ["desc", () => api.getMyDescription(extra), (v) => v?.description, () => api.setMyDescription(desc, extra), desc],
    ];
    for (const [what, get, pick, set, want] of steps) {
      try {
        if (pick(await get()) === want) continue; // allaqachon shunday
        await set();
        console.log(`Profil yangilandi: ${what} (${tag})`);
      } catch (e) {
        console.warn(`Profil (${what}, ${tag}) o'rnatilmadi: ${e.message}`);
      }
    }
  }
}
