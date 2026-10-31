import { Bot, InlineKeyboard, InputFile } from "grammy";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { LANGS, CHOOSE_LANG, getT } from "./i18n.js";
import * as DB from "./db.js";
import { getInfo, download, TooBigError, setupCookies } from "./ytdlp.js";
import { parseLink, fmtDur, fetchImage, clip } from "./utils.js";
import { buildCaption, getStartMsg } from "./content.js";
import { rt, spawnTask } from "./state.js";
import { registerAdmin } from "./admin.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN topilmadi. Environment variable sifatida kiriting.");
  process.exit(1);
}

const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
setupCookies();

const bot = new Bot(
  token,
  process.env.TG_API_ROOT ? { client: { apiRoot: process.env.TG_API_ROOT } } : undefined
);

const maxDurationMin = () => Number(DB.getSetting("max_duration_min", process.env.MAX_DURATION_MIN || 90));
const dailyLimit = () => Number(DB.getSetting("daily_limit", 0));

// ---------- bir vaqtdagi yuklashlar navbati ----------
const queue = [];
const acquire = () =>
  new Promise((res) => {
    if (rt.running < MAX_PARALLEL) { rt.running++; res(); }
    else { rt.queued++; queue.push(res); }
  });
const release = () => {
  const next = queue.shift();
  if (next) { rt.queued--; next(); } else rt.running--;
};

// ---------- callback tugmalari uchun vaqtinchalik "ish"lar ----------
const jobs = new Map();
setInterval(() => {
  const limit = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs) if (j.ts < limit) jobs.delete(id);
}, 10 * 60 * 1000).unref();

// ---------- umumiy middleware: kuzatuv, ban, texnik ishlar ----------
bot.use(async (ctx, next) => {
  if (ctx.myChatMember) return next();
  const from = ctx.from;
  if (!from || from.is_bot) return next();
  const u = DB.upsertUser(from);
  if (DB.isAdmin(from.id)) return next();

  const t = getT(u.lang);
  const deny = (text) => {
    if (ctx.inlineQuery) return ctx.answerInlineQuery([]).catch(() => {});
    if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => {});
    if (ctx.message) return ctx.reply(text).catch(() => {});
  };
  if (u.banned) return deny(t.banned);
  if (DB.getSetting("maintenance") === "1") return deny(t.maintenance);
  return next();
});

bot.on("my_chat_member", (ctx) => {
  if (ctx.chat.type !== "private") return;
  const s = ctx.myChatMember.new_chat_member.status;
  DB.setBlocked(ctx.from.id, s === "kicked" || s === "left");
});

registerAdmin(bot);

// ---------- /start, /help, /lang ----------
function askLang(ctx) {
  const kb = new InlineKeyboard();
  for (const [code, name] of Object.entries(LANGS)) kb.text(name, `lang:${code}`);
  return ctx.reply(CHOOSE_LANG, { reply_markup: kb });
}

bot.command("start", async (ctx) => {
  const lang = DB.getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  const c = getStartMsg(lang);
  if (c) return ctx.reply(c.text, { entities: c.entities });
  return ctx.reply(getT(lang).welcome);
});
bot.command("help", (ctx) => {
  const lang = DB.getLang(ctx.from.id);
  return lang ? ctx.reply(getT(lang).help) : askLang(ctx);
});
bot.command("lang", (ctx) => askLang(ctx));

bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
  const lang = ctx.match[1];
  DB.setLang(ctx.from.id, lang);
  await ctx.answerCallbackQuery().catch(() => {});
  const c = getStartMsg(lang);
  if (c) await ctx.editMessageText(c.text, { entities: c.entities }).catch(() => {});
  else await ctx.editMessageText(getT(lang).welcome).catch(() => {});
});

// ---------- majburiy obuna (admin panelda yoqiladi) ----------
async function isSubscribed(ctx) {
  const channel = DB.getSetting("force_channel");
  if (DB.getSetting("force_on") !== "1" || !channel || DB.isAdmin(ctx.from.id)) return true;
  try {
    const m = await ctx.api.getChatMember(channel, ctx.from.id);
    return ["member", "administrator", "creator"].includes(m.status) || (m.status === "restricted" && m.is_member);
  } catch (e) {
    console.error("obuna tekshiruvi xatosi:", e.message);
    return true; // bot kanalda admin bo'lmasa foydalanuvchilarni qulflab qo'ymaymiz
  }
}
async function requireSub(ctx, t) {
  if (await isSubscribed(ctx)) return true;
  const ch = DB.getSetting("force_channel");
  const kb = new InlineKeyboard().url(t.subBtn, `https://t.me/${ch.replace(/^@/, "")}`).row().text(t.checkBtn, "chk");
  await ctx.api.sendMessage(ctx.chat.id, t.subscribe, { reply_markup: kb }).catch(() => {});
  return false;
}
bot.callbackQuery("chk", async (ctx) => {
  const t = getT(DB.getLang(ctx.from.id));
  if (await isSubscribed(ctx)) {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText(t.subOk).catch(() => {});
  } else {
    await ctx.answerCallbackQuery({ text: t.notSub, show_alert: true }).catch(() => {});
  }
});

// ---------- inline rejim: "Ulashish" ----------
function inlineResult(s, botUsername) {
  const reply_markup = { inline_keyboard: [[{ text: `📥 @${botUsername}`, url: `https://t.me/${botUsername}` }]] };
  const base = { id: s.id, caption: s.caption, reply_markup };
  if (s.kind === "audio") return { type: "audio", audio_file_id: s.file_id, ...base };
  if (s.kind === "document") return { type: "document", document_file_id: s.file_id, title: s.title || "File", ...base };
  return { type: "video", video_file_id: s.file_id, title: s.title || "Video", description: `@${botUsername}`, ...base };
}

bot.on("inline_query", async (ctx) => {
  const bu = ctx.me.username;
  const q = ctx.inlineQuery.query.trim();
  let rows = [];
  const m = q.match(/^v([a-f0-9]{8})$/i);
  if (m) {
    const s = DB.getShare(m[1].toLowerCase());
    if (s) rows = [s];
  } else if (!q) {
    rows = DB.recentShares(ctx.from.id, 10);
  }
  const results = rows.map((s) => inlineResult(s, bu));
  if (!results.length) {
    results.push({
      type: "article",
      id: "promo",
      title: `📥 @${bu}`,
      description: "YouTube / Instagram video & MP3",
      input_message_content: { message_text: `📥 YouTube / Instagram → video & MP3\n👉 https://t.me/${bu}` },
      reply_markup: { inline_keyboard: [[{ text: `📥 @${bu}`, url: `https://t.me/${bu}` }]] },
    });
  }
  await ctx.answerInlineQuery(results, { cache_time: 0, is_personal: true }).catch((e) => console.error("inline:", e.message));
});

// BotFather'da /setinlinefeedback yoqilsa, ulashishlar soni hisoblanadi
bot.on("chosen_inline_result", (ctx) => {
  const id = ctx.chosenInlineResult.result_id;
  if (id && id !== "promo") DB.bumpShare(id);
});

// ---------- havola qabul qilish ----------
bot.on("message:text", (ctx) => {
  if (ctx.chat.type !== "private") return;
  const lang = DB.getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  spawnTask(() => processLink(ctx, lang));
});

async function processLink(ctx, lang) {
  const t = getT(lang);
  const link = parseLink(ctx.message.text);
  if (!link) return void (await ctx.reply(t.invalid));
  if (!(await requireSub(ctx, t))) return;

  const chatId = ctx.chat.id;
  const status = await ctx.reply(t.fetching);
  const dropStatus = () => ctx.api.deleteMessage(chatId, status.message_id).catch(() => {});

  try {
    const info = await getInfo(link.url);
    if (info.duration && info.duration > maxDurationMin() * 60) {
      return void (await ctx.api.editMessageText(chatId, status.message_id, t.tooLong(maxDurationMin())).catch(() => {}));
    }

    const id = crypto.randomBytes(4).toString("hex");
    const job = {
      url: link.url, key: link.key, platform: link.platform,
      title: info.title, uploader: info.uploader, duration: info.duration,
      chatId, msgId: null, hasPhoto: false, ts: Date.now(),
    };
    jobs.set(id, job);

    const kb = new InlineKeyboard();
    for (const o of info.options) kb.text(o.label || t.video, `dl:${id}:${o.q}`);
    kb.row().text(t.audio, `dl:${id}:mp3`);
    const text = t.choose(clip(info.title, 200), fmtDur(info.duration), info.uploader);

    // Muqova (cover) bilan birga ko'rsatamiz; olinmasa oddiy matn
    const img = await fetchImage(info.thumbs);
    let sent = null;
    if (img) {
      sent = await ctx.api
        .sendPhoto(chatId, new InputFile(img.buf, `cover.${img.ext}`), { caption: clip(text, 1024), reply_markup: kb })
        .catch((e) => { console.error("sendPhoto:", e.message); return null; });
      if (sent) job.hasPhoto = true;
    }
    if (!sent) sent = await ctx.api.sendMessage(chatId, text, { reply_markup: kb });
    job.msgId = sent.message_id;
    await dropStatus();
  } catch (e) {
    console.error("getInfo xato:", e.message);
    DB.logDownload({ userId: ctx.from.id, platform: link.platform, kind: "info", url: link.url, ok: false, error: e.message });
    await ctx.api.editMessageText(chatId, status.message_id, t.failed).catch(() => {});
  }
}

// ---------- yuklab yuborish ----------
const kindOf = (m) =>
  m.video ? "video" : m.audio ? "audio" : "document";
const fileIdOf = (m) =>
  m.video?.file_id ?? m.audio?.file_id ?? m.document?.file_id ?? m.animation?.file_id ?? null;

function sendMedia(api, chatId, kind, file, opts) {
  if (kind === "audio") return api.sendAudio(chatId, file, opts);
  if (kind === "document") return api.sendDocument(chatId, file, opts);
  return api.sendVideo(chatId, file, opts);
}

function editCard(api, job, text) {
  if (job.hasPhoto)
    return api.editMessageCaption(job.chatId, job.msgId, { caption: clip(text, 1024) }).catch(() => {});
  return api.editMessageText(job.chatId, job.msgId, text).catch(() => {});
}

bot.callbackQuery(/^dl:([a-f0-9]+):(\w+)$/, (ctx) => {
  const [, id, q] = ctx.match;
  spawnTask(() => processDownload(ctx, id, q));
});

async function processDownload(ctx, id, q) {
  const uid = ctx.from.id;
  const t = getT(DB.getLang(uid));
  const alert = (text) => ctx.answerCallbackQuery({ text, show_alert: true }).catch(() => {});
  const job = jobs.get(id);

  if (!job) return void (await alert(t.expired));
  if (rt.active.has(uid)) return void (await alert(t.busy));
  const lim = dailyLimit();
  if (lim > 0 && !DB.isAdmin(uid) && DB.downloadsToday(uid) >= lim) return void (await alert(t.limit(lim)));
  if (!(await isSubscribed(ctx))) {
    await ctx.answerCallbackQuery().catch(() => {});
    return void (await requireSub(ctx, t));
  }

  await ctx.answerCallbackQuery().catch(() => {});
  rt.active.add(uid);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-"));
  const status = (s) => editCard(ctx.api, job, `${clip(job.title, 150)}\n\n${s}`);
  const kindLabel = q === "mp3" ? "mp3" : "video";
  const log = (extra) =>
    DB.logDownload({ userId: uid, platform: job.platform, kind: kindLabel, quality: q, title: job.title, url: job.url, ...extra });

  try {
    await status(t.downloading);
    const bu = ctx.me.username;
    const isAudio = q === "mp3";
    const caption = buildCaption(job.title, bu, { withTitle: !isAudio });
    const shareId = crypto.randomBytes(4).toString("hex");
    const kb = new InlineKeyboard().switchInline(t.share, `v${shareId}`);
    const duration = job.duration ? Math.round(job.duration) : undefined;
    const optsFor = (kind) =>
      kind === "audio"
        ? { title: job.title.slice(0, 100), performer: job.uploader || undefined, duration, caption, reply_markup: kb }
        : kind === "document"
          ? { caption, reply_markup: kb }
          : { caption, supports_streaming: true, duration, reply_markup: kb };

    let sent = null, size = 0, cached = false;

    // Avval yuklangan bo'lsa, qayta yuklamaymiz: file_id orqali darhol yuboramiz
    const hit = job.key ? DB.getCache(job.key, q) : null;
    if (hit) {
      try {
        sent = await sendMedia(ctx.api, job.chatId, hit.kind, hit.file_id, optsFor(hit.kind));
        cached = true;
      } catch (e) {
        console.error("kesh yaroqsiz:", e.message);
        DB.delCache(job.key, q);
      }
    }

    if (!sent) {
      await acquire();
      let res;
      try { res = await download(job.url, q, dir); } finally { release(); }
      size = res.size;
      await status(t.uploading);
      const kind = isAudio ? "audio" : "video";
      sent = await sendMedia(ctx.api, job.chatId, kind, new InputFile(res.file), optsFor(kind));
    }

    const fileId = fileIdOf(sent);
    const kind = kindOf(sent);
    if (fileId) {
      DB.addShare({ id: shareId, userId: uid, kind, fileId, title: job.title, caption });
      if (job.key) DB.setCache(job.key, q, kind, fileId);
    }
    log({ ok: true, size, cached });
    await ctx.api.deleteMessage(job.chatId, job.msgId).catch(() => {});
  } catch (e) {
    console.error("download xato:", e.message);
    log({ ok: false, error: e instanceof TooBigError ? "Telegram 50MB chegarasi" : e.message });
    await status(e instanceof TooBigError ? t.tooBig : t.failed);
  } finally {
    rt.active.delete(uid);
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

// ---------- ishga tushirish ----------
bot.catch((err) => console.error("Bot xatosi:", err.error?.message || err));

const stop = () => bot.stop();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.init();
const base = [
  { command: "start", description: "Start / Старт" },
  { command: "lang", description: "Til / Язык / Language" },
  { command: "help", description: "Yordam / Помощь / Help" },
];
await bot.api.setMyCommands(base).catch(() => {});
for (const id of DB.allAdminIds()) {
  await bot.api
    .setMyCommands([...base, { command: "admin", description: "🛠 Admin panel" }], { scope: { type: "chat", chat_id: id } })
    .catch(() => {});
}

bot.start({
  drop_pending_updates: true,
  allowed_updates: ["message", "callback_query", "inline_query", "chosen_inline_result", "my_chat_member"],
  onStart: (me) => console.log(`@${me.username} ishga tushdi`),
});
