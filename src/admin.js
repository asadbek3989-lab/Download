import { InlineKeyboard, InputFile, GrammyError } from "grammy";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as DB from "./db.js";
import { rt, spawnTask } from "./state.js";
import { fmtBytes, parseButtons, toKb, sleep, clip } from "./utils.js";
import { buildCaption, adTemplate, titleInCaption, DEFAULT_AD, getStartMsg } from "./content.js";
import { hasCookies, saveCookies, updateYtdlp, ytdlpVersion } from "./ytdlp.js";

const S = new Map(); // admin holati: {mode, ...}
let bcRun = null; // hozir ketayotgan reklama
const LANG_NAMES = { uz: "🇺🇿 O'zbekcha", ru: "🇷🇺 Русский", en: "🇬🇧 English" };

const menuKb = () =>
  new InlineKeyboard()
    .text("📊 Statistika", "a:stats").text("📣 Reklama yuborish", "a:bc").row()
    .text("✏️ Start xabari", "a:start").text("🏷 Video caption", "a:cap").row()
    .text("👤 Foydalanuvchilar", "a:users").text("⚙️ Sozlamalar", "a:set").row()
    .text("🧰 Asboblar", "a:tools").text("👮 Adminlar", "a:adm").row()
    .text("📥 Export / zaxira", "a:exp").text("⚠️ Oxirgi xatolar", "a:errs");
const backKb = (to = "a:menu") => new InlineKeyboard().text("⬅️ Orqaga", to);
const cancelKb = () => new InlineKeyboard().text("❌ Bekor qilish", "a:cancel");

const bar = (n, max, w = 10) => "█".repeat(max ? Math.round((n / max) * w) : 0) || "·";

export function registerAdmin(bot) {
  const guard = (ctx) => ctx.from && DB.isAdmin(ctx.from.id);

  async function show(ctx, text, kb) {
    const opts = { reply_markup: kb };
    text = clip(text, 4000);
    try {
      if (ctx.callbackQuery) await ctx.editMessageText(text, opts);
      else await ctx.reply(text, opts);
    } catch (e) {
      if (!/not modified/i.test(e.message)) await ctx.reply(text, opts).catch(() => {});
    }
  }

  bot.command("admin", (ctx, next) => {
    if (!guard(ctx)) return next();
    S.delete(ctx.from.id);
    return ctx.reply("🛠 Admin panel", { reply_markup: menuKb() });
  });

  // ================= matnlar =================
  function statsText() {
    const s = DB.getStats();
    const u = s.users, d = s.dl, L = u.langs;
    const maxD = Math.max(1, ...s.days.map((x) => x.dl));
    const days = s.days
      .map((x) => `${x.date}  ${bar(x.dl, maxD).padEnd(10, " ")} ${String(x.dl).padStart(4)} yuk. · +${x.users}`)
      .join("\n");
    const top = DB.topUsers(5)
      .map((x, i) => `${i + 1}. ${x.first_name || x.id}${x.username ? " @" + x.username : ""} — ${x.downloads}`)
      .join("\n");
    return (
      `📊 STATISTIKA\n\n` +
      `👥 Foydalanuvchilar: ${u.total}\n` +
      `   ├ faol: ${u.active}\n   ├ botni bloklagan: ${u.blocked}\n   └ ban qilingan: ${u.banned}\n` +
      `🆕 Yangi: bugun ${u.new0} · 7 kun ${u.new7} · 30 kun ${u.new30}\n` +
      `🟢 Faol: 24 soat ${u.seen24} · 7 kun ${u.seen7}\n` +
      `🌐 Tillar: 🇺🇿 ${L.uz || 0} · 🇷🇺 ${L.ru || 0} · 🇬🇧 ${L.en || 0} · tanlamagan ${L["-"] || 0}\n\n` +
      `📥 Yuklashlar: jami ${d.total}\n` +
      `   ├ bugun ${d.today} · 7 kun ${d.d7} · 30 kun ${d.d30}\n` +
      `   ├ 🎬 video ${d.video} · 🎵 MP3 ${d.mp3}\n` +
      `   ├ ▶️ YouTube ${d.yt} · 📸 Instagram ${d.ig}\n` +
      `   ├ ⚡️ keshdan (tez): ${d.cached}\n` +
      `   ├ ❌ xato: ${d.failed} (bugun ${d.failedToday})\n` +
      `   └ 💾 hajm: ${fmtBytes(d.bytes)}\n` +
      `📤 Ulashish tugmasi: ${s.shares.total} ta video, ${s.shares.uses} marta tanlangan\n\n` +
      `📅 So'nggi 7 kun (yuklash · yangi a'zo)\n${days}\n\n` +
      (top ? `🏆 Top foydalanuvchilar\n${top}` : "")
    );
  }

  const userCard = (u) =>
    `👤 ${u.first_name || "—"}${u.username ? " @" + u.username : ""}\n🆔 ${u.id}\n` +
    `🌐 Til: ${u.lang || "tanlamagan"}\n📅 Qo'shilgan: ${DB.fmtDate(u.joined_at)}\n` +
    `🕒 Oxirgi faollik: ${DB.fmtDate(u.last_seen)}\n📥 Yuklashlar: ${u.downloads}\n` +
    `${u.banned ? "🚫 BAN qilingan" : "✅ Faol"}${u.blocked ? " · botni bloklagan" : ""}`;
  const userKb = (u) =>
    new InlineKeyboard()
      .text(u.banned ? "✅ Bandan chiqarish" : "🚫 Ban qilish", u.banned ? `a:ub:${u.id}` : `a:bn:${u.id}`)
      .text("✉️ Xabar yuborish", `a:dm:${u.id}`).row()
      .text("⬅️ Orqaga", "a:users");

  function settingsView() {
    const maint = DB.getSetting("maintenance") === "1";
    const fOn = DB.getSetting("force_on") === "1";
    const ch = DB.getSetting("force_channel");
    const dur = DB.getSetting("max_duration_min", process.env.MAX_DURATION_MIN || 90);
    const lim = Number(DB.getSetting("daily_limit", 0));
    const text =
      `⚙️ SOZLAMALAR\n\n` +
      `🛠 Texnik ishlar rejimi: ${maint ? "YOQILGAN 🔴" : "o'chiq 🟢"}\n` +
      `   (yoqilsa, oddiy foydalanuvchilar botdan foydalana olmaydi)\n\n` +
      `📢 Majburiy obuna: ${fOn ? "YOQILGAN" : "o'chiq"}\n   Kanal: ${ch || "—"}\n\n` +
      `⏱ Maksimal video davomiyligi: ${dur} daqiqa\n` +
      `📅 Kunlik limit (bitta foydalanuvchiga): ${lim > 0 ? lim + " ta" : "cheksiz"}`;
    const kb = new InlineKeyboard()
      .text(maint ? "🟢 Texnik ishlarni o'chirish" : "🔴 Texnik ishlarni yoqish", "a:sm").row()
      .text(fOn ? "📢 Obunani o'chirish" : "📢 Obunani yoqish", "a:sf")
      .text("🔗 Kanalni o'zgartirish", "a:sfc").row()
      .text("⏱ Davomiylik", "a:sd").text("📅 Kunlik limit", "a:sl").row()
      .text("⬅️ Orqaga", "a:menu");
    return [text, kb];
  }

  async function toolsView() {
    const up = Math.floor((Date.now() - rt.started) / 60000);
    let free = "—";
    try { const f = fs.statfsSync(DB.DATA_DIR); free = fmtBytes(f.bavail * f.bsize); } catch {}
    let dbSize = "—";
    try { dbSize = fmtBytes(fs.statSync(DB.DB_FILE).size); } catch {}
    const text =
      `🧰 ASBOBLAR / SERVER HOLATI\n\n` +
      `⏱ Ish vaqti: ${Math.floor(up / 60)} soat ${up % 60} daq.\n` +
      `🧠 RAM: ${fmtBytes(process.memoryUsage().rss)}\n` +
      `⚙️ Yuklashlar: ${rt.running} ishlayapti, ${rt.queued} navbatda\n` +
      `🗄 Baza: ${dbSize} · bo'sh joy: ${free}\n` +
      `📦 yt-dlp: ${await ytdlpVersion()}\n` +
      `🍪 Cookies: ${hasCookies() ? "yuklangan ✅" : "yo'q ❌"}\n\n` +
      `YouTube/Instagram "bot emasligingizni tasdiqlang" desa — cookies'ni yangilang. Yuklash umuman ishlamasa — yt-dlp'ni yangilang.`;
    const kb = new InlineKeyboard()
      .text("🍪 Cookies yuklash", "a:ck").text("🔄 yt-dlp yangilash", "a:ytu").row()
      .text("🔃 Yangilash", "a:tools").text("⬅️ Orqaga", "a:menu");
    return [text, kb];
  }

  function adminsView() {
    const sup = DB.superAdmins();
    const extra = DB.extraAdmins();
    const text =
      `👮 ADMINLAR\n\nAsosiy (ADMIN_ID, o'chirib bo'lmaydi):\n${sup.map((x) => "• " + x).join("\n") || "—"}\n\n` +
      `Qo'shimcha:\n${extra.map((x) => "• " + x).join("\n") || "—"}`;
    const kb = new InlineKeyboard();
    for (const id of extra) kb.text(`🗑 ${id}`, `a:adr:${id}`).row();
    kb.text("➕ Admin qo'shish", "a:ada").row().text("⬅️ Orqaga", "a:menu");
    return [text, kb];
  }

  async function captionView(me) {
    const text =
      `🏷 VIDEO CAPTION (reklama)\n\nHar bir yuklangan video/MP3 ostiga shu matn yoziladi. ` +
      `Ulashilganda ham shu caption bilan boradi.\n\n` +
      `Hozirgi matn:\n«${adTemplate()}»\n\n{bot} → @${me.username} ga almashadi.\n` +
      `Videoning nomini captionga qo'shish: ${titleInCaption() ? "HA" : "YO'Q"}\n\n` +
      `👁 Namuna:\n─────────\n${buildCaption("Namuna video nomi", me.username)}\n─────────`;
    const kb = new InlineKeyboard()
      .text("✏️ Matnni o'zgartirish", "a:caps").row()
      .text(titleInCaption() ? "🔁 Nomni o'chirish" : "🔁 Nomni yoqish", "a:capt")
      .text("↩️ Standart", "a:capr").row()
      .text("⬅️ Orqaga", "a:menu");
    return [text, kb];
  }

  const csv = (rows, cols) => {
    const esc = (v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
    return "\uFEFF" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  };

  // ================= callback tugmalar =================
  bot.callbackQuery(/^a:/, async (ctx) => {
    if (!guard(ctx)) return ctx.answerCallbackQuery().catch(() => {});
    await ctx.answerCallbackQuery().catch(() => {});
    const uid = ctx.from.id;
    const [, act, p1] = ctx.callbackQuery.data.split(":");

    switch (act) {
      case "menu":
      case "cancel":
        S.delete(uid);
        return show(ctx, "🛠 Admin panel", menuKb());

      case "stats":
        return show(ctx, statsText(), new InlineKeyboard().text("🔃 Yangilash", "a:stats").text("⬅️ Orqaga", "a:menu"));

      // ---------- reklama ----------
      case "bc":
        S.set(uid, { mode: "bc_msg" });
        return show(
          ctx,
          "📣 REKLAMA YUBORISH\n\nReklama xabarini yuboring. Qo'llab-quvvatlanadi: matn, rasm, video, ovozli xabar, audio, GIF, hujjat (izoh bilan).\n\nMen uni aynan shu ko'rinishda hammaga yuboraman.\nBekor qilish: /cancel",
          cancelKb()
        );
      case "bcnb": {
        const st = S.get(uid);
        if (!st || st.mode !== "bc_btn") return;
        st.rows = null;
        return askAudience(ctx, st);
      }
      case "bcaud": {
        const st = S.get(uid);
        if (!st || st.mode !== "bc_aud") return;
        st.aud = p1 === "all" ? null : p1;
        st.mode = "bc_confirm";
        const n = DB.audienceCount(st.aud);
        try {
          await ctx.api.copyMessage(uid, st.src.chat, st.src.id, st.rows ? { reply_markup: toKb(st.rows) } : {});
        } catch (e) {
          return show(ctx, `❌ Xabarni ko'rsatib bo'lmadi: ${e.message}`, backKb());
        }
        const kb = new InlineKeyboard().text(`✅ Yuborish (${n} ta)`, "a:bcgo").text("❌ Bekor", "a:cancel");
        return ctx.reply(
          `☝️ Reklama shunday ko'rinadi.\n\nQabul qiluvchilar: ${n} ta (${st.aud ? LANG_NAMES[st.aud] : "hamma"})\nTugmalar: ${st.rows ? "bor" : "yo'q"}\n\nYuboraymi?`,
          { reply_markup: kb }
        );
      }
      case "bcgo": {
        const st = S.get(uid);
        if (!st || st.mode !== "bc_confirm") return;
        if (bcRun) return show(ctx, "⏳ Boshqa reklama hozir yuborilmoqda. Tugashini kuting.", backKb());
        S.delete(uid);
        const msg = await ctx.api.sendMessage(uid, "📤 Reklama yuborish boshlandi...", {
          reply_markup: new InlineKeyboard().text("⛔️ To'xtatish", "a:bcstop"),
        });
        spawnTask(() => runBroadcast(ctx.api, uid, st, msg.message_id));
        return;
      }
      case "bcstop":
        if (bcRun) bcRun.cancel = true;
        return;

      // ---------- start xabari ----------
      case "start": {
        if (!p1) {
          const kb = new InlineKeyboard();
          for (const l of ["uz", "ru", "en"]) kb.text(`${LANG_NAMES[l]} ${getStartMsg(l) ? "✏️" : ""}`, `a:start:${l}`).row();
          kb.text("⬅️ Orqaga", "a:menu");
          return show(ctx, "✏️ START XABARI\n\nQaysi til uchun /start xabarini o'zgartirasiz? (✏️ — o'zgartirilgan)", kb);
        }
        const c = getStartMsg(p1);
        const kb = new InlineKeyboard()
          .text("✏️ Yangi xabar yuborish", `a:starts:${p1}`).row()
          .text("↩️ Standartga qaytarish", `a:startr:${p1}`).row()
          .text("⬅️ Orqaga", "a:start");
        await show(ctx, `✏️ START XABARI — ${LANG_NAMES[p1]}\n\n${c ? "Hozir o'zgartirilgan xabar ishlatilmoqda (pastda)." : "Hozir standart xabar ishlatilmoqda."}`, kb);
        if (c) await ctx.reply(c.text, { entities: c.entities }).catch(() => {});
        return;
      }
      case "starts":
        S.set(uid, { mode: "start_text", lang: p1 });
        return show(ctx, `✏️ ${LANG_NAMES[p1]} uchun yangi /start xabarini yuboring.\n\nKalin, kursiv, havola kabi formatlash saqlanadi (Telegram'da matnni formatlab yuboring).\nBekor: /cancel`, cancelKb());
      case "startr":
        DB.delSetting(`start_${p1}`);
        return show(ctx, "↩️ Standart xabarga qaytarildi.", backKb("a:start"));

      // ---------- caption ----------
      case "cap": {
        const [text, kb] = await captionView(ctx.me);
        return show(ctx, text, kb);
      }
      case "caps":
        S.set(uid, { mode: "cap_text" });
        return show(ctx, `🏷 Yangi reklama matnini yuboring (har bir video ostiga yoziladi).\n\n{bot} — bot username'iga almashadi. Masalan:\n📥 Yuklab olish: @{bot}\n\nBekor: /cancel`, cancelKb());
      case "capt": {
        DB.setSetting("caption_title", titleInCaption() ? "0" : "1");
        const [text, kb] = await captionView(ctx.me);
        return show(ctx, text, kb);
      }
      case "capr": {
        DB.setSetting("caption_tpl", DEFAULT_AD);
        const [text, kb] = await captionView(ctx.me);
        return show(ctx, text, kb);
      }

      // ---------- foydalanuvchilar ----------
      case "users": {
        S.delete(uid);
        const u = DB.getStats().users;
        return show(
          ctx,
          `👤 FOYDALANUVCHILAR\n\nJami: ${u.total} · faol: ${u.active} · ban: ${u.banned}\n\nID yoki @username bo'yicha qidiring: ban qilish, bandan chiqarish, shaxsiy xabar yuborish mumkin.`,
          new InlineKeyboard().text("🔎 Qidirish", "a:usr").text("🏆 Top 10", "a:top").row().text("⬅️ Orqaga", "a:menu")
        );
      }
      case "usr":
        S.set(uid, { mode: "user_find" });
        return show(ctx, "🔎 Foydalanuvchi ID raqami yoki @username'ini yuboring.\nBekor: /cancel", cancelKb());
      case "top": {
        const rows = DB.topUsers(10);
        const t = rows.length
          ? rows.map((x, i) => `${i + 1}. ${x.first_name || "—"}${x.username ? " @" + x.username : ""} (${x.id}) — ${x.downloads}`).join("\n")
          : "Hali yuklashlar yo'q.";
        return show(ctx, `🏆 TOP 10 (yuklashlar soni)\n\n${t}`, backKb("a:users"));
      }
      case "bn":
      case "ub": {
        const id = Number(p1);
        if (DB.isAdmin(id)) return show(ctx, "Adminni ban qilib bo'lmaydi.", backKb("a:users"));
        DB.setBanned(id, act === "bn");
        const u = DB.getUser(id);
        return show(ctx, userCard(u), userKb(u));
      }
      case "dm":
        S.set(uid, { mode: "dm", target: Number(p1) });
        return show(ctx, `✉️ ${p1} ga yuboriladigan xabarni yuboring (matn/rasm/video/...).\nBekor: /cancel`, cancelKb());

      // ---------- sozlamalar ----------
      case "set": {
        S.delete(uid);
        const [t, kb] = settingsView();
        return show(ctx, t, kb);
      }
      case "sm":
        DB.setSetting("maintenance", DB.getSetting("maintenance") === "1" ? "0" : "1");
        return show(ctx, ...settingsView());
      case "sf":
        if (DB.getSetting("force_on") !== "1" && !DB.getSetting("force_channel"))
          return show(ctx, "Avval kanalni belgilang («🔗 Kanalni o'zgartirish»). Bot o'sha kanalda ADMIN bo'lishi kerak.", backKb("a:set"));
        DB.setSetting("force_on", DB.getSetting("force_on") === "1" ? "0" : "1");
        return show(ctx, ...settingsView());
      case "sfc":
        S.set(uid, { mode: "force_ch" });
        return show(ctx, "🔗 Majburiy obuna kanalining @username'ini yuboring (masalan: @mening_kanalim).\n\n⚠️ Kanal ochiq bo'lishi va bot unda ADMIN bo'lishi shart.\nBekor: /cancel", cancelKb());
      case "sd":
        S.set(uid, { mode: "num", key: "max_duration_min", min: 1, label: "Maksimal video davomiyligi (daqiqa)" });
        return show(ctx, "⏱ Maksimal video davomiyligini daqiqada yuboring (masalan: 60).\nBekor: /cancel", cancelKb());
      case "sl":
        S.set(uid, { mode: "num", key: "daily_limit", min: 0, label: "Kunlik limit" });
        return show(ctx, "📅 Bitta foydalanuvchi bir kunda nechta video yuklay olishini yuboring (0 = cheksiz).\nBekor: /cancel", cancelKb());

      // ---------- asboblar ----------
      case "tools":
        S.delete(uid);
        return show(ctx, ...(await toolsView()));
      case "ck":
        S.set(uid, { mode: "cookies" });
        return show(ctx, "🍪 cookies.txt faylini (Netscape format) hujjat sifatida yuboring. Yuborilgach xabaringiz xavfsizlik uchun o'chiriladi.\nBekor: /cancel", cancelKb());
      case "ytu": {
        await show(ctx, "🔄 yt-dlp yangilanmoqda...", undefined);
        const out = await updateYtdlp();
        return show(ctx, `🔄 Natija:\n${out}\n\nVersiya: ${await ytdlpVersion()}`, backKb("a:tools"));
      }

      // ---------- adminlar ----------
      case "adm":
        S.delete(uid);
        return show(ctx, ...adminsView());
      case "ada":
        S.set(uid, { mode: "adm_add" });
        return show(ctx, "➕ Yangi adminning Telegram ID raqamini yuboring (u botga /start bosgan bo'lishi kerak).\nBekor: /cancel", cancelKb());
      case "adr":
        if (!DB.isSuper(Number(p1))) DB.delAdmin(Number(p1));
        return show(ctx, ...adminsView());

      // ---------- export ----------
      case "exp":
        return show(
          ctx,
          "📥 EXPORT / ZAXIRA\n\nBaza zaxirasini vaqti-vaqti bilan olib turing: Railway'da volume bo'lmasa, qayta deploy qilganda ma'lumotlar o'chib ketadi.",
          new InlineKeyboard()
            .text("👥 Foydalanuvchilar (CSV)", "a:expu").row()
            .text("📥 Yuklashlar (CSV)", "a:expd").row()
            .text("💾 Bazani zaxiralash (.db)", "a:expb").row()
            .text("⬅️ Orqaga", "a:menu")
        );
      case "expu": {
        const rows = DB.allUsers().map((u) => ({
          ...u, joined_at: DB.fmtDate(u.joined_at), last_seen: DB.fmtDate(u.last_seen),
        }));
        const text = csv(rows, ["id", "username", "first_name", "lang", "joined_at", "last_seen", "downloads", "banned", "blocked"]);
        return void (await ctx.api.sendDocument(uid, new InputFile(Buffer.from(text), "users.csv"), { caption: `👥 ${rows.length} ta foydalanuvchi` }));
      }
      case "expd": {
        const rows = DB.allDownloads(5000).map((d) => ({ ...d, ts: DB.fmtDate(d.ts) }));
        const text = csv(rows, ["id", "ts", "user_id", "platform", "kind", "quality", "title", "url", "size", "ok", "error", "cached"]);
        return void (await ctx.api.sendDocument(uid, new InputFile(Buffer.from(text), "downloads.csv"), { caption: `📥 oxirgi ${rows.length} ta yuklash` }));
      }
      case "expb": {
        const tmp = path.join(os.tmpdir(), `bot-backup-${Date.now()}.db`);
        try {
          DB.backupTo(tmp);
          if (fs.statSync(tmp).size > 49 * 1024 * 1024) return show(ctx, "⚠️ Baza 50 MB dan katta, Telegram orqali yuborib bo'lmaydi.", backKb("a:exp"));
          await ctx.api.sendDocument(uid, new InputFile(tmp, "bot-backup.db"), { caption: "💾 Baza zaxirasi" });
        } catch (e) {
          await ctx.reply(`❌ Zaxira xatosi: ${e.message}`);
        } finally {
          fs.rm(tmp, { force: true }, () => {});
        }
        return;
      }

      case "errs": {
        const rows = DB.recentFailures(10);
        const t = rows.length
          ? rows.map((r) => `• ${DB.fmtDate(r.ts)} · ${r.platform || "?"}/${r.kind || "?"}\n  ${clip(r.error || "—", 160)}\n  ${clip(r.url || "", 80)}`).join("\n\n")
          : "✅ Xatolar yo'q.";
        return show(ctx, `⚠️ OXIRGI XATOLAR\n\n${t}`, new InlineKeyboard().text("🔃 Yangilash", "a:errs").text("⬅️ Orqaga", "a:menu"));
      }
    }
  });

  // ================= reklama yordamchilari =================
  function askAudience(ctx, st) {
    st.mode = "bc_aud";
    const kb = new InlineKeyboard()
      .text(`🌐 Hammaga (${DB.audienceCount()})`, "a:bcaud:all").row()
      .text(`🇺🇿 (${DB.audienceCount("uz")})`, "a:bcaud:uz")
      .text(`🇷🇺 (${DB.audienceCount("ru")})`, "a:bcaud:ru")
      .text(`🇬🇧 (${DB.audienceCount("en")})`, "a:bcaud:en").row()
      .text("❌ Bekor", "a:cancel");
    return show(ctx, "👥 Kimga yuboramiz?", kb);
  }

  async function sendOne(api, id, st, retry = true) {
    try {
      await api.copyMessage(id, st.src.chat, st.src.id, st.rows ? { reply_markup: toKb(st.rows) } : {});
      return "ok";
    } catch (e) {
      if (e instanceof GrammyError) {
        if (e.error_code === 429 && retry) {
          await sleep(((e.parameters?.retry_after || 3) + 1) * 1000);
          return sendOne(api, id, st, false);
        }
        if (e.error_code === 403) return "blocked";
        if (e.error_code === 400 && /chat not found|deactivated|PEER_ID_INVALID/i.test(e.description || "")) return "blocked";
      }
      return "failed";
    }
  }

  async function runBroadcast(api, adminId, st, msgId) {
    const ids = DB.audience(st.aud);
    const run = { cancel: false };
    bcRun = run;
    const total = ids.length;
    let sent = 0, failed = 0, blocked = 0;
    const t0 = Date.now();
    const lines = () =>
      `${bar(sent + failed + blocked, total, 20)} ${sent + failed + blocked}/${total}\n✅ yuborildi: ${sent}\n🚫 bloklagan: ${blocked}\n❌ xato: ${failed}`;
    const edit = (text, kb) => api.editMessageText(adminId, msgId, text, { reply_markup: kb }).catch(() => {});
    try {
      for (let b = 0, n = 0; b < total && !run.cancel; b += 20, n++) {
        const t1 = Date.now();
        await Promise.all(
          ids.slice(b, b + 20).map(async (id) => {
            const r = await sendOne(api, id, st);
            if (r === "ok") sent++;
            else if (r === "blocked") { blocked++; DB.setBlocked(id, 1); }
            else failed++;
          })
        );
        const wait = 1100 - (Date.now() - t1); // ~18 xabar/soniya (Telegram limiti ~30)
        if (wait > 0) await sleep(wait);
        if (n % 3 === 0) await edit(`📤 Yuborilmoqda...\n\n${lines()}`, new InlineKeyboard().text("⛔️ To'xtatish", "a:bcstop"));
      }
    } finally {
      bcRun = null;
    }
    DB.logBroadcast({ adminId, audience: st.aud || "all", total, sent, failed, blocked });
    const secs = Math.round((Date.now() - t0) / 1000);
    await edit(`${run.cancel ? "⛔️ REKLAMA TO'XTATILDI" : "✅ REKLAMA YUBORILDI"}\n\n${lines()}\n⏱ ${secs} soniya`, backKb());
  }

  // ================= admin xabarlari (holatga qarab) =================
  bot.on("message", async (ctx, next) => {
    if (!guard(ctx) || ctx.chat.type !== "private") return next();
    const uid = ctx.from.id;
    const st = S.get(uid);
    if (!st) return next();
    const text = ctx.message.text;

    if (text?.startsWith("/")) {
      if (/^\/cancel\b/i.test(text)) {
        S.delete(uid);
        return ctx.reply("Bekor qilindi.", { reply_markup: menuKb() });
      }
      S.delete(uid);
      return next();
    }

    switch (st.mode) {
      case "bc_msg":
        st.src = { chat: ctx.chat.id, id: ctx.message.message_id };
        st.mode = "bc_btn";
        return ctx.reply(
          "🔘 Xabar ostiga tugma qo'shasizmi?\n\nHar qator — bitta qator tugma. Format:\nMatn - https://havola\n\nBir qatorda bir nechta tugma uchun | belgisi:\nKanal - https://t.me/kanal | Sayt - https://example.com\n\nTugma kerak bo'lmasa pastdagi tugmani bosing.",
          { reply_markup: new InlineKeyboard().text("⏭ Tugmasiz davom etish", "a:bcnb").row().text("❌ Bekor", "a:cancel") }
        );

      case "bc_btn": {
        if (!text) return ctx.reply("Tugmalarni matn ko'rinishida yuboring yoki «Tugmasiz» ni bosing.");
        const r = parseButtons(text);
        if (r.error) return ctx.reply(`❌ ${r.error}\n\nQaytadan yuboring (format: Matn - https://havola).`);
        st.rows = r.rows;
        return askAudience(ctx, st);
      }

      case "start_text": {
        if (!text) return ctx.reply("Faqat matn yuboring.");
        DB.setSetting(`start_${st.lang}`, JSON.stringify({ text, entities: ctx.message.entities || [] }));
        S.delete(uid);
        await ctx.reply("✅ Saqlandi. Foydalanuvchilar quyidagicha ko'radi:");
        await ctx.reply(text, { entities: ctx.message.entities });
        return ctx.reply("🛠 Admin panel", { reply_markup: menuKb() });
      }

      case "cap_text": {
        if (!text) return ctx.reply("Faqat matn yuboring.");
        DB.setSetting("caption_tpl", text.slice(0, 500));
        S.delete(uid);
        const [t, kb] = await captionView(ctx.me);
        return ctx.reply(`✅ Saqlandi.\n\n${t}`, { reply_markup: kb });
      }

      case "user_find": {
        if (!text) return ctx.reply("ID yoki @username yuboring.");
        const u = DB.findUser(text);
        if (!u) return ctx.reply("❌ Topilmadi. Qaytadan yuboring yoki /cancel.");
        S.delete(uid);
        return ctx.reply(userCard(u), { reply_markup: userKb(u) });
      }

      case "dm":
        try {
          await ctx.api.copyMessage(st.target, ctx.chat.id, ctx.message.message_id);
          await ctx.reply("✅ Yuborildi.", { reply_markup: backKb("a:users") });
        } catch (e) {
          await ctx.reply(`❌ Yuborib bo'lmadi: ${e.description || e.message}`);
        }
        S.delete(uid);
        return;

      case "force_ch": {
        const ch = (text || "").trim();
        if (!/^@[A-Za-z0-9_]{4,}$/.test(ch)) return ctx.reply("❌ Faqat ochiq kanal @username'i (masalan: @mening_kanalim).");
        let warn = "";
        try {
          const chat = await ctx.api.getChat(ch);
          if (chat.type !== "channel") return ctx.reply("❌ Bu kanal emas.");
          const me = await ctx.api.getChatMember(ch, ctx.me.id);
          if (!["administrator", "creator"].includes(me.status)) warn = "\n\n⚠️ Bot bu kanalda ADMIN emas — obunani tekshira olmaydi. Botni kanalga admin qiling.";
        } catch (e) {
          return ctx.reply(`❌ Kanal topilmadi yoki bot unga kira olmaydi: ${e.description || e.message}`);
        }
        DB.setSetting("force_channel", ch);
        S.delete(uid);
        const [t, kb] = settingsView();
        return ctx.reply(`✅ Kanal saqlandi: ${ch}${warn}\n\n${t}`, { reply_markup: kb });
      }

      case "num": {
        const n = Number((text || "").trim());
        if (!Number.isInteger(n) || n < st.min || n > 100000) return ctx.reply(`❌ ${st.min} dan 100000 gacha butun son yuboring.`);
        DB.setSetting(st.key, n);
        S.delete(uid);
        const [t, kb] = settingsView();
        return ctx.reply(`✅ Saqlandi.\n\n${t}`, { reply_markup: kb });
      }

      case "cookies": {
        const doc = ctx.message.document;
        if (!doc) return ctx.reply("cookies.txt faylini hujjat (document) sifatida yuboring.");
        if (doc.file_size > 2 * 1024 * 1024) return ctx.reply("❌ Fayl juda katta (maks. 2 MB).");
        try {
          const f = await ctx.api.getFile(doc.file_id);
          const root = process.env.TG_API_ROOT || "https://api.telegram.org";
          const r = await fetch(`${root}/file/bot${bot.token}/${f.file_path}`);
          if (!r.ok) throw new Error(`yuklab olinmadi (${r.status})`);
          const buf = Buffer.from(await r.arrayBuffer());
          const body = buf.toString("utf8");
          const yt = (body.match(/youtube\.com/g) || []).length;
          const ig = (body.match(/instagram\.com/g) || []).length;
          if (!yt && !ig) return ctx.reply("❌ Faylda youtube.com yoki instagram.com cookie'lari topilmadi. To'g'ri (Netscape) formatdagi cookies.txt yuboring.");
          saveCookies(buf);
          S.delete(uid);
          await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id).catch(() => {});
          return ctx.reply(`✅ Cookies saqlandi (YouTube: ${yt}, Instagram: ${ig} ta yozuv). Xabaringiz o'chirildi.`, { reply_markup: backKb("a:tools") });
        } catch (e) {
          return ctx.reply(`❌ Xato: ${e.message}`);
        }
      }

      case "adm_add": {
        const id = Number((text || "").trim());
        if (!Number.isInteger(id) || id <= 0) return ctx.reply("❌ Faqat raqamli ID yuboring.");
        DB.addAdmin(id);
        S.delete(uid);
        const [t, kb] = adminsView();
        return ctx.reply(`✅ Qo'shildi: ${id}\n\n${t}`, { reply_markup: kb });
      }
    }
    return next();
  });
}
