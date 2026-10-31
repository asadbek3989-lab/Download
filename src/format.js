// Telegram xabarlarini HTML'ga o'girish va tugma matnini tahlil qilish yordamchilari

export const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s = "") => esc(s).replace(/"/g, "&quot;");

function tagsFor(e) {
  switch (e.type) {
    case "bold": return ["<b>", "</b>"];
    case "italic": return ["<i>", "</i>"];
    case "underline": return ["<u>", "</u>"];
    case "strikethrough": return ["<s>", "</s>"];
    case "spoiler": return ["<tg-spoiler>", "</tg-spoiler>"];
    case "code": return ["<code>", "</code>"];
    case "pre":
      return e.language
        ? [`<pre><code class="language-${escAttr(e.language)}">`, "</code></pre>"]
        : ["<pre>", "</pre>"];
    case "text_link": return [`<a href="${escAttr(e.url)}">`, "</a>"];
    case "text_mention": return [`<a href="tg://user?id=${e.user?.id}">`, "</a>"];
    case "custom_emoji": return [`<tg-emoji emoji-id="${escAttr(e.custom_emoji_id)}">`, "</tg-emoji>"];
    case "blockquote": return ["<blockquote>", "</blockquote>"];
    case "expandable_blockquote": return ["<blockquote expandable>", "</blockquote>"];
    default: return null; // url, mention, hashtag... Telegram o'zi taniydi
  }
}

/** Telegram text + entities  ->  parse_mode=HTML satri (offsetlar UTF-16, JS bilan bir xil) */
export function toHtml(text = "", entities = []) {
  const list = (entities || [])
    .map((e) => ({ t: tagsFor(e), start: e.offset, end: e.offset + e.length }))
    .filter((x) => x.t && x.end > x.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  if (!list.length) return esc(text);

  let out = "";
  const stack = [];
  let next = 0;
  for (let i = 0; i <= text.length; i++) {
    // tugagan teglarni yopish (kerak bo'lsa ustidagilarni qayta ochib)
    for (;;) {
      const idx = stack.findIndex((x) => x.end <= i);
      if (idx === -1) break;
      const reopen = [];
      while (stack.length > idx) {
        const x = stack.pop();
        out += x.t[1];
        if (x.end > i) reopen.push(x);
      }
      for (const x of reopen.reverse()) {
        out += x.t[0];
        stack.push(x);
      }
    }
    while (next < list.length && list[next].start <= i) {
      const x = list[next++];
      if (x.end > i) {
        out += x.t[0];
        stack.push(x);
      }
    }
    if (i < text.length) out += esc(text[i]);
  }
  while (stack.length) out += stack.pop().t[1];
  return out;
}

/**
 * Tugmalar matni:
 *   Matn - https://link
 *   Tugma 1 - https://a.uz | Tugma 2 - https://b.uz     (bir qatorda ikkita)
 */
export function parseButtons(text) {
  const rows = [];
  for (const line of String(text).split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const row = [];
    for (const part of l.split("|")) {
      const m = part.trim().match(/^(.+?)\s+[-–—]\s+(\S+)$/);
      if (!m) throw new Error(`Noto'g'ri format: «${part.trim().slice(0, 40)}»`);
      let url = m[2];
      if (/^(t\.me|telegram\.me)\//i.test(url)) url = "https://" + url;
      else if (/^@\w{4,}$/.test(url)) url = "https://t.me/" + url.slice(1);
      else if (/^www\./i.test(url)) url = "https://" + url;
      if (!/^(https?:\/\/|tg:\/\/)\S+$/i.test(url))
        throw new Error(`Havola noto'g'ri: «${m[2].slice(0, 40)}»`);
      row.push({ text: m[1].trim().slice(0, 60), url });
    }
    rows.push(row);
  }
  if (!rows.length) throw new Error("Hech narsa topilmadi");
  if (rows.length > 20) throw new Error("Juda ko'p qator (maksimum 20)");
  return rows;
}

/** [{text,url}] qatorlaridan Telegram inline_keyboard obyektini yasash */
export const kbFrom = (rows) =>
  rows?.length
    ? { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, url: b.url }))) }
    : undefined;
