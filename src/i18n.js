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
      "ℹ️ Qanday foydalaniladi:\n\n1️⃣ YouTube yoki Instagram havolasini yuboring\n2️⃣ Sifatni (yoki MP3) tanlang\n3️⃣ Tayyor! Videoni do'stlaringizga «📤 Ulashish» tugmasi bilan yuboring\n\n/lang — tilni o'zgartirish\n/me — mening statistikam\n/share — botni do'stlarga ulashish",
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
    shareBtn: "📤 Ulashish",
    openBot: "📥 Botni ochish",
    shareText: "🎬 YouTube va Instagramdan video yuklab beruvchi bot — bepul!",
    shareBotMsg: "🎁 Botni do'stlaringizga ulashing — ular ham YouTube va Instagramdan video yuklab olishsin!",
    shareBotBtn: "📤 Botni ulashish",
    promo: "📥 YouTube va Instagramdan video yuklash: {bot}",
    subNeed: "📣 Botdan foydalanish uchun quyidagi kanallarga obuna bo'ling, so'ng «✅ Tekshirish» tugmasini bosing:",
    subCheck: "✅ Tekshirish",
    subNo: "❌ Siz hali hamma kanalga obuna bo'lmagansiz.",
    subOk: "✅ Rahmat! Endi havolani yuboring.",
    limit: (n) => `⚠️ Kunlik limit (${n} ta yuklash) tugadi. Ertaga qayta urinib ko'ring.`,
    maintenance: "🛠 Botda texnik ishlar olib borilmoqda. Birozdan so'ng qayta urinib ko'ring.",
    me: (dl, today, refs) =>
      `👤 Mening statistikam\n\n⬇️ Jami yuklashlar: ${dl}\n📅 Bugun: ${today}\n👥 Siz orqali kelganlar: ${refs}`,
    inlineEmpty: "Avval botda biror video yuklab oling",
    inlineBtn: "Botni ochish",
  },
  ru: {
    welcome:
      "👋 Привет! Я скачиваю видео с YouTube и Instagram.\n\nПросто отправьте ссылку, и я пришлю видео или MP3.\n\nСменить язык: /lang",
    help:
      "ℹ️ Как пользоваться:\n\n1️⃣ Отправьте ссылку на YouTube или Instagram\n2️⃣ Выберите качество (или MP3)\n3️⃣ Готово! Отправьте видео друзьям кнопкой «📤 Поделиться»\n\n/lang — сменить язык\n/me — моя статистика\n/share — поделиться ботом",
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
    shareBtn: "📤 Поделиться",
    openBot: "📥 Открыть бота",
    shareText: "🎬 Бот для скачивания видео с YouTube и Instagram — бесплатно!",
    shareBotMsg: "🎁 Поделитесь ботом с друзьями — пусть и они скачивают видео с YouTube и Instagram!",
    shareBotBtn: "📤 Поделиться ботом",
    promo: "📥 Скачивай видео с YouTube и Instagram: {bot}",
    subNeed: "📣 Чтобы пользоваться ботом, подпишитесь на каналы ниже и нажмите «✅ Проверить»:",
    subCheck: "✅ Проверить",
    subNo: "❌ Вы ещё не подписались на все каналы.",
    subOk: "✅ Спасибо! Теперь отправьте ссылку.",
    limit: (n) => `⚠️ Дневной лимит (${n} загрузок) исчерпан. Попробуйте завтра.`,
    maintenance: "🛠 В боте ведутся технические работы. Попробуйте чуть позже.",
    me: (dl, today, refs) =>
      `👤 Моя статистика\n\n⬇️ Всего загрузок: ${dl}\n📅 Сегодня: ${today}\n👥 Пришли по вашей ссылке: ${refs}`,
    inlineEmpty: "Сначала скачайте видео в боте",
    inlineBtn: "Открыть бота",
  },
  en: {
    welcome:
      "👋 Hi! I download videos from YouTube and Instagram.\n\nJust send me a link and I'll send back the video or MP3.\n\nChange language: /lang",
    help:
      "ℹ️ How to use:\n\n1️⃣ Send a YouTube or Instagram link\n2️⃣ Pick a quality (or MP3)\n3️⃣ Done! Send the video to friends with the «📤 Share» button\n\n/lang — change language\n/me — my stats\n/share — share the bot",
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
    shareBtn: "📤 Share",
    openBot: "📥 Open bot",
    shareText: "🎬 A free bot to download YouTube and Instagram videos!",
    shareBotMsg: "🎁 Share the bot with your friends so they can download YouTube and Instagram videos too!",
    shareBotBtn: "📤 Share the bot",
    promo: "📥 Download YouTube & Instagram videos: {bot}",
    subNeed: "📣 To use the bot, subscribe to the channels below, then tap «✅ Check»:",
    subCheck: "✅ Check",
    subNo: "❌ You haven't subscribed to all channels yet.",
    subOk: "✅ Thanks! Now send a link.",
    limit: (n) => `⚠️ Daily limit (${n} downloads) reached. Try again tomorrow.`,
    maintenance: "🛠 The bot is under maintenance. Please try again shortly.",
    me: (dl, today, refs) =>
      `👤 My stats\n\n⬇️ Total downloads: ${dl}\n📅 Today: ${today}\n👥 Joined via you: ${refs}`,
    inlineEmpty: "Download a video in the bot first",
    inlineBtn: "Open bot",
  },
};

export const getT = (lang) => T[lang] || T.uz;
