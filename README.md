# Video Downloader Bot (YouTube + Instagram)

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
   - `ADMIN_ID` = o'zingizning Telegram ID'ingiz (ixtiyoriy, `/stats` uchun)
4. Deploy tugagach loglarda `@botnomi ishga tushdi` chiqadi.
Bot long-polling bilan ishlaydi, port yoki domen kerak emas.

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
| `ADMIN_ID` | `/stats` uchun admin ID | bo'sh |
| `DATA_DIR` | Foydalanuvchi tillari saqlanadigan papka | ./data |

## Cheklovlar
- Telegram Bot API orqali fayl 50 MB gacha. Kattaroq videolar uchun pastroq sifat yoki MP3 taklif qilinadi.
- Tillar `data/users.json` da saqlanadi. Railway'da redeploy qilsa o'chadi (volume ulang yoki foydalanuvchi qayta tanlaydi).
- Faqat ochiq (public) kontent. Mualliflik huquqi va YouTube/Instagram shartlariga rioya qilish sizning javobgarligingizda.
