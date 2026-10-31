import { esc } from "./format.js";

const nf = (n) => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Monospace jadval: birinchi ustun chapga, qolganlari o'ngga tekislanadi */
function table(head, rows) {
  const w0 = Math.max(...[head[0], ...rows.map((r) => r[0])].map((x) => x.length));
  const ws = head.slice(1).map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i + 1]).length)));
  const line = (r) =>
    r[0].padEnd(w0) + r.slice(1).map((c, i) => "  " + String(c).padStart(ws[i])).join("");
  return "<pre>" + [head, ...rows].map((r, i) => line(i === 0 ? r : r.map(String))).join("\n") + "</pre>";
}

/** getStats() natijasidan tartibli HTML matn yasaydi */
export function statsText(s, { running = 0, time = "" } = {}) {
  const p = s.per;
  const row = (label, f) => [label, nf(p[f].d1), nf(p[f].d7), nf(p[f].d30)];
  const L = [];

  L.push(`📊 <b>Statistika</b>${time ? `  <i>· ${time}</i>` : ""}`, "");

  L.push(`👥 <b>FOYDALANUVCHILAR</b> — jami <b>${nf(s.total)}</b>`);
  L.push(
    table(
      ["", "24 soat", "7 kun", "30 kun"],
      [
        ["Faol", nf(s.a24), nf(s.a7), nf(s.a30)],
        ["Yangi", nf(s.n24), nf(s.n7), nf(s.n30)],
      ]
    )
  );
  L.push(`🚫 Botni to'xtatgan: <b>${nf(s.blocked)}</b>  ·  ⛔️ Ban: <b>${nf(s.banned)}</b>`);
  L.push(`🔗 Ulashish orqali kelgan: <b>${nf(s.referred)}</b>`);
  L.push(
    `🌐 🇺🇿 ${nf(s.langs.uz)}  ·  🇷🇺 ${nf(s.langs.ru)}  ·  🇬🇧 ${nf(s.langs.en)}  ·  tanlamagan ${nf(s.langs.none)}`
  );
  L.push("");

  L.push(`⬇️ <b>YUKLASHLAR</b> — jami <b>${nf(s.totalDl)}</b>`);
  L.push(
    table(
      ["", "Bugun", "7 kun", "30 kun"],
      [
        row("Jami", "dl"),
        row("YouTube", "youtube"),
        row("Instagram", "instagram"),
        row("Video", "video"),
        row("MP3", "mp3"),
        row("Keshdan", "cached"),
        row("Xato", "err"),
      ]
    )
  );
  L.push(`⚙️ Hozir ishlayotgan yuklashlar: <b>${running}</b>`, "");

  if (s.top.length) {
    L.push("🏆 <b>ENG FAOL FOYDALANUVCHILAR</b>");
    s.top.forEach((u, i) =>
      L.push(
        `${i + 1}. ${esc(u.name || "—")}${u.username ? ` (@${esc(u.username)})` : ""} — <b>${nf(u.dl)}</b> · <code>${u.id}</code>`
      )
    );
    L.push("");
  }

  L.push("📅 <b>OXIRGI 7 KUN</b>");
  L.push(
    table(
      ["Sana", "Yangi", "Yuklash", "Xato"],
      s.days.map((d) => [d.date.slice(5), nf(d.new), nf(d.dl), nf(d.err)])
    )
  );
  return L.join("\n");
}
