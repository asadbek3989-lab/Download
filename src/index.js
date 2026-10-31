import { Bot, InlineKeyboard, InputFile } from "grammy";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { LANGS, CHOOSE_LANG, getT } from "./i18n.js";
import { getLang, setLang, countUsers } from "./store.js";
import { getInfo, download, TooBigError, setupCookies } from "./ytdlp.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN topilmadi. Environment variable sifatida kiriting.");
  process.exit(1);
}

const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
const MAX_DURATION_MIN = Number(process.env.MAX_DURATION_MIN || 90);
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

setupCookies();
const bot = new Bot(token);

// ---------- yordamchilar ----------
const ALLOWED_HOSTS = [/(^|\.)youtube\.com$/, /^youtu\.be$/, /(^|\.)instagram\.com$/];

function extractUrl(text) {
  const m = text.match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    if (ALLOWED_HOSTS.some((r) => r.test(u.hostname))) return u.toString();
  } catch {}
  return null;
}

function fmtDur(sec) {
  if (!sec) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// Bir vaqtda ishlaydigan yuklashlar sonini cheklash
let running = 0;
const queue = [];
const acquire = () =>
  new Promise((res) => {
    if (running < MAX_PARALLEL) {
      running++;
      res();
    } else queue.push(res);
  });
const release = () => {
  const next = queue.shift();
  if (next) next();
  else running--;
};

// Callback tugmalari uchun havolalarni vaqtincha saqlash (64 bayt chegarasi bor)
const jobs = new Map();
setInterval(() => {
  const limit = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs) if (j.ts < limit) jobs.delete(id);
}, 10 * 60 * 1000).unref();

const active = new Set(); // foydalanuvchi boshiga bitta faol yuklash

function askLang(ctx) {
  const kb = new InlineKeyboard();
  for (const [code, name] of Object.entries(LANGS)) kb.text(name, `lang:${code}`);
  return ctx.reply(CHOOSE_LANG, { reply_markup: kb });
}

// ---------- buyruqlar ----------
bot.command("start", async (ctx) => {
  const lang = getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  await ctx.reply(getT(lang).welcome);
});

bot.command("lang", (ctx) => askLang(ctx));

bot.command("stats", async (ctx) => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  await ctx.reply(`👥 Foydalanuvchilar: ${countUsers()}\n⚙️ Hozir ishlayotgan: ${running}`);
});

bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
  const lang = ctx.match[1];
  setLang(ctx.from.id, lang);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(getT(lang).welcome).catch(() => {});
});

// ---------- havola qabul qilish ----------
bot.on("message:text", async (ctx) => {
  const lang = getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  const t = getT(lang);

  const url = extractUrl(ctx.message.text);
  if (!url) return ctx.reply(t.invalid);

  const status = await ctx.reply(t.fetching);
  const edit = (text, extra) =>
    ctx.api.editMessageText(ctx.chat.id, status.message_id, text, extra).catch(() => {});

  try {
    const info = await getInfo(url);
    if (info.duration && info.duration > MAX_DURATION_MIN * 60) {
      return edit(t.tooLong(MAX_DURATION_MIN));
    }

    const id = crypto.randomBytes(4).toString("hex");
    jobs.set(id, {
      url,
      title: info.title,
      uploader: info.uploader,
      duration: info.duration,
      ts: Date.now(),
    });

    const kb = new InlineKeyboard();
    for (const o of info.options) kb.text(o.label || t.video, `dl:${id}:${o.q}`);
    kb.row().text(t.audio, `dl:${id}:mp3`);

    await edit(t.choose(info.title, fmtDur(info.duration)), { reply_markup: kb });
  } catch (e) {
    console.error("getInfo xato:", e.message);
    await edit(t.failed);
  }
});

// ---------- yuklab yuborish ----------
bot.callbackQuery(/^dl:([a-f0-9]+):(\w+)$/, async (ctx) => {
  const [, id, q] = ctx.match;
  const t = getT(getLang(ctx.from.id));
  const job = jobs.get(id);

  if (!job) return ctx.answerCallbackQuery({ text: t.expired, show_alert: true });
  if (active.has(ctx.from.id))
    return ctx.answerCallbackQuery({ text: t.busy, show_alert: true });

  await ctx.answerCallbackQuery();
  active.add(ctx.from.id);

  const chatId = ctx.chat.id;
  const msgId = ctx.callbackQuery.message.message_id;
  const edit = (text) => ctx.api.editMessageText(chatId, msgId, text).catch(() => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-"));

  try {
    await edit(t.downloading);
    await acquire();
    let res;
    try {
      res = await download(job.url, q, dir);
    } finally {
      release();
    }

    await edit(t.uploading);
    const tag = `@${ctx.me.username}`;

    if (q === "mp3") {
      await ctx.api.sendChatAction(chatId, "upload_voice").catch(() => {});
      await ctx.api.sendAudio(chatId, new InputFile(res.file), {
        title: job.title.slice(0, 100),
        performer: job.uploader || undefined,
        duration: job.duration ? Math.round(job.duration) : undefined,
        caption: tag,
      });
    } else {
      await ctx.api.sendChatAction(chatId, "upload_video").catch(() => {});
      await ctx.api.sendVideo(chatId, new InputFile(res.file), {
        caption: `${job.title}\n\n${tag}`.slice(0, 1000),
        supports_streaming: true,
        duration: job.duration ? Math.round(job.duration) : undefined,
      });
    }
    await ctx.api.deleteMessage(chatId, msgId).catch(() => {});
  } catch (e) {
    console.error("download xato:", e.message);
    await edit(e instanceof TooBigError ? t.tooBig : t.failed);
  } finally {
    active.delete(ctx.from.id);
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
});

// ---------- ishga tushirish ----------
bot.catch((err) => console.error("Bot xatosi:", err.error?.message || err));

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.api.setMyCommands([
  { command: "start", description: "Start / Старт" },
  { command: "lang", description: "Til / Язык / Language" },
]);

bot.start({
  drop_pending_updates: true,
  onStart: (me) => console.log(`@${me.username} ishga tushdi`),
});
