export const LANGS = {
  uz: "🇺🇿 O'zbekcha",
  ru: "🇷🇺 Русский",
  en: "🇬🇧 English",
};

export const CHOOSE_LANG = "🌐 Tilni tanlang / Выберите язык / Choose language";

const T = {
  uz: {
    welcome:
      "👋 Salom! Men YouTube va Instagramdan video yuklab beraman.\n\nShunchaki havolani yuboring, men videoni yoki MP3 ni qaytaraman.\n\nTilni almashtirish: /lang",
    invalid: "❌ Havola tushunarsiz. YouTube yoki Instagram havolasini yuboring.",
    fetching: "🔎 Ma'lumot olinmoqda...",
    choose: (title, dur) => `🎬 ${title}\n⏱ ${dur}\n\nFormatni tanlang:`,
    downloading: "⏳ Yuklab olinmoqda...",
    uploading: "📤 Telegramga yuborilmoqda...",
    tooBig:
      "⚠️ Fayl Telegram chegarasidan (50 MB) katta. Pastroq sifatni yoki MP3 ni tanlang.",
    tooLong: (min) => `⚠️ Video juda uzun (maksimal ${min} daqiqa).`,
    failed:
      "❌ Yuklab bo'lmadi. Video yopiq bo'lishi yoki havola noto'g'ri bo'lishi mumkin. Keyinroq qayta urinib ko'ring.",
    busy: "⏳ Avvalgi so'rovingiz hali bajarilmoqda. Biroz kuting.",
    expired: "⌛ So'rov eskirgan. Havolani qayta yuboring.",
    audio: "🎵 MP3",
    video: "🎬 Video",
  },
  ru: {
    welcome:
      "👋 Привет! Я скачиваю видео с YouTube и Instagram.\n\nПросто отправьте ссылку, и я пришлю видео или MP3.\n\nСменить язык: /lang",
    invalid: "❌ Ссылка не распознана. Отправьте ссылку на YouTube или Instagram.",
    fetching: "🔎 Получаю информацию...",
    choose: (title, dur) => `🎬 ${title}\n⏱ ${dur}\n\nВыберите формат:`,
    downloading: "⏳ Скачиваю...",
    uploading: "📤 Отправляю в Telegram...",
    tooBig:
      "⚠️ Файл больше лимита Telegram (50 МБ). Выберите меньшее качество или MP3.",
    tooLong: (min) => `⚠️ Видео слишком длинное (максимум ${min} мин).`,
    failed:
      "❌ Не удалось скачать. Видео может быть закрытым, или ссылка неверна. Попробуйте позже.",
    busy: "⏳ Предыдущий запрос ещё выполняется. Подождите.",
    expired: "⌛ Запрос устарел. Отправьте ссылку заново.",
    audio: "🎵 MP3",
    video: "🎬 Видео",
  },
  en: {
    welcome:
      "👋 Hi! I download videos from YouTube and Instagram.\n\nJust send me a link and I'll send back the video or MP3.\n\nChange language: /lang",
    invalid: "❌ Unrecognized link. Please send a YouTube or Instagram link.",
    fetching: "🔎 Getting info...",
    choose: (title, dur) => `🎬 ${title}\n⏱ ${dur}\n\nChoose a format:`,
    downloading: "⏳ Downloading...",
    uploading: "📤 Sending to Telegram...",
    tooBig:
      "⚠️ The file exceeds Telegram's 50 MB limit. Pick a lower quality or MP3.",
    tooLong: (min) => `⚠️ The video is too long (max ${min} minutes).`,
    failed:
      "❌ Download failed. The video may be private or the link is wrong. Please try again later.",
    busy: "⏳ Your previous request is still running. Please wait.",
    expired: "⌛ This request has expired. Please send the link again.",
    audio: "🎵 MP3",
    video: "🎬 Video",
  },
};

export const getT = (lang) => T[lang] || T.en;
