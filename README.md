# Video Downloader Bot (YouTube + Instagram) — admin panel bilan

Havola yuboring → muqova bilan karta → sifat/MP3 tanlang → video + «Ulashish» tugmasi.
Interfeys: O'zbekcha / Русский / English.

## Imkoniyatlar
**Foydalanuvchilar uchun**
- Havola yuborilishi bilan videoning **muqovasi**, nomi, davomiyligi chiqadi
- Sifat tanlash (360/480/720/1080) yoki MP3; Telegram sig'maydigan sifatlar ko'rsatilmaydi
- Har bir video ostida **📤 Ulashish** tugmasi (inline rejim): video *captioni bilan* istalgan chatga yuboriladi
- Bir xil video qayta so'ralsa — **keshdan darhol** yuboriladi
- Istalgan chatda `@bot` deb yozilsa, oxirgi yuklagan videolari chiqadi

**Admin panel (`/admin`)**
- 📊 Statistika: foydalanuvchilar, yangi/faol, tillar, yuklashlar (kun/hafta/oy), YouTube/Instagram, video/MP3, xatolar, hajm, 7 kunlik grafik, top foydalanuvchilar
- 📣 Reklama: matn / rasm / video / ovozli / audio / GIF / hujjat + **URL tugmalar**, til bo'yicha filtr, ko'rinish (preview), tasdiqlash, jarayon va to'xtatish
- ✏️ /start xabarini har til uchun o'zgartirish (formatlash saqlanadi)
- 🏷 Video captionidagi reklama matnini o'zgartirish
- 👤 Foydalanuvchini qidirish, ban/unban, shaxsiy xabar yuborish
- ⚙️ Texnik ishlar rejimi, majburiy kanalga obuna, maks. davomiylik, kunlik limit
- 🧰 Server holati, **cookies.txt ni bot orqali yuklash**, yt-dlp ni yangilash
- 👮 Qo'shimcha adminlar, 📥 CSV export va baza zaxirasi, ⚠️ oxirgi xatolar

## Sozlash
### 1. BotFather
1. `/newbot` → token.
2. **`/setinline`** → botni tanlang → placeholder: `Video qidirish` (Ulashish tugmasi shu bilan ishlaydi!).
3. Ixtiyoriy: `/setinlinefeedback` → `Enabled` (ulashishlar soni statistikada ko'rinadi).

### 2. Railway
1. Reponi GitHub'ga yuklang (`Dockerfile`, `package.json`, `src/`). Builder: **Dockerfile**.
2. **Variables**: `BOT_TOKEN`, `ADMIN_ID` (sizning Telegram ID'ingiz).
3. **Volume qo'shing**: service → Settings → Volumes → Mount path: `/data`.
   Volume'siz har deployda baza (foydalanuvchilar, statistika, sozlamalar) o'chib ketadi!
4. Deploy tugagach botga `/admin` yuboring.

### 3. Cookies
Admin panel → 🧰 Asboblar → 🍪 Cookies yuklash → `cookies.txt` ni yuboring (redeploy shart emas).
Cookies eskirganda shu yerdan yangilang.

## Muhim
- Fayl chegarasi Telegram Bot API bo'yicha 50 MB.
- Kontent mualliflik huquqi va YouTube/Instagram shartlariga rioya qilish sizning javobgarligingizda.
