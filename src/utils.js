export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function fmtDur(sec) {
  if (!sec) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function fmtBytes(n) {
  if (!n) return "0 MB";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
}

/** Xabardan YouTube/Instagram havolasini ajratadi. {url, platform, key} yoki null */
export function parseLink(text) {
  const m = String(text || "").match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  let u;
  try { u = new URL(m[0]); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  let platform = null, key = null;

  if (host === "youtu.be") {
    platform = "youtube";
    if (parts[0]) key = `yt:${parts[0]}`;
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    platform = "youtube";
    const v = u.searchParams.get("v");
    if (v) key = `yt:${v}`;
    else if (["shorts", "live", "embed", "v"].includes(parts[0]) && parts[1]) key = `yt:${parts[1]}`;
  } else if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    platform = "instagram";
    const i = parts.findIndex((p) => ["reel", "reels", "p", "tv"].includes(p));
    if (i >= 0 && parts[i + 1]) key = `ig:${parts[i + 1]}`;
  } else return null;

  return { url: u.toString(), platform, key };
}

/** Muqova rasmini yuklab oladi (birinchi ishlagan URL). */
export async function fetchImage(urls) {
  for (const url of urls) {
    if (!url) continue;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0" } });
      clearTimeout(timer);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500 || buf.length > 9 * 1024 * 1024) continue;
      return { buf, ext: ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg" };
    } catch {}
  }
  return null;
}

/** "Matn - https://link" qatorlaridan tugmalar. Bir qatorda | bilan bir nechta tugma. */
export function parseButtons(text) {
  const rows = [];
  for (const line of String(text).split("\n").map((l) => l.trim()).filter(Boolean)) {
    const row = [];
    for (const part of line.split("|")) {
      const m = part.trim().match(/^(.+?)\s+[-–—]\s+((?:https?:\/\/|t\.me\/)\S+)$/i);
      if (!m) return { error: `Tushunarsiz qator: «${part.trim()}»` };
      const url = m[2].startsWith("t.me/") ? `https://${m[2]}` : m[2];
      row.push({ text: m[1].trim().slice(0, 64), url });
    }
    rows.push(row);
  }
  if (!rows.length) return { error: "Hech qanday tugma topilmadi." };
  if (rows.length > 8) return { error: "Ko'pi bilan 8 qator." };
  return { rows };
}

export const toKb = (rows) => (rows?.length ? { inline_keyboard: rows } : undefined);
export const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
