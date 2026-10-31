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
    help:
      "ℹ️ Qanday foydalaniladi:\n1. YouTube yoki Instagram havolasini yuboring.\n2. Sifatni (yoki MP3) tanlang.\n3. Tayyor video ostidagi «Ulashish» tugmasi bilan do'stlaringizga yuboring.\n\nTilni almashtirish: /lang",
    invalid: "❌ Havola tushunarsiz. YouTube yoki Instagram havolasini yuboring.",
    fetching: "🔎 Ma'lumot olinmoqda...",
    choose: (title, dur, by) =>
      `🎬 ${title}\n${by ? `👤 ${by}\n` : ""}⏱ ${dur}\n\nFormatni tanlang:`,
    downloading: "⏳ Yuklab olinmoqda...",
    uploading: "📤 Telegramga yuborilmoqda...",
    tooBig: "⚠️ Fayl Telegram chegarasidan (50 MB) katta. Pastroq sifatni yoki MP3 ni tanlang.",
    tooLong: (min) => `⚠️ Video juda uzun (maksimal ${min} daqiqa).`,
    failed:
      "❌ Yuklab bo'lmadi. Video yopiq bo'lishi yoki havola noto'g'ri bo'lishi mumkin. Keyinroq qayta urinib ko'ring.",
    busy: "⏳ Avvalgi so'rovingiz hali bajarilmoqda. Biroz kuting.",
    expired: "⌛ So'rov eskirgan. Havolani qayta yuboring.",
    audio: "🎵 MP3",
    video: "🎬 Video",
    share: "📤 Ulashish",
    banned: "🚫 Siz botdan foydalanishdan chetlatilgansiz.",
    maintenance: "🛠 Botda texnik ishlar olib borilmoqda. Iltimos, keyinroq urinib ko'ring.",
    limit: (n) => `⚠️ Kunlik limit (${n} ta yuklash) tugadi. Ertaga qayta urinib ko'ring.`,
    subscribe: "📢 Botdan foydalanish uchun kanalimizga obuna bo'ling, so'ng «Tekshirish» tugmasini bosing.",
    subBtn: "📢 Kanalga o'tish",
    checkBtn: "✅ Tekshirish",
    notSub: "❌ Siz hali obuna bo'lmadingiz.",
    subOk: "✅ Rahmat! Endi havolani yuboring.",
    inlineEmpty: "Hali video yuklamagansiz",
  },
  ru: {
    welcome:
      "👋 Привет! Я скачиваю видео с YouTube и Instagram.\n\nПросто отправьте ссылку, и я пришлю видео или MP3.\n\nСменить язык: /lang",
    help:
      "ℹ️ Как пользоваться:\n1. Отправьте ссылку на YouTube или Instagram.\n2. Выберите качество (или MP3).\n3. Кнопкой «Поделиться» под готовым видео отправьте его друзьям.\n\nСменить язык: /lang",
    invalid: "❌ Ссылка не распознана. Отправьте ссылку на YouTube или Instagram.",
    fetching: "🔎 Получаю информацию...",
    choose: (title, dur, by) =>
      `🎬 ${title}\n${by ? `👤 ${by}\n` : ""}⏱ ${dur}\n\nВыберите формат:`,
    downloading: "⏳ Скачиваю...",
    uploading: "📤 Отправляю в Telegram...",
    tooBig: "⚠️ Файл больше лимита Telegram (50 МБ). Выберите меньшее качество или MP3.",
    tooLong: (min) => `⚠️ Видео слишком длинное (максимум ${min} мин).`,
    failed:
      "❌ Не удалось скачать. Видео может быть закрытым, или ссылка неверна. Попробуйте позже.",
    busy: "⏳ Предыдущий запрос ещё выполняется. Подождите.",
    expired: "⌛ Запрос устарел. Отправьте ссылку заново.",
    audio: "🎵 MP3",
    video: "🎬 Видео",
    share: "📤 Поделиться",
    banned: "🚫 Вам закрыт доступ к боту.",
    maintenance: "🛠 В боте идут технические работы. Попробуйте позже.",
    limit: (n) => `⚠️ Дневной лимит (${n} загрузок) исчерпан. Попробуйте завтра.`,
    subscribe: "📢 Чтобы пользоваться ботом, подпишитесь на наш канал и нажмите «Проверить».",
    subBtn: "📢 Перейти в канал",
    checkBtn: "✅ Проверить",
    notSub: "❌ Вы ещё не подписались.",
    subOk: "✅ Спасибо! Теперь отправьте ссылку.",
    inlineEmpty: "Вы ещё ничего не скачивали",
  },
  en: {
    welcome:
      "👋 Hi! I download videos from YouTube and Instagram.\n\nJust send me a link and I'll send back the video or MP3.\n\nChange language: /lang",
    help:
      "ℹ️ How it works:\n1. Send a YouTube or Instagram link.\n2. Pick a quality (or MP3).\n3. Use the «Share» button under the finished video to send it to friends.\n\nChange language: /lang",
    invalid: "❌ Unrecognized link. Please send a YouTube or Instagram link.",
    fetching: "🔎 Getting info...",
    choose: (title, dur, by) =>
      `🎬 ${title}\n${by ? `👤 ${by}\n` : ""}⏱ ${dur}\n\nChoose a format:`,
    downloading: "⏳ Downloading...",
    uploading: "📤 Sending to Telegram...",
    tooBig: "⚠️ The file exceeds Telegram's 50 MB limit. Pick a lower quality or MP3.",
    tooLong: (min) => `⚠️ The video is too long (max ${min} minutes).`,
    failed:
      "❌ Download failed. The video may be private or the link is wrong. Please try again later.",
    busy: "⏳ Your previous request is still running. Please wait.",
    expired: "⌛ This request has expired. Please send the link again.",
    audio: "🎵 MP3",
    video: "🎬 Video",
    share: "📤 Share",
    banned: "🚫 You have been blocked from using this bot.",
    maintenance: "🛠 The bot is under maintenance. Please try again later.",
    limit: (n) => `⚠️ Daily limit (${n} downloads) reached. Try again tomorrow.`,
    subscribe: "📢 To use the bot, please subscribe to our channel and press «Check».",
    subBtn: "📢 Open channel",
    checkBtn: "✅ Check",
    notSub: "❌ You haven't subscribed yet.",
    subOk: "✅ Thanks! Now send a link.",
    inlineEmpty: "You haven't downloaded anything yet",
  },
};

export const getT = (lang) => T[lang] || T.en;
