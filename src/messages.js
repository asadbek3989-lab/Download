import { InlineKeyboard } from "grammy";
import { esc, kbFrom } from "./format.js";
import { settings } from "./store.js";
import { getT } from "./i18n.js";

const fill = (html, bot) =>
  html.replaceAll("{bot}", "@" + bot).replaceAll("{link}", `https://t.me/${bot}`);

/** Video captioniga qo'shiladigan reklama (HTML) */
export function promoHtml(lang, bot) {
  if (!settings.promoOn) return "";
  const raw = settings.promo ?? esc(getT(lang).promo);
  return fill(raw, bot);
}

/** Sarlavha + reklama, Telegram limiti (1024) ichida */
export function buildCaption(title, lang, bot) {
  const p = promoHtml(lang, bot);
  const room = 1024 - (p ? p.length + 2 : 0);
  let t = (title || "").slice(0, 300);
  let cut = false;
  while (t && esc(t).length + (cut ? 1 : 0) > room) {
    t = t.slice(0, Math.max(0, t.length - 20));
    cut = true;
  }
  const head = t ? esc(t) + (cut ? "…" : "") : "";
  return [head, p].filter(Boolean).join("\n\n");
}

export const plainCaption = (title, bot) => `${(title || "").slice(0, 300)}\n\n@${bot}`.trim();

/** «Ulashish» tugmasi: inline rejim yoqilgan bo'lsa videoning o'zini, aks holda bot havolasini ulashadi */
export function shareKb(t, sid, inlineOn, bot) {
  const kb = new InlineKeyboard();
  if (inlineOn) kb.switchInline(t.shareBtn, sid);
  else {
    const url = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/" + bot)}&text=${encodeURIComponent(t.shareText)}`;
    kb.url(t.shareBtn, url);
  }
  return kb;
}

export const startMessage = (lang) =>
  settings.start[lang] || { type: "text", html: esc(getT(lang).welcome), buttons: [] };

/** Admin saqlagan xabarni (matn/rasm/video/GIF + tugmalar) yuborish */
export async function sendStored(api, chatId, m, bot) {
  const html = fill(m.html || "", bot);
  const o = { parse_mode: "HTML", reply_markup: kbFrom(m.buttons) };
  switch (m.type) {
    case "photo": return api.sendPhoto(chatId, m.fid, { ...o, caption: html });
    case "video": return api.sendVideo(chatId, m.fid, { ...o, caption: html });
    case "animation": return api.sendAnimation(chatId, m.fid, { ...o, caption: html });
    default:
      return api.sendMessage(chatId, html || "👋", { ...o, link_preview_options: { is_disabled: true } });
  }
}
