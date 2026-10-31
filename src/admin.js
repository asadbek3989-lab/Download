import { InlineKeyboard, InputFile } from "grammy";
import { esc, toHtml, parseButtons, kbFrom } from "./format.js";
import * as S from "./store.js";
import { sendStored, startMessage, buildCaption } from "./messages.js";
import { getT, LANGS } from "./i18n.js";

const nf = (n) => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGETS = ["all", "uz", "ru", "en"];
const TARGET_NAME = { all: "🌐 Hammasi", uz: "🇺🇿 O'zbekcha", ru: "🇷🇺 Русский", en: "🇬🇧 English" };
const BTN_HELP =
  "Tugmalarni shunday yuboring:\n\n<code>Kanalimiz - https://t.me/kanal\nSayt - https://example.com</code>\n\n" +
  "Bir qatorda bir nechta tugma uchun <code>|</code> ishlating:\n<code>Tugma 1 - https://a.uz | Tugma 2 - https://b.uz</code>";

export function registerAdmin(bot, deps) {
  const { isInlineOn, refreshInline } = deps;
  const states = new Map(); // adminId -> {mode, ...}
  let cur = null; // hozir ketayotgan reklama

  // ---------- umumiy yordamchilar ----------
  const opts = (kb) => ({
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });

  async function show(ctx, text, kb) {
    if (ctx.callbackQuery?.message) {
      try {
        return await ctx.editMessageText(text, opts(kb));
      } catch (e) {
        if (/not modified/i.test(e.message)) return;
      }
    }
    return ctx.reply(text, opts(kb));
  }

  const back = (to = "a:home") => new InlineKeyboard().text("🔙 Orqaga", to);

  /** Admin yuborgan xabardan start xabari uchun mazmunni olish */
  function extractContent(msg) {
    const text = msg.text ?? msg.caption ?? "";
    const ents = msg.entities ?? msg.caption_entities ?? [];
    let type = null;
    let fid = null;
    if (msg.text) type = "text";
    else if (msg.photo) { type = "photo"; fid = msg.photo.at(-1).file_id; }
    else if (msg.video) { type = "video"; fid = msg.video.file_id; }
    else if (msg.animation) { type = "animation"; fid = msg.animation.file_id; }
    if (!type) return null;
    return { type, fid, html: toHtml(text, ents), len: text.length };
  }

  // ---------- bosh menyu ----------
  const homeKb = () =>
    new InlineKeyboard()
      .text("📊 Statistika", "a:stats").text("📢 Reklama yuborish", "a:bc").row()
      .text("👋 Start xabari", "a:start").text("🏷 Video reklamasi", "a:promo").row()
      .text("📣 Majburiy obuna", "a:sub").text("👤 Foydalanuvchilar", "a:usr").row()
      .text("⚙️ Sozlamalar", "a:set").text("💾 Backup", "a:bk").row()
      .text("👮 Adminlar", "a:adm");

  const home = (ctx) => show(ctx, "🛠 <b>Admin panel</b>\n\nKerakli bo'limni tanlang:", homeKb());

  bot.command("admin", async (ctx) => {
    if (ctx.chat.type !== "private" || !S.isAdmin(ctx.from.id)) return;
    states.delete(ctx.from.id);
    await home(ctx);
  });
  bot.command("stats", async (ctx) => {
    if (ctx.chat.type !== "private" || !S.isAdmin(ctx.from.id)) return;
    await showStats(ctx);
  });

  // ---------- statistika ----------
  async function showStats(ctx) {
    const s = S.getStats();
    const t = s.today;
    const L = [
      "📊 <b>Statistika</b>",
      "",
      `👥 Jami foydalanuvchilar: <b>${nf(s.total)}</b>`,
      `🟢 Faol: 24 soat — <b>${nf(s.a24)}</b> · 7 kun — <b>${nf(s.a7)}</b> · 30 kun — <b>${nf(s.a30)}</b>`,
      `🆕 Yangi: 24 soat — <b>${nf(s.n24)}</b> · 7 kun — <b>${nf(s.n7)}</b> · 30 kun — <b>${nf(s.n30)}</b>`,
      `🚫 Botni to'xtatgan: ${nf(s.blocked)} · Ban: ${nf(s.banned)}`,
      `🔗 Ulashish orqali kelganlar: ${nf(s.referred)}`,
      "",
      `⬇️ <b>Yuklashlar</b>: jami ${nf(s.totalDl)} · 30 kun ${nf(s.dl30)} · 7 kun ${nf(s.dl7)} · bugun <b>${nf(t.dl)}</b>`,
      `   ▶️ YouTube: ${nf(t.youtube)} · 📸 Instagram: ${nf(t.instagram)}  <i>(bugun)</i>`,
      `   🎬 Video: ${nf(t.video)} · 🎵 MP3: ${nf(t.mp3)}  <i>(bugun)</i>`,
      `   ⚡️ Keshdan (tezkor): ${nf(t.cached)} · ❌ Xatolar: ${nf(t.err)}  <i>(bugun)</i>`,
      "",
      `🌐 Tillar: 🇺🇿 ${nf(s.langs.uz)} · 🇷🇺 ${nf(s.langs.ru)} · 🇬🇧 ${nf(s.langs.en)} · tanlamagan ${nf(s.langs.none)}`,
      `⚙️ Hozir ishlayotgan yuklashlar: ${deps.getRunning()}`,
    ];
    if (s.top.length) {
      L.push("", "🏆 <b>Eng faol foydalanuvchilar</b>");
      s.top.forEach((u, i) =>
        L.push(`${i + 1}. ${esc(u.name || "—")}${u.username ? ` @${esc(u.username)}` : ""} · <code>${u.id}</code> — ${nf(u.dl)}`)
      );
    }
    L.push("", "📅 <b>Oxirgi 7 kun</b> (yangi / yuklash / xato)", "<pre>");
    for (const d of s.days) L.push(`${d.date}  +${d.new} / ${d.dl} / ${d.err}`);
    L.push("</pre>");
    const kb = new InlineKeyboard().text("🔄 Yangilash", "a:stats").text("🔙 Orqaga", "a:home");
    await show(ctx, L.join("\n"), kb);
  }

  // ---------- REKLAMA YUBORISH ----------
  const targetsOf = (target) =>
    S.allUsers()
      .filter(([, u]) => !u.blocked && !u.banned && (target === "all" || u.lang === target))
      .map(([id]) => Number(id));

  function bcText(d) {
    return (
      `👆 <b>Reklama ko'rinishi</b> (yuqoridagi xabar)\n\n` +
      `🎯 Auditoriya: <b>${TARGET_NAME[d.target]}</b>\n` +
      `👥 Qabul qiluvchilar: <b>${nf(targetsOf(d.target).length)}</b> ta\n` +
      `🔘 Tugmalar: ${d.rows.length ? `${d.rows.flat().length} ta` : "yo'q"}`
    );
  }
  function bcKb(d) {
    const kb = new InlineKeyboard().text("🔗 Tugma qo'shish", "bc:btn");
    if (d.rows.length) kb.text("🧹 Tugmalarni olib tashlash", "bc:clr");
    kb.row()
      .text(`🎯 Auditoriya: ${TARGET_NAME[d.target]}`, "bc:tg").row()
      .text("👁 Testni o'zimga yuborish", "bc:test").row()
      .text("🚀 Yuborish", "bc:go").text("❌ Bekor qilish", "bc:cancel");
    return kb;
  }

  async function sendPreview(ctx, d) {
    await ctx.api.copyMessage(ctx.chat.id, d.chatId, d.msgId, {
      reply_markup: kbFrom(d.rows),
    });
    await ctx.reply(bcText(d), opts(bcKb(d)));
  }

  function bcMenuText() {
    const last = S.lastBroadcast();
    let t =
      "📢 <b>Reklama yuborish</b>\n\n" +
      "Reklama xabarini hozir shu yerga yuboring. Qo'llab-quvvatlanadi:\n" +
      "• matn (qalin, havola, premium emoji saqlanadi)\n• rasm, video, GIF\n• ovozli xabar, audio, dumaloq video\n• fayl\n\n" +
      "Tugmalarni keyingi bosqichda qo'shasiz. ⚠️ Albomlar (bir nechta rasm) qo'llab-quvvatlanmaydi.";
    if (last) {
      t +=
        `\n\n📜 <b>Oxirgi reklama</b> (${new Date(last.ts).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}):\n` +
        `✅ ${nf(last.sent)} yetkazildi · 🚫 ${nf(last.blocked)} bloklagan · ❌ ${nf(last.failed)} xato` +
        `${last.stopped ? " · ⏹ to'xtatilgan" : ""}`;
    }
    return t;
  }

  async function runBroadcast(api, adminChat, d) {
    const ids = targetsOf(d.target);
    const job = { total: ids.length, sent: 0, failed: 0, blocked: 0, stop: false, done: false, ts: Date.now() };
    cur = job;
    const stopKb = new InlineKeyboard().text("⏹ To'xtatish", "bc:stop");
    const prog = () =>
      `📤 <b>Reklama yuborilmoqda...</b>\n\n` +
      `${nf(job.sent + job.failed + job.blocked)} / ${nf(job.total)}\n` +
      `✅ ${nf(job.sent)} · 🚫 ${nf(job.blocked)} · ❌ ${nf(job.failed)}`;
    const pm = await api.sendMessage(adminChat, prog(), opts(stopKb));
    const markup = kbFrom(d.rows);

    async function one(uid) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await api.copyMessage(uid, d.chatId, d.msgId, { reply_markup: markup });
          job.sent++;
          return;
        } catch (e) {
          const desc = e.description || e.message || "";
          if (e.error_code === 429) {
            await sleep(((e.parameters?.retry_after || 5) + 1) * 1000);
            continue;
          }
          if (e.error_code === 403 || /chat not found|user is deactivated|bot was blocked/i.test(desc)) {
            S.markBlocked(uid, true);
            job.blocked++;
            return;
          }
          job.failed++;
          if (job.failed <= 3) console.error("broadcast xato:", desc);
          return;
        }
      }
      job.failed++;
    }

    let lastEdit = Date.now();
    try {
      const BATCH = 20; // soniyasiga ~20 ta (Telegram chegarasi ~30)
      for (let i = 0; i < ids.length && !job.stop; i += BATCH) {
        const t0 = Date.now();
        await Promise.all(ids.slice(i, i + BATCH).map(one));
        const dt = Date.now() - t0;
        if (dt < 1000) await sleep(1000 - dt);
        if (Date.now() - lastEdit > 4000) {
          lastEdit = Date.now();
          await api.editMessageText(adminChat, pm.message_id, prog(), opts(stopKb)).catch(() => {});
        }
      }
    } catch (e) {
      console.error("broadcast to'xtadi:", e);
    }
    job.done = true;
    S.addBroadcast({
      ts: job.ts, total: job.total, sent: job.sent, failed: job.failed,
      blocked: job.blocked, stopped: job.stop, by: adminChat,
    });
    await api
      .editMessageText(
        adminChat, pm.message_id,
        `${job.stop ? "⏹ <b>Reklama to'xtatildi</b>" : "✅ <b>Reklama yuborib bo'lindi</b>"}\n\n` +
          `👥 Jami: ${nf(job.total)}\n✅ Yetkazildi: ${nf(job.sent)}\n🚫 Bloklagan: ${nf(job.blocked)}\n❌ Xato: ${nf(job.failed)}`,
        opts(back())
      )
      .catch(() => {});
  }

  // ---------- START XABARI ----------
  async function showStartMenu(ctx) {
    const L = ["👋 <b>Start xabari</b>", "", "Qaysi til uchun o'zgartirasiz?", ""];
    for (const l of Object.keys(LANGS)) {
      L.push(`${LANGS[l]} — ${S.settings.start[l] ? "✏️ maxsus" : "standart"}`);
    }
    const kb = new InlineKeyboard();
    for (const l of Object.keys(LANGS)) kb.text(LANGS[l], `st:${l}`);
    kb.row().text("🔙 Orqaga", "a:home");
    await show(ctx, L.join("\n"), kb);
  }

  async function showStartLang(ctx, l) {
    const m = startMessage(l);
    await ctx.reply(`👇 <b>${LANGS[l]}</b> — hozirgi start xabari:`, { parse_mode: "HTML" });
    try {
      await sendStored(ctx.api, ctx.chat.id, m, ctx.me.username);
    } catch (e) {
      await ctx.reply("⚠️ Ko'rsatib bo'lmadi: " + esc(e.message));
    }
    const kb = new InlineKeyboard()
      .text("✏️ Matnni o'zgartirish", `st:ed:${l}`).row()
      .text("🔘 Tugmalar", `st:bt:${l}`).text("♻️ Standartga", `st:rs:${l}`).row()
      .text("🔙 Orqaga", "a:start");
    await ctx.reply(
      `Tahrirlash: ${LANGS[l]}\n\n<i>Matnda <code>{bot}</code> yozsangiz, bot username'iga almashadi.</i>`,
      opts(kb)
    );
  }

  // ---------- VIDEO REKLAMASI ----------
  async function showPromo(ctx) {
    const on = S.settings.promoOn;
    const cur = (S.settings.promo ?? esc(getT("uz").promo)).replaceAll("{bot}", "@" + ctx.me.username);
    const kb = new InlineKeyboard()
      .text("✏️ O'zgartirish", "pr:ed").text("♻️ Standart", "pr:rs").row()
      .text(on ? "🔕 O'chirish" : "🔔 Yoqish", "pr:tg").text("👁 Namuna", "pr:pv").row()
      .text("🔙 Orqaga", "a:home");
    await show(
      ctx,
      `🏷 <b>Video reklamasi</b>\n\nHar bir yuklangan video/MP3 ostiga (caption) video nomidan keyin qo'shiladi va «Ulashish» orqali ham ketadi.\n\n` +
        `Holat: <b>${on ? "✅ yoqilgan" : "🔕 o'chirilgan"}</b>\n` +
        `${S.settings.promo ? "" : "<i>(standart matn — foydalanuvchi tiliga qarab)</i>\n"}\n` +
        `Joriy matn:\n<blockquote>${cur}</blockquote>`,
      kb
    );
  }

  // ---------- MAJBURIY OBUNA ----------
  async function showSub(ctx) {
    const ch = S.settings.channels;
    const L = [
      "📣 <b>Majburiy obuna</b>",
      "",
      `Holat: <b>${S.settings.subOn ? "✅ yoqilgan" : "🔕 o'chirilgan"}</b>`,
      "Foydalanuvchi video yuklashdan oldin quyidagi kanallarga obuna bo'lishi shart. Bot kanalda <b>admin</b> bo'lishi kerak.",
      "",
    ];
    if (!ch.length) L.push("<i>Kanal qo'shilmagan</i>");
    ch.forEach((c, i) => L.push(`${i + 1}. ${esc(c.title)} ${c.username ? "@" + esc(c.username) : ""}`));
    const kb = new InlineKeyboard();
    ch.forEach((c, i) => kb.text(`🗑 ${i + 1}. ${c.title}`.slice(0, 40), `sb:del:${i}`).row());
    kb.text("➕ Kanal qo'shish", "sb:add").row()
      .text(S.settings.subOn ? "🔕 O'chirish" : "🔔 Yoqish", "sb:tg").row()
      .text("🔙 Orqaga", "a:home");
    await show(ctx, L.join("\n"), kb);
  }

  // ---------- FOYDALANUVCHILAR ----------
  async function showUsers(ctx) {
    const kb = new InlineKeyboard()
      .text("🔍 Foydalanuvchini topish", "us:find").row()
      .text("🚫 Ban", "us:ban").text("✅ Bandan chiqarish", "us:unban").row()
      .text("🔙 Orqaga", "a:home");
    await show(ctx, "👤 <b>Foydalanuvchilar</b>\n\nID yoki @username bo'yicha topish, bloklash va shaxsiy xabar yuborish.", kb);
  }

  function resolveUserId(text) {
    const t = String(text || "").trim();
    if (/^\d{4,15}$/.test(t)) return Number(t);
    if (/^@?\w{3,}$/.test(t)) return S.findByUsername(t);
    return null;
  }

  async function userCard(ctx, id) {
    const u = S.getUser(id);
    if (!u) return ctx.reply("❌ Bunday foydalanuvchi bazada yo'q.", opts(back("a:usr")));
    const fmt = (ts) => (ts ? new Date(ts).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }) : "—");
    const kb = new InlineKeyboard()
      .text(u.banned ? "✅ Bandan chiqarish" : "🚫 Ban", `us:tb:${id}`)
      .text("✉️ Xabar yuborish", `us:msg:${id}`).row()
      .text("🔙 Orqaga", "a:usr");
    await ctx.reply(
      `👤 <b>${esc(u.name || "—")}</b> ${u.username ? "@" + esc(u.username) : ""}\n` +
        `🆔 <code>${id}</code>\n🌐 Til: ${u.lang || "—"}\n` +
        `📅 Qo'shilgan: ${fmt(u.joined)}\n🕒 Oxirgi faollik: ${fmt(u.last)}\n` +
        `⬇️ Yuklashlar: ${nf(u.dl)}\n👥 Taklif qilgan: ${nf(u.refs)}\n` +
        `${u.blocked ? "🚫 Botni bloklagan\n" : ""}${u.banned ? "⛔️ Ban qilingan\n" : ""}`,
      opts(kb)
    );
  }

  // ---------- SOZLAMALAR ----------
  async function showSettings(ctx) {
    const s = S.settings;
    const inl = isInlineOn();
    const kb = new InlineKeyboard()
      .text(`🛠 Texnik ishlar: ${s.maintenance ? "YOQILGAN" : "o'chiq"}`, "se:mt").row()
      .text(`📅 Kunlik limit: ${s.dailyLimit || "cheksiz"}`, "se:lim").row()
      .text(`⏱ Maks. davomiylik: ${s.maxDurationMin ?? deps.defaultMaxMin} daq`, "se:dur").row()
      .text(`💾 Avto-backup: ${s.autoBackup ? "✅" : "🔕"}`, "se:ab").row()
      .text("🔄 Inline rejimni tekshirish", "se:inl").row()
      .text("🔙 Orqaga", "a:home");
    await show(
      ctx,
      "⚙️ <b>Sozlamalar</b>\n\n" +
        `🛠 <b>Texnik ishlar</b> — yoqilganda oddiy foydalanuvchilarga bot ishlamaydi.\n` +
        `📅 <b>Kunlik limit</b> — bitta foydalanuvchi kuniga nechta yuklay oladi (0 = cheksiz).\n` +
        `💾 <b>Avto-backup</b> — har 12 soatda baza fayli asosiy adminga yuboriladi.\n\n` +
        `🔎 Inline rejim: <b>${inl ? "✅ yoqilgan" : "❌ o'chiq"}</b>\n` +
        (inl
          ? "«📤 Ulashish» tugmasi videoning o'zini (caption bilan) jo'natadi."
          : "⚠️ «Ulashish» hozircha faqat bot havolasini ulashadi. Videoning o'zini ulashish uchun: @BotFather → /setinline → botni tanlang → istalgan matn yozing. So'ng shu yerda «Inline rejimni tekshirish»ni bosing."),
      kb
    );
  }

  // ---------- BACKUP ----------
  async function sendBackup(api, chatId, auto = false) {
    const buf = Buffer.from(S.exportBackup());
    await api.sendDocument(chatId, new InputFile(buf, `backup-${S.dayKey()}.json`), {
      caption: `${auto ? "🕒 Avto-backup" : "💾 Backup"} · ${nf(S.allUsers().length)} foydalanuvchi`,
    });
  }

  const autoTimer = setInterval(async () => {
    if (!S.settings.autoBackup) return;
    for (const id of S.OWNERS) {
      try { await sendBackup(bot.api, id, true); } catch (e) { console.error("avto-backup:", e.message); }
    }
  }, 12 * 60 * 60 * 1000);
  autoTimer.unref();

  // ---------- ADMINLAR ----------
  async function showAdmins(ctx) {
    const L = ["👮 <b>Adminlar</b>", ""];
    S.OWNERS.forEach((id) => L.push(`🔒 <code>${id}</code> — asosiy admin`));
    S.settings.admins.forEach((id) => L.push(`👤 <code>${id}</code>`));
    const kb = new InlineKeyboard();
    if (S.isOwner(ctx.from.id)) {
      S.settings.admins.forEach((id) => kb.text(`🗑 ${id}`, `ad:del:${id}`).row());
      kb.text("➕ Admin qo'shish", "ad:add").row();
    } else L.push("", "<i>Adminlarni faqat asosiy admin o'zgartira oladi.</i>");
    kb.text("🔙 Orqaga", "a:home");
    await show(ctx, L.join("\n"), kb);
  }

  // =====================================================================
  //                         CALLBACK ROUTER
  // =====================================================================
  bot.callbackQuery(/^(a|bc|st|pr|sb|us|se|bk|ad):/, async (ctx) => {
    const uid = ctx.from.id;
    if (!S.isAdmin(uid)) return ctx.answerCallbackQuery({ text: "⛔️" });
    await ctx.answerCallbackQuery().catch(() => {});
    const data = ctx.callbackQuery.data;
    const [ns, ...rest] = data.split(":");
    const act = rest[0];
    const arg = rest[1];
    const st = states.get(uid);
    const ask = (mode, text, extra = {}) => {
      states.set(uid, { mode, ...extra });
      return show(ctx, text, new InlineKeyboard().text("❌ Bekor qilish", "a:home"));
    };
    if (ns === "a") states.delete(uid);

    try {
      // ----- bosh bo'limlar -----
      if (ns === "a") {
        switch (act) {
          case "home": return home(ctx);
          case "stats": return showStats(ctx);
          case "bc": return ask("bc_wait", bcMenuText());
          case "start": return showStartMenu(ctx);
          case "promo": return showPromo(ctx);
          case "sub": return showSub(ctx);
          case "usr": return showUsers(ctx);
          case "set": return showSettings(ctx);
          case "adm": return showAdmins(ctx);
          case "bk":
            return show(
              ctx,
              "💾 <b>Backup</b>\n\nBaza (foydalanuvchilar, sozlamalar, statistika) bitta JSON fayl bo'ladi. Railway'da Volume ulamagan bo'lsangiz, redeploy'da baza o'chadi — shunda backup'dan tiklaysiz.",
              new InlineKeyboard()
                .text("📥 Backup olish", "bk:get").text("📤 Tiklash", "bk:put").row()
                .text("🔙 Orqaga", "a:home")
            );
        }
      }

      // ----- reklama -----
      if (ns === "bc") {
        const d = st?.draft;
        if (act === "stop") {
          if (cur && !cur.done) cur.stop = true;
          return;
        }
        if (!d) return show(ctx, "⌛ Reklama qoralamasi topilmadi. Qaytadan boshlang.", back());
        switch (act) {
          case "cancel":
            states.delete(uid);
            return home(ctx);
          case "tg":
            d.target = TARGETS[(TARGETS.indexOf(d.target) + 1) % TARGETS.length];
            return show(ctx, bcText(d), bcKb(d));
          case "btn":
            states.set(uid, { mode: "bc_btn", draft: d });
            return ctx.reply("🔗 <b>Tugmalar</b>\n\n" + BTN_HELP, opts(new InlineKeyboard().text("↩️ Bekor", "bc:back")));
          case "back":
            states.set(uid, { mode: "bc_ready", draft: d });
            return show(ctx, bcText(d), bcKb(d));
          case "clr":
            d.rows = [];
            return sendPreview(ctx, d);
          case "test":
            return ctx.api
              .copyMessage(ctx.chat.id, d.chatId, d.msgId, { reply_markup: kbFrom(d.rows) })
              .catch((e) => ctx.reply("❌ " + esc(e.message)));
          case "go": {
            if (cur && !cur.done) return ctx.reply("⏳ Boshqa reklama hali yuborilmoqda.");
            const kb = new InlineKeyboard().text("✅ Ha, yuborish", "bc:yes").text("↩️ Yo'q", "bc:back");
            return show(ctx, `⚠️ <b>${nf(targetsOf(d.target).length)}</b> ta foydalanuvchiga (${TARGET_NAME[d.target]}) yuborilsinmi?`, kb);
          }
          case "yes": {
            if (cur && !cur.done) return;
            states.delete(uid);
            await show(ctx, "🚀 Yuborish boshlandi...", undefined);
            runBroadcast(ctx.api, ctx.chat.id, d).catch((e) => console.error("runBroadcast:", e));
            return;
          }
        }
      }

      // ----- start xabari -----
      if (ns === "st") {
        if (["uz", "ru", "en"].includes(act)) return showStartLang(ctx, act);
        const l = arg;
        if (act === "ed")
          return ask("st_wait", `✏️ <b>${LANGS[l]}</b> uchun yangi start xabarini yuboring.\n\nMatn yoki rasm/video/GIF (izoh bilan) bo'lishi mumkin. Qalin, havola, premium emoji saqlanadi.\nBot username uchun <code>{bot}</code> yozing.`, { lang: l });
        if (act === "bt")
          return ask("st_btn", `🔘 <b>${LANGS[l]}</b> start xabari tugmalari\n\n${BTN_HELP}\n\nO'chirish uchun <code>yo'q</code> deb yozing.`, { lang: l });
        if (act === "rs") {
          S.settings.start[l] = null;
          S.persist();
          await ctx.reply(`♻️ ${LANGS[l]} — standart start xabari tiklandi.`);
          return showStartLang(ctx, l);
        }
      }

      // ----- video reklamasi -----
      if (ns === "pr") {
        if (act === "ed")
          return ask("pr_wait", "✏️ Video ostiga qo'shiladigan reklama matnini yuboring (faqat matn, 500 belgigacha).\n\n<code>{bot}</code> — bot username'iga, <code>{link}</code> — bot havolasiga almashadi.\nQalin, havola, premium emoji ishlaydi.");
        if (act === "rs") { S.settings.promo = null; S.persist(); return showPromo(ctx); }
        if (act === "tg") { S.settings.promoOn = !S.settings.promoOn; S.persist(); return showPromo(ctx); }
        if (act === "pv") {
          const cap = buildCaption("Namuna video nomi", "uz", ctx.me.username);
          return ctx.reply("👇 Namuna (video caption'i shunday ko'rinadi):\n\n" + (cap || "<i>reklama o'chirilgan</i>"), opts());
        }
      }

      // ----- majburiy obuna -----
      if (ns === "sb") {
        if (act === "tg") { S.settings.subOn = !S.settings.subOn; S.persist(); return showSub(ctx); }
        if (act === "del") {
          S.settings.channels.splice(Number(arg), 1);
          S.persist();
          return showSub(ctx);
        }
        if (act === "add")
          return ask("sb_add", "➕ Kanalni qo'shish uchun <b>@username</b> yuboring yoki kanaldan biror xabarni shu yerga <b>forward</b> qiling.\n\n⚠️ Bot avval o'sha kanalga <b>admin</b> qilib qo'shilgan bo'lishi kerak.");
      }

      // ----- foydalanuvchilar -----
      if (ns === "us") {
        const prompts = {
          find: ["us_find", "🔍 Foydalanuvchi ID raqami yoki @username yuboring:"],
          ban: ["us_ban", "🚫 Ban qilinadigan foydalanuvchi ID/@username yuboring:"],
          unban: ["us_unban", "✅ Bandan chiqariladigan foydalanuvchi ID/@username yuboring:"],
        };
        if (prompts[act]) return ask(...prompts[act]);
        if (act === "tb") {
          const id = Number(arg);
          if (S.isAdmin(id)) return ctx.reply("❌ Adminni ban qilib bo'lmaydi.");
          S.setBanned(id, !S.isBanned(id));
          return userCard(ctx, id);
        }
        if (act === "msg")
          return ask("us_msg", "✉️ Foydalanuvchiga yuboriladigan xabarni yuboring (istalgan turdagi):", { target: Number(arg) });
      }

      // ----- sozlamalar -----
      if (ns === "se") {
        if (act === "mt") { S.settings.maintenance = !S.settings.maintenance; S.persist(); return showSettings(ctx); }
        if (act === "ab") { S.settings.autoBackup = !S.settings.autoBackup; S.persist(); return showSettings(ctx); }
        if (act === "inl") { await refreshInline(); return showSettings(ctx); }
        if (act === "lim") return ask("se_lim", "📅 Kunlik limitni raqam bilan yuboring (0 = cheksiz):");
        if (act === "dur") return ask("se_dur", "⏱ Maksimal video davomiyligini daqiqada yuboring (masalan 60):");
      }

      // ----- backup -----
      if (ns === "bk") {
        if (act === "get") return sendBackup(ctx.api, ctx.chat.id).catch((e) => ctx.reply("❌ " + esc(e.message)));
        if (act === "put")
          return ask("bk_wait", "📤 Backup <b>.json</b> faylini yuboring.\n\n⚠️ Joriy ma'lumotlar to'liq almashtiriladi!");
      }

      // ----- adminlar -----
      if (ns === "ad") {
        if (!S.isOwner(uid)) return ctx.reply("⛔️ Faqat asosiy admin.");
        if (act === "add")
          return ask("ad_add", "➕ Yangi adminning Telegram ID raqamini yuboring yoki uning biror xabarini forward qiling.\n\n<i>ID ni @userinfobot orqali bilish mumkin.</i>");
        if (act === "del") {
          S.settings.admins = S.settings.admins.filter((x) => x !== Number(arg));
          S.persist();
          return showAdmins(ctx);
        }
      }
    } catch (e) {
      console.error("admin callback xato:", e);
      await ctx.reply("❌ Xato: " + esc(e.message)).catch(() => {});
    }
  });

  // =====================================================================
  //                 ADMIN XABARLARI (holatga qarab)
  // =====================================================================
  bot.on("message", async (ctx, next) => {
    const uid = ctx.from?.id;
    if (ctx.chat.type !== "private" || !S.isAdmin(uid)) return next();
    const st = states.get(uid);
    if (!st) return next();
    if (ctx.message.text?.startsWith("/")) {
      states.delete(uid);
      return next();
    }
    try {
      await handleState(ctx, st);
    } catch (e) {
      console.error("admin state xato:", e);
      await ctx.reply("❌ Xato: " + esc(e.message)).catch(() => {});
    }
  });

  async function handleState(ctx, st) {
    const uid = ctx.from.id;
    const m = ctx.message;
    const done = (text, kb = back()) => {
      states.delete(uid);
      return ctx.reply(text, opts(kb));
    };

    switch (st.mode) {
      // --- reklama xabari ---
      case "bc_wait": {
        if (m.media_group_id) {
          return ctx.reply("⚠️ Albomlar qo'llab-quvvatlanmaydi. Bitta xabar yuboring (rasm/video + izoh).");
        }
        const d = { chatId: ctx.chat.id, msgId: m.message_id, rows: [], target: "all" };
        try {
          await sendPreview(ctx, d);
        } catch (e) {
          return ctx.reply("❌ Bu xabarni reklama qilib bo'lmadi: " + esc(e.message));
        }
        states.set(uid, { mode: "bc_ready", draft: d });
        return;
      }
      case "bc_btn": {
        if (!m.text) return ctx.reply("Tugmalarni matn ko'rinishida yuboring.");
        let rows;
        try {
          rows = parseButtons(m.text);
        } catch (e) {
          return ctx.reply("❌ " + esc(e.message) + "\n\n" + BTN_HELP, opts());
        }
        st.draft.rows = rows;
        states.set(uid, { mode: "bc_ready", draft: st.draft });
        try {
          await sendPreview(ctx, st.draft);
        } catch (e) {
          st.draft.rows = [];
          return ctx.reply("❌ Telegram tugmalarni qabul qilmadi: " + esc(e.message));
        }
        return;
      }

      // --- start xabari ---
      case "st_wait": {
        const c = extractContent(m);
        if (!c) return ctx.reply("Matn, rasm, video yoki GIF yuboring.");
        if (c.type !== "text" && c.len > 1000) return ctx.reply("⚠️ Izoh 1000 belgidan oshmasligi kerak.");
        const old = S.settings.start[st.lang];
        S.settings.start[st.lang] = { type: c.type, fid: c.fid, html: c.html, buttons: old?.buttons || [] };
        S.persist();
        states.delete(uid);
        await ctx.reply("✅ Start xabari saqlandi.");
        return showStartLang(ctx, st.lang);
      }
      case "st_btn": {
        if (!m.text) return ctx.reply("Tugmalarni matn ko'rinishida yuboring.");
        let rows = [];
        if (!/^(yo'q|yoq|no|нет|-)$/i.test(m.text.trim())) {
          try {
            rows = parseButtons(m.text);
          } catch (e) {
            return ctx.reply("❌ " + esc(e.message) + "\n\n" + BTN_HELP, opts());
          }
        }
        const cur0 = S.settings.start[st.lang] || { ...startMessage(st.lang) };
        S.settings.start[st.lang] = { ...cur0, buttons: rows };
        S.persist();
        states.delete(uid);
        await ctx.reply("✅ Tugmalar saqlandi.");
        return showStartLang(ctx, st.lang);
      }

      // --- video reklamasi ---
      case "pr_wait": {
        if (!m.text) return ctx.reply("Faqat matn yuboring.");
        if (m.text.length > 500) return ctx.reply("⚠️ 500 belgidan oshmasin.");
        S.settings.promo = toHtml(m.text, m.entities);
        S.settings.promoOn = true;
        S.persist();
        states.delete(uid);
        await ctx.reply("✅ Reklama matni saqlandi.");
        return showPromo(ctx);
      }

      // --- majburiy obuna: kanal qo'shish ---
      case "sb_add": {
        let ref = null;
        if (m.forward_origin?.type === "channel") ref = m.forward_origin.chat.id;
        else if (m.text) {
          const t = m.text.trim().replace(/^https?:\/\/t\.me\//i, "@");
          if (/^@?[A-Za-z]\w{3,}$/.test(t)) ref = t.startsWith("@") ? t : "@" + t;
        }
        if (!ref) return ctx.reply("❌ @username yuboring yoki kanaldan xabar forward qiling.");
        let chat;
        try {
          chat = await ctx.api.getChat(ref);
        } catch {
          return ctx.reply("❌ Kanal topilmadi. Bot shu kanalga admin qilib qo'shilganini tekshiring.");
        }
        if (chat.type !== "channel" && chat.type !== "supergroup")
          return ctx.reply("❌ Bu kanal/guruh emas.");
        try {
          const me = await ctx.api.getChatMember(chat.id, ctx.me.id);
          if (me.status !== "administrator" && me.status !== "creator")
            return ctx.reply("❌ Bot bu kanalda admin emas. Avval botni admin qiling.");
        } catch {
          return ctx.reply("❌ Bot kanalga kira olmadi. Admin qilib qo'shing.");
        }
        let url = chat.username ? `https://t.me/${chat.username}` : null;
        if (!url) {
          try { url = await ctx.api.exportChatInviteLink(chat.id); } catch {}
        }
        if (!url) return ctx.reply("❌ Kanal havolasini olib bo'lmadi (botga «havola yaratish» huquqini bering).");
        if (S.settings.channels.some((c) => c.id === chat.id)) return done("ℹ️ Bu kanal allaqachon qo'shilgan.");
        S.settings.channels.push({ id: chat.id, title: chat.title, username: chat.username || null, url });
        S.persist();
        states.delete(uid);
        await ctx.reply(`✅ «${esc(chat.title)}» qo'shildi.`, { parse_mode: "HTML" });
        return showSub(ctx);
      }

      // --- foydalanuvchilar ---
      case "us_find":
      case "us_ban":
      case "us_unban": {
        const id = resolveUserId(m.text);
        if (!id || !S.getUser(id)) return ctx.reply("❌ Foydalanuvchi bazada topilmadi. ID yoki @username ni tekshiring.");
        if (st.mode === "us_find") {
          states.delete(uid);
          return userCard(ctx, id);
        }
        if (S.isAdmin(id)) return ctx.reply("❌ Adminni ban qilib bo'lmaydi.");
        S.setBanned(id, st.mode === "us_ban");
        states.delete(uid);
        return userCard(ctx, id);
      }
      case "us_msg": {
        states.delete(uid);
        try {
          await ctx.api.copyMessage(st.target, ctx.chat.id, m.message_id);
          return ctx.reply("✅ Yuborildi.", opts(back("a:usr")));
        } catch (e) {
          return ctx.reply("❌ Yuborib bo'lmadi: " + esc(e.description || e.message), opts(back("a:usr")));
        }
      }

      // --- sozlamalar ---
      case "se_lim": {
        const n = Number(String(m.text || "").trim());
        if (!Number.isInteger(n) || n < 0 || n > 100000) return ctx.reply("❌ 0 dan katta butun son yuboring.");
        S.settings.dailyLimit = n;
        S.persist();
        states.delete(uid);
        return showSettings(ctx);
      }
      case "se_dur": {
        const n = Number(String(m.text || "").trim());
        if (!Number.isInteger(n) || n < 1 || n > 600) return ctx.reply("❌ 1 dan 600 gacha son yuboring.");
        S.settings.maxDurationMin = n;
        S.persist();
        states.delete(uid);
        return showSettings(ctx);
      }

      // --- backup tiklash ---
      case "bk_wait": {
        if (!m.document) return ctx.reply("❌ .json faylni hujjat (document) sifatida yuboring.");
        if (m.document.file_size > 20 * 1024 * 1024) return ctx.reply("❌ Fayl juda katta (20 MB gacha).");
        const f = await ctx.api.getFile(m.document.file_id);
        const r = await fetch(`https://api.telegram.org/file/bot${bot.token}/${f.file_path}`);
        if (!r.ok) throw new Error("Faylni yuklab bo'lmadi");
        const n = S.importBackup(JSON.parse(await r.text()));
        return done(`✅ Tiklandi: ${nf(n)} foydalanuvchi.`);
      }

      // --- admin qo'shish ---
      case "ad_add": {
        let id = null;
        if (m.forward_origin?.type === "user") id = m.forward_origin.sender_user.id;
        else if (/^\d{5,15}$/.test((m.text || "").trim())) id = Number(m.text.trim());
        if (!id) return ctx.reply("❌ ID raqam yuboring yoki foydalanuvchi xabarini forward qiling.");
        if (!S.isAdmin(id)) S.settings.admins.push(id);
        S.persist();
        states.delete(uid);
        return showAdmins(ctx);
      }
    }
  }
}
