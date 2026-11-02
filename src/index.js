import { Bot, InlineKeyboard, InputFile } from "grammy";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { LANGS, CHOOSE_LANG, getT } from "./i18n.js";
import * as S from "./store.js";
import { getInfo, download, TooBigError, setupCookies, LOCAL_API, TG_LIMIT, LIMIT_LABEL } from "./ytdlp.js";
import { esc } from "./format.js";
import { probe, faststart, makeThumb } from "./media.js";
import { registerAdmin } from "./admin.js";
import {
  buildCaption, plainCaption, shareKb, startMessage, sendStored,
} from "./messages.js";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN topilmadi. Environment variable sifatida kiriting.");
  process.exit(1);
}

const MAX_PARALLEL = Number(process.env.MAX_PARALLEL || 2);
const MAX_DURATION_MIN = Number(process.env.MAX_DURATION_MIN || 300);

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e?.message || e));

setupCookies();
// BOT_API_URL berilsa — o'zingizning local Bot API serveringiz (2 GB gacha fayl yuborish uchun)
const API_ROOT = (process.env.BOT_API_URL || "").replace(/\/$/, "");
const bot = new Bot(token, API_ROOT ? { client: { apiRoot: API_ROOT, timeoutSeconds: 3600 } } : undefined);

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

const platformOf = (url) => (/instagram\.com/i.test(url) ? "instagram" : "youtube");

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

// Callback tugmalari uchun ma'lumotlarni vaqtincha saqlash (64 bayt chegarasi bor)
const jobs = new Map();
setInterval(() => {
  const limit = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of jobs) if (j.ts < limit) jobs.delete(id);
}, 10 * 60 * 1000).unref();

const active = new Set(); // foydalanuvchi boshiga bitta faol yuklash

// Inline rejim (Ulashish tugmasi uchun) yoqilganmi
let inlineOn = false;
async function refreshInline() {
  try {
    const me = await bot.api.getMe();
    inlineOn = !!me.supports_inline_queries;
  } catch (e) {
    console.error("getMe xato:", e.message);
  }
  return inlineOn;
}

const maxMinutes = () => S.settings.maxDurationMin ?? MAX_DURATION_MIN;

function askLang(ctx) {
  const kb = new InlineKeyboard();
  for (const [code, name] of Object.entries(LANGS)) kb.text(name, `lang:${code}`);
  return ctx.reply(CHOOSE_LANG, { reply_markup: kb });
}

// ---------- majburiy obuna ----------
const subOkAt = new Map();
async function missingChannels(api, uid) {
  const { channels, subOn } = S.settings;
  if (!subOn || !channels.length || S.isAdmin(uid)) return [];
  if (Date.now() - (subOkAt.get(uid) || 0) < 60 * 1000) return [];
  const missing = [];
  for (const ch of channels) {
    try {
      const m = await api.getChatMember(ch.id, uid);
      const ok =
        ["creator", "administrator", "member"].includes(m.status) ||
        (m.status === "restricted" && m.is_member);
      if (!ok) missing.push(ch);
    } catch (e) {
      // Bot kanalda admin bo'lmasa tekshirib bo'lmaydi: foydalanuvchini to'smaymiz
      console.error("obuna tekshirish xato:", ch.id, e.message);
    }
  }
  if (!missing.length) subOkAt.set(uid, Date.now());
  return missing;
}

function subKb(missing, t) {
  const kb = new InlineKeyboard();
  for (const ch of missing) kb.url(`📣 ${ch.title}`.slice(0, 60), ch.url).row();
  return kb.text(t.subCheck, "sub:chk");
}

// ---------- kuzatuv / bloklash / texnik ishlar ----------
bot.use(async (ctx, next) => {
  if (ctx.chat?.type === "private" && ctx.from && (ctx.message || ctx.callbackQuery)) {
    ctx.isNewUser = S.touchUser(ctx.from).isNew;
    if (!S.isAdmin(ctx.from.id)) {
      if (S.isBanned(ctx.from.id)) {
        if (ctx.callbackQuery) await ctx.answerCallbackQuery().catch(() => {});
        return;
      }
      if (S.settings.maintenance) {
        const t = getT(S.getLang(ctx.from.id));
        if (ctx.callbackQuery) return ctx.answerCallbackQuery({ text: t.maintenance, show_alert: true });
        return ctx.reply(t.maintenance);
      }
    }
  }
  return next();
});

// ---------- admin panel ----------
registerAdmin(bot, {
  getRunning: () => running,
  isInlineOn: () => inlineOn,
  refreshInline,
  defaultMaxMin: MAX_DURATION_MIN,
});

// ---------- foydalanuvchi buyruqlari ----------
async function sendStart(ctx, lang) {
  try {
    await sendStored(ctx.api, ctx.chat.id, startMessage(lang), ctx.me.username);
  } catch (e) {
    console.error("start xabari xato:", e.message);
    await ctx.reply(getT(lang).welcome);
  }
}

// Obuna bo'lmagan bo'lsa, kanallar ro'yxati bilan xabar yuboradi (true = to'sildi)
async function promptSub(ctx, lang) {
  if (!S.settings.subOnStart) return false;
  const t = getT(lang);
  const missing = await missingChannels(ctx.api, ctx.from.id);
  if (!missing.length) return false;
  await ctx.reply(t.subNeed, { reply_markup: subKb(missing, t) });
  return true;
}

bot.command("start", async (ctx) => {
  const payload = String(ctx.match || "");
  const ref = payload.match(/^r(\d+)$/);
  if (ref && ctx.isNewUser) S.setReferrer(ctx.from.id, Number(ref[1]));
  const lang = S.getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  await sendStart(ctx, lang);
  await promptSub(ctx, lang);
});

bot.command("lang", (ctx) => askLang(ctx));

bot.command("help", async (ctx) => {
  await ctx.reply(getT(S.getLang(ctx.from.id)).help);
});

bot.command("id", (ctx) => ctx.reply(`🆔 ${ctx.from.id}`));

bot.command("me", async (ctx) => {
  const u = S.getUser(ctx.from.id);
  const t = getT(S.getLang(ctx.from.id));
  await ctx.reply(t.me(u?.dl || 0, S.dailyUsed(ctx.from.id), u?.refs || 0));
});

bot.command("share", async (ctx) => {
  const t = getT(S.getLang(ctx.from.id));
  const link = `https://t.me/${ctx.me.username}?start=r${ctx.from.id}`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t.shareText)}`;
  await ctx.reply(t.shareBotMsg, { reply_markup: new InlineKeyboard().url(t.shareBotBtn, url) });
});

bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
  const lang = ctx.match[1];
  const first = !S.getLang(ctx.from.id);
  S.setLang(ctx.from.id, lang);
  await ctx.answerCallbackQuery();
  if (first) {
    await ctx.deleteMessage().catch(() => {});
    await sendStart(ctx, lang);
    await promptSub(ctx, lang);
  } else {
    await ctx.editMessageText(getT(lang).welcome).catch(() => {});
  }
});

bot.callbackQuery("sub:chk", async (ctx) => {
  const t = getT(S.getLang(ctx.from.id));
  subOkAt.delete(ctx.from.id);
  const missing = await missingChannels(ctx.api, ctx.from.id);
  if (missing.length) return ctx.answerCallbackQuery({ text: t.subNo, show_alert: true });
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t.subOk).catch(() => {});
});

// ---------- bot bloklangani/qayta yoqilgani ----------
bot.on("my_chat_member", (ctx) => {
  if (ctx.chat.type !== "private") return;
  const st = ctx.myChatMember.new_chat_member.status;
  S.markBlocked(ctx.from.id, st === "kicked" || st === "left");
});

// ---------- INLINE: «Ulashish» tugmasi ----------
bot.on("inline_query", async (ctx) => {
  try {
    const uid = ctx.from.id;
    const lang = S.getLang(uid) || "uz";
    const t = getT(lang);
    const q = ctx.inlineQuery.query.trim();
    const botName = ctx.me.username;

    let items = [];
    if (/^x[a-f0-9]{8}$/.test(q)) {
      const s = S.getShare(q);
      if (s) items = [[q, s]];
    } else if (!q) {
      items = S.recentShares(uid, 10);
    }

    const results = items.map(([id, s]) => {
      const base = {
        id,
        caption: buildCaption(s.n, lang, botName) || undefined,
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().url(t.openBot, `https://t.me/${botName}?start=r${uid}`),
      };
      if (s.t === "audio") return { type: "audio", audio_file_id: s.f, ...base };
      if (s.t === "document") return { type: "document", document_file_id: s.f, title: s.n || "File", ...base };
      return { type: "video", video_file_id: s.f, title: s.n || "Video", ...base };
    });

    await ctx.answerInlineQuery(results, {
      cache_time: 5,
      is_personal: true,
      ...(results.length ? {} : { button: { text: t.inlineBtn, start_parameter: "inline" } }),
    });
  } catch (e) {
    console.error("inline xato:", e.message);
  }
});

// ---------- havola qabul qilish ----------
bot.on("message:text", (ctx) => {
  // uzoq davom etadigan ish alohida ishlaydi, boshqa foydalanuvchilarni kutdirmaydi
  handleLink(ctx).catch((e) => console.error("handleLink:", e.message));
});

// Xato sababini adminga yuboradi (bir xil xato 10 daqiqada bir marta)
const errSeen = new Map();
function reportError(where, e, url = "") {
  const raw = String(e?.stderr || e?.message || e || "").trim();
  const tail = raw.split("\n").filter(Boolean).slice(-4).join("\n").slice(-700);
  console.error(`[${where}]`, tail);
  const sig = tail.slice(-80);
  if (Date.now() - (errSeen.get(sig) || 0) < 10 * 60 * 1000) return;
  errSeen.set(sig, Date.now());
  let hint = "";
  if (/sign in to confirm|not a bot|confirm you.re not/i.test(raw))
    hint = "💡 YouTube bot-tekshiruvi: server IP'si bloklangan. COOKIES_B64 (cookies.txt) yoki PROXY kerak.";
  else if (/login required|rate-limit reached|empty media response|requiring login|restricted video/i.test(raw))
    hint = "💡 Instagram kirishni talab qilyapti: COOKIES_B64 kerak.";
  else if (/HTTP Error 429|Too Many Requests/i.test(raw))
    hint = "💡 Juda ko'p so'rov (429): proxy yoki biroz kutish kerak.";
  else if (/Requested format is not available/i.test(raw))
    hint = "💡 Format topilmadi: yt-dlp eskirgan bo'lishi mumkin (qayta deploy qiling).";
  else if (/timeout|timed out/i.test(raw)) hint = "💡 Vaqt tugadi: tarmoq sekin yoki fayl juda katta.";
  else if (/ffmpeg|ffprobe/i.test(raw)) hint = "💡 ffmpeg bilan muammo.";
  for (const id of S.OWNERS) {
    bot.api
      .sendMessage(
        id,
        `⚠️ <b>Xato</b> (${esc(where)})\n<pre>${esc(tail)}</pre>${hint ? `\n${hint}` : ""}${url ? `\n${esc(url.slice(0, 200))}` : ""}`,
        { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
      )
      .catch(() => {});
  }
}

const fmtSize = (b) => {
  if (!b) return "—";
  const mb = b / 1048576;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
};

async function fetchThumb(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 500 && buf.length < 8 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

async function handleLink(ctx) {
  const lang = S.getLang(ctx.from.id);
  if (!lang) return askLang(ctx);
  const t = getT(lang);

  const url = extractUrl(ctx.message.text);
  if (!url) return ctx.reply(t.invalid);

  const missing = await missingChannels(ctx.api, ctx.from.id);
  if (missing.length) return ctx.reply(t.subNeed, { reply_markup: subKb(missing, t) });

  const status = await ctx.reply(t.fetching);
  const edit = (text, extra) =>
    ctx.api.editMessageText(ctx.chat.id, status.message_id, text, extra).catch(() => {});

  try {
    const info = await getInfo(url);
    if (info.duration && info.duration > maxMinutes() * 60) {
      return edit(t.tooLong(maxMinutes()));
    }

    // Tanlov ro'yxati: Telegram yubora oladigan sifatlar (144p ... 1080p) + MP3, hajmi bilan.
    // Chegaradan katta sifatlar ro'yxatda ham, tugmalarda ham chiqmaydi.
    const fits = (est) => !est || est <= TG_LIMIT;
    const rows = info.options
      .filter((o) => fits(o.est))
      .map((o) => ({ q: o.q, label: o.q === "best" ? t.video : `${o.q}p`, est: o.est, exact: o.exact }));
    if (fits(info.mp3Est)) rows.push({ q: "mp3", label: "MP3", est: info.mp3Est, exact: true });
    if (!rows.length) return edit(t.tooBigAll(LIMIT_LABEL));

    const showRows = rows.filter((r) => r.q !== "best");
    let table = "";
    if (showRows.length) {
      const w = Math.max(...showRows.map((r) => r.label.length));
      // aniq o'lchanmagan hajm "~" bilan belgilanadi
      const sizes = showRows.map((r) => (r.est ? (r.exact ? "" : "~") : "") + fmtSize(r.est));
      const sw = Math.max(...sizes.map((x) => x.length));
      table =
        "<pre>" +
        showRows.map((r, i) => `✅ ${(r.label + ":").padEnd(w + 1)} ${sizes[i].padStart(sw)}`).join("\n") +
        "</pre>";
    }

    const id = crypto.randomBytes(4).toString("hex");
    jobs.set(id, {
      url,
      platform: platformOf(url),
      key: info.key,
      title: info.title,
      uploader: info.uploader,
      duration: info.duration,
      thumb: info.thumb,
      opts: Object.fromEntries(
        info.options.map((o) => [o.q, { fid: o.fid, hasAudio: o.hasAudio, est: o.est }]).concat([["mp3", { mp3: true, est: info.mp3Est }]])
      ),
      ts: Date.now(),
    });

    // Tugmalar: 3 tadan qator, pastida MP3
    const kb = new InlineKeyboard();
    const vids = rows.filter((r) => r.q !== "mp3");
    vids.forEach((r, i) => {
      kb.text(r.q === "best" ? r.label : `🎬 ${r.label}`, `dl:${id}:${r.q}`);
      if ((i + 1) % 3 === 0 && i + 1 < vids.length) kb.row();
    });
    if (rows.some((r) => r.q === "mp3")) kb.row().text(t.audio, `dl:${id}:mp3`);

    const text = t.choose(
      esc(info.title.slice(0, 150)),
      fmtDur(info.duration),
      esc((info.uploader || "").slice(0, 80)),
      table
    );
    const extra = { caption: text.slice(0, 1024), parse_mode: "HTML", reply_markup: kb };

    // Videoning muqovasi bilan birga chiqaramiz
    if (info.thumb) {
      const buf = await fetchThumb(info.thumb);
      const attempts = [];
      if (buf) attempts.push(new InputFile(buf, "cover.jpg"));
      attempts.push(info.thumb);
      for (const photo of attempts) {
        try {
          await ctx.api.sendPhoto(ctx.chat.id, photo, extra);
          await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {});
          return;
        } catch (e) {
          console.error("muqova yuborilmadi:", e.message);
        }
      }
    }
    await edit(text, { reply_markup: kb, parse_mode: "HTML" }); // muqova bo'lmasa — oddiy matn
  } catch (e) {
    S.bump("err");
    reportError("getInfo", e, url);
    await edit(t.failed);
  }
}

// ---------- yuklab yuborish ----------
bot.callbackQuery(/^dl:([a-f0-9]+):(\w+)$/, async (ctx) => {
  const [, id, q] = ctx.match;
  const uid = ctx.from.id;
  const lang = S.getLang(uid);
  const t = getT(lang);
  const job = jobs.get(id);

  if (!job) return ctx.answerCallbackQuery({ text: t.expired, show_alert: true });
  const opt = job.opts?.[q];
  if (!opt) return ctx.answerCallbackQuery({ text: t.expired, show_alert: true });
  if (opt.est && opt.est > TG_LIMIT)
    return ctx.answerCallbackQuery({ text: t.tooBig(LIMIT_LABEL), show_alert: true });
  if (active.has(uid)) return ctx.answerCallbackQuery({ text: t.busy, show_alert: true });

  const limit = S.settings.dailyLimit;
  if (limit > 0 && !S.isAdmin(uid) && S.dailyUsed(uid) >= limit) {
    return ctx.answerCallbackQuery({ text: t.limit(limit), show_alert: true });
  }
  const missing = await missingChannels(ctx.api, uid);
  if (missing.length) {
    await ctx.answerCallbackQuery({ text: t.subNo, show_alert: true });
    return ctx.reply(t.subNeed, { reply_markup: subKb(missing, t) });
  }

  await ctx.answerCallbackQuery();
  active.add(uid);
  runDownload(ctx, job, q, lang, t)
    .catch((e) => console.error("runDownload:", e.message))
    .finally(() => active.delete(uid));
});

/** Videoni (yoki MP3 ni) caption + «Ulashish» tugmasi bilan yuboradi */
async function sendMedia(api, chatId, kind, file, job, lang, t, uid, me, extra = {}) {
  const sid = S.newShareId();
  const reply_markup = shareKb(t, sid, inlineOn, me.username);
  const send = (cap) =>
    kind === "mp3"
      ? api.sendAudio(chatId, file, {
          title: job.title.slice(0, 100),
          performer: job.uploader || undefined,
          duration: job.duration ? Math.round(job.duration) : undefined,
          reply_markup,
          ...extra,
          ...cap,
        })
      : api.sendVideo(chatId, file, {
          supports_streaming: true,
          duration: job.duration ? Math.round(job.duration) : undefined,
          reply_markup,
          ...extra,
          ...cap,
        });

  let msg;
  try {
    msg = await send({ caption: buildCaption(job.title, lang, me.username), parse_mode: "HTML" });
  } catch (e) {
    if (!/parse entities/i.test(e.message)) throw e;
    msg = await send({ caption: plainCaption(job.title, me.username) });
  }

  let fid, type;
  if (msg.audio) { fid = msg.audio.file_id; type = "audio"; }
  else if (msg.video) { fid = msg.video.file_id; type = "video"; }
  else if (msg.document) { fid = msg.document.file_id; type = "document"; }
  if (fid) S.putShare(sid, { f: fid, t: type, n: job.title, o: uid });
  return { fid, type };
}

async function runDownload(ctx, job, q, lang, t) {
  const uid = ctx.from.id;
  const chatId = ctx.chat.id;
  const msgId = ctx.callbackQuery.message.message_id;
  const isPhoto = !!ctx.callbackQuery.message.photo;
  const kind = q === "mp3" ? "mp3" : "video";
  const cacheKey = job.key ? `${job.key}|${q}` : null;
  const action = kind === "mp3" ? "upload_voice" : "upload_video";

  // rasmli xabarda caption, oddiy xabarda matn tahrirlanadi (tugmalar ham yo'qoladi)
  const edit = (text) =>
    (isPhoto
      ? ctx.api.editMessageCaption(chatId, msgId, { caption: text })
      : ctx.api.editMessageText(chatId, msgId, text)
    ).catch(() => {});

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vd-"));
  try {
    // 1) Avval yuklangan bo'lsa — Telegramning o'zidan darhol yuboramiz
    const hit = cacheKey && S.getCache(cacheKey);
    if (hit) {
      try {
        await ctx.api.sendChatAction(chatId, action).catch(() => {});
        await sendMedia(ctx.api, chatId, kind, hit.f, job, lang, t, uid, ctx.me);
        S.recordDownload(uid, { platform: job.platform, kind, cached: true });
        await ctx.api.deleteMessage(chatId, msgId).catch(() => {});
        return;
      } catch (e) {
        console.error("keshdan yuborib bo'lmadi:", e.message);
      }
    }

    // 2) Yuklab olish
    await edit(t.downloading);
    await acquire();
    let res;
    try {
      res = await download(job.url, job.opts[q], dir);
    } finally {
      release();
    }

    await edit(t.uploading);
    await ctx.api.sendChatAction(chatId, action).catch(() => {});

    // Videoning o'lchami + YouTube/Instagram muqovasi (Telegramda qora kvadrat chiqmasligi uchun)
    const extra = {};
    try {
      if (kind === "video") {
        await faststart(res.file);
        const m = await probe(res.file);
        if (m.width && m.height) { extra.width = m.width; extra.height = m.height; }
        if (m.duration) extra.duration = m.duration;
        const buf = job.thumb ? await fetchThumb(job.thumb) : null;
        const ratio = m.width && m.height ? m.width / m.height : null;
        const th = await makeThumb(dir, { buf, file: res.file, duration: m.duration || job.duration, ratio });
        if (th) extra.thumbnail = new InputFile(th);
      } else if (job.thumb) {
        const buf = await fetchThumb(job.thumb);
        const th = buf && (await makeThumb(dir, { buf, ratio: 1 }));
        if (th) extra.thumbnail = new InputFile(th);
      }
    } catch (e) {
      console.error("media tayyorlash:", e.message);
    }
    const sent = await sendMedia(ctx.api, chatId, kind, new InputFile(res.file), job, lang, t, uid, ctx.me, extra);
    if (cacheKey && sent.fid) S.setCache(cacheKey, { f: sent.fid, t: sent.type });
    S.recordDownload(uid, { platform: job.platform, kind, cached: false });
    await ctx.api.deleteMessage(chatId, msgId).catch(() => {});
  } catch (e) {
    S.bump("err");
    if (e instanceof TooBigError) console.error("download: fayl chegaradan katta");
    else reportError("download", e, job.url);
    await edit(e instanceof TooBigError ? t.tooBig(LIMIT_LABEL) : t.failed);
  } finally {
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }
}

// ---------- ishga tushirish ----------
bot.catch((err) => console.error("Bot xatosi:", err.error?.message || err));

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  S.flush(); // bazani diskka yozib qo'yamiz
  try { await bot.stop(); } catch {}
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const common = [
  { command: "start", description: "Start / Старт" },
  { command: "help", description: "Yordam / Помощь / Help" },
  { command: "lang", description: "Til / Язык / Language" },
  { command: "me", description: "Statistikam / Моя статистика / My stats" },
  { command: "share", description: "Botni ulashish / Поделиться / Share" },
];
await bot.api.setMyCommands(common);
for (const id of S.OWNERS) {
  await bot.api
    .setMyCommands(
      [...common, { command: "admin", description: "🛠 Admin panel" }],
      { scope: { type: "chat", chat_id: id } }
    )
    .catch(() => {});
}

await refreshInline();
setInterval(refreshInline, 5 * 60 * 1000).unref();
if (!S.OWNERS.length)
  console.warn("ADMIN_ID berilmagan: admin panel ishlamaydi. Botga /id yuborib ID ingizni bilib oling.");
console.log(LOCAL_API ? `Local Bot API: ${API_ROOT} (fayl chegarasi ${LIMIT_LABEL})` : "Cloud Bot API (fayl chegarasi 50 MB)");
if (!inlineOn)
  console.warn("Inline rejim o'chiq: «Ulashish» faqat bot havolasini ulashadi. @BotFather → /setinline qiling.");

bot.start({
  drop_pending_updates: true,
  allowed_updates: ["message", "callback_query", "inline_query", "my_chat_member"],
  onStart: (me) => console.log(`@${me.username} ishga tushdi`),
});
