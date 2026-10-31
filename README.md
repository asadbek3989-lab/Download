# Video Downloader Bot (YouTube + Instagram)

> **v2:** admin panel, reklama yuborish, video ostida bot reklamasi, «Ulashish» tugmasi, majburiy obuna va boshqalar.
> Pastdagi **«Admin panel»** bo'limiga qarang.

Telegram bot: havola yuborsangiz, video (sifat tanlab) yoki MP3 qaytaradi.
Interfeys: O'zbekcha / Русский / English (`/start` dan keyin tanlanadi, `/lang` bilan almashtiriladi).

## Muhim: nega Vercel emas?
Bot `yt-dlp` va `ffmpeg` ishlatadi, ular uzoq ishlaydigan jarayonlar. Vercel serverless
funksiyalari 10-60 soniyada to'xtaydi va bu dasturlarni ishga tushira olmaydi.
Shuning uchun bot **Docker** bilan **Railway / Render / VPS** da ishlaydi.
Kod baribir GitHub orqali ulanadi.

## 1. Bot tokenini olish
1. Telegramda @BotFather ga `/newbot` yuboring, token oling.
2. Ixtiyoriy: `/setdescriptionpic` orqali logotipni (640x360) qo'ying.

## 2. GitHub'ga yuklash
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```
(`.env` va `cookies.txt` `.gitignore` da, GitHub'ga chiqmaydi.)

## 3. Railway'ga deploy (eng oson)
1. railway.com → **New Project → Deploy from GitHub repo** → reponi tanlang.
2. Railway `Dockerfile` ni o'zi topadi.
3. **Variables** bo'limiga qo'shing:
   - `BOT_TOKEN` = BotFather tokeni
   - `COOKIES_B64` = (pastga qarang, tavsiya etiladi)
   - `ADMIN_ID` = o'zingizning Telegram ID'ingiz (**admin panel uchun shart**; botga `/id` yuborsangiz ID ni ko'rsatadi)
   - `DATA_DIR` = `/app/data`
4. Deploy tugagach loglarda `@botnomi ishga tushdi` chiqadi.
Bot long-polling bilan ishlaydi, port yoki domen kerak emas.
5. **Volume ulang (muhim):** servis → **Settings → Volumes → Add Volume**, Mount path: `/app/data`.
   Aks holda har redeploy'da foydalanuvchilar bazasi, statistika va sozlamalar o'chib ketadi.
   (Volume ulanmagan bo'lsa ham admin paneldagi **💾 Backup** bilan zaxira olib, keyin tiklash mumkin.)

Render'da ham shunday: **Background Worker** (Docker) yarating. Render'da worker pullik.

## 4. VPS'da (Docker)
```bash
docker build -t vd-bot .
docker run -d --restart unless-stopped --name vd-bot \
  -e BOT_TOKEN=xxxx -e COOKIES_B64=xxxx -v vd-data:/app/data vd-bot
```

## 5. Cookies (YouTube/Instagram bloklashiga qarshi)
Datacenter IP'lardan (Railway, Render, VPS) YouTube ko'pincha "Sign in to confirm you're not a bot"
deb to'sadi, Instagram esa ko'p postlar uchun login so'raydi. Yechim: cookies.txt.
1. Brauzerga "Get cookies.txt LOCALLY" kabi kengaytma o'rnating.
2. **Alohida (zaxira) akkaunt** bilan youtube.com va instagram.com ga kiring.
   Asosiy akkauntni ishlatmang, ba'zan bloklanishi mumkin.
3. Cookie'larni Netscape formatida `cookies.txt` ga eksport qiling (ikkala sayt bitta faylda bo'lishi mumkin).
4. Base64 ga o'giring:
   - Linux/Mac: `base64 -w0 cookies.txt`
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))`
5. Natijani `COOKIES_B64` o'zgaruvchisiga qo'ying.
Cookie'lar vaqt o'tib eskiradi, ishlamay qolsa qayta eksport qiling.

## Sozlamalar (Environment variables)
| O'zgaruvchi | Tavsif | Standart |
|---|---|---|
| `BOT_TOKEN` | Bot tokeni (majburiy) | — |
| `COOKIES_B64` | cookies.txt base64 | bo'sh |
| `PROXY` | Proxy manzili | bo'sh |
| `MAX_PARALLEL` | Bir vaqtda yuklashlar soni | 2 |
| `MAX_DURATION_MIN` | Maksimal video uzunligi (daq.) | 90 |
| `ADMIN_ID` | Admin(lar) Telegram ID'si, vergul bilan: `111,222` | bo'sh |
| `DATA_DIR` | Baza saqlanadigan papka (`db.json`) | ./data |
| `TZ_NAME` | Statistika kunlari uchun vaqt mintaqasi | Asia/Tashkent |

## Cheklovlar
- Telegram Bot API orqali fayl 50 MB gacha. Kattaroq videolar uchun pastroq sifat yoki MP3 taklif qilinadi.
- Baza `DATA_DIR/db.json` da saqlanadi (eski `users.json` avtomatik ko'chiriladi). Volume ulang, aks holda redeploy'da o'chadi.
- Faqat ochiq (public) kontent. Mualliflik huquqi va YouTube/Instagram shartlariga rioya qilish sizning javobgarligingizda.

## Admin panel

`ADMIN_ID` ni qo'yib, botga **/admin** yuboring.

| Bo'lim | Nima qiladi |
|---|---|
| 📊 Statistika | Jami/faol/yangi foydalanuvchilar (24 soat, 7, 30 kun), yuklashlar (YouTube/Instagram, video/MP3), xatolar, tillar, eng faollar, oxirgi 7 kun |
| 📢 Reklama yuborish | Matn, rasm, video, GIF, ovozli xabar, audio, dumaloq video, fayl. **URL tugmalar** qo'shish, til bo'yicha auditoriya tanlash, test yuborish, tasdiqlash, jarayonni ko'rish va to'xtatish. Botni bloklaganlar avtomatik belgilanadi |
| 👋 Start xabari | Har bir til (uz/ru/en) uchun alohida: matn yoki rasm/video/GIF + tugmalar. Qalin, havola, premium emoji saqlanadi. `{bot}` — bot username'i |
| 🏷 Video reklamasi | Har bir video/MP3 ostidagi caption'ga qo'shiladigan reklama matni. Yoqish/o'chirish, namuna ko'rish |
| 📣 Majburiy obuna | Kanallarga obuna bo'lmaguncha yuklashni yopish (bot kanalda admin bo'lishi kerak) |
| 👤 Foydalanuvchilar | ID yoki @username bo'yicha topish, ban/unban, shaxsiy xabar yuborish |
| ⚙️ Sozlamalar | Texnik ishlar rejimi, kunlik limit, maksimal video uzunligi, avto-backup, inline rejim holati |
| 💾 Backup | Bazani JSON fayl qilib olish va tiklash. Avto-backup har 12 soatda asosiy adminga keladi |
| 👮 Adminlar | Qo'shimcha adminlar qo'shish/o'chirish (faqat `ADMIN_ID` dagilar) |

## «Ulashish» tugmasi (muhim sozlama)

Har bir video/MP3 ostida **📤 Ulashish** tugmasi bor. Bosilganda foydalanuvchi suhbat tanlaydi va **videoning o'zi
caption + reklama bilan** yuboriladi, tagida «📥 Botni ochish» tugmasi turadi. Buning uchun **inline rejimni yoqing**:

1. @BotFather → `/setinline` → botingizni tanlang → istalgan placeholder yozing (masalan `Video...`).
2. Admin panel → ⚙️ Sozlamalar → **🔄 Inline rejimni tekshirish** (yoki botni qayta ishga tushiring).

Inline yoqilmagan bo'lsa, tugma faqat bot havolasini ulashadi. Ulashish orqali kelgan yangi foydalanuvchilar
statistikada «Ulashish orqali kelganlar» sifatida hisoblanadi.

## Qo'shimcha imkoniyatlar

- Havola yuborilgandan so'ng chiqadigan xabarda videoning **muqovasi (thumbnail)** ko'rinadi.
- **Tezkor kesh:** bir xil video shu sifatda qayta so'ralsa, qayta yuklab olinmaydi, Telegramdagi nusxa darhol yuboriladi.
- Foydalanuvchi buyruqlari: `/help`, `/me` (shaxsiy statistika), `/share` (botni do'stlarga ulashish), `/id`.
- Yuklashlar endi bir-birini kutdirmaydi (oldin bitta foydalanuvchi yuklayotganda hamma kutib qolardi).
- Bot to'xtatilganda baza diskka yoziladi (redeploy xavfsiz).
