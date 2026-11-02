import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// BOT_API_URL berilsa (o'zingizning local Bot API serveringiz) — 2 GB gacha, aks holda 50 MB
export const LOCAL_API = !!process.env.BOT_API_URL;
export const TG_LIMIT = (LOCAL_API ? 1900 : 50) * 1024 * 1024;
export const LIMIT_LABEL = LOCAL_API ? "2 GB" : "50 MB";
const MAX_SIZE_ARG = LOCAL_API ? "1900M" : "49M";
const DL_TIMEOUT = (LOCAL_API ? 120 : 20) * 60 * 1000;
export const TIERS = [144, 240, 360, 480, 720, 1080];

export class TooBigError extends Error {}

let cookiesPath = null;

export function setupCookies() {
  const b64 = process.env.COOKIES_B64;
  if (!b64) return;
  cookiesPath = path.join(os.tmpdir(), "cookies.txt");
  fs.writeFileSync(cookiesPath, Buffer.from(b64, "base64"));
  console.log("cookies.txt yuklandi");
}

function commonArgs() {
  const args = [
    "--no-warnings",
    "--no-progress",
    "--no-playlist",
    "--playlist-items", "1",
    "--socket-timeout", "30",
    "--retries", "3",
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);
  if (process.env.PROXY) args.push("--proxy", process.env.PROXY);
  return args;
}

function run(args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const p = spawn("yt-dlp", args);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error("yt-dlp timeout"));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ out, err });
      const last = err.trim().split("\n").pop() || `exit ${code}`;
      reject(Object.assign(new Error(last), { stderr: err }));
    });
  });
}

const sizeOf = (f) => f?.filesize || f?.filesize_approx || null;

// Muqova: webp bo'lmagan, 1280px gacha eng kattasi
function pickThumb(info) {
  const list = (info.thumbnails || [])
    .filter((t) => t.url && !/\.webp(\?|$)/i.test(t.url) && (!t.width || t.width <= 1280))
    .sort((a, b) => (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0));
  return (
    list.at(-1)?.url ||
    info.thumbnail ||
    (/youtube/i.test(info.extractor_key || "") && info.id
      ? `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`
      : null)
  );
}

// Formatni 144..1080 pog'onalaridan biriga bog'laymiz (vertikal videolarda ham to'g'ri: eng kichik tomon bo'yicha)
function tierOf(f) {
  const m = Math.min(f.width || Infinity, f.height || Infinity);
  if (!Number.isFinite(m)) return null;
  for (const t of TIERS) if (m <= t * 1.12) return t;
  return null; // 1080p dan katta
}

// Format faylining haqiqiy hajmi: Range so'rovi bilan serverdan olinadi (yt-dlp bermagan bo'lsa)
async function remoteSize(f) {
  if (!f.url || !/^https?:/i.test(f.url) || /m3u8|dash|manifest/i.test(f.protocol || "")) return null;
  try {
    const r = await fetch(f.url, {
      headers: { ...(f.http_headers || {}), Range: "bytes=0-0" },
      signal: AbortSignal.timeout(6000),
    });
    const total = r.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const len = Number(r.headers.get("content-length"));
    await r.body?.cancel().catch(() => {});
    if (total) return Number(total);
    return r.status === 200 && len > 1 ? len : null; // server Range'ni e'tiborsiz qoldirsa — to'liq uzunlik
  } catch {
    return null;
  }
}

export async function getInfo(url) {
  const { out } = await run([...commonArgs(), "-J", url], 90 * 1000);
  const json = JSON.parse(out);
  const info = json.entries?.[0] ?? json;
  const formats = info.formats || [];
  const duration = info.duration || null;

  // {s: bayt, exact: aniq o'lchanganmi}
  const sizeInfo = async (f) => {
    if (f.filesize) return { s: f.filesize, exact: true };
    const r = await remoteSize(f);
    if (r) return { s: r, exact: true };
    const approx = f.filesize_approx || (f.tbr && duration ? Math.round(f.tbr * 125 * duration) : null);
    return { s: approx, exact: false };
  };

  const video = formats.filter((f) => f.vcodec && f.vcodec !== "none" && (f.height || f.width));
  const audio = formats.filter(
    (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
  );
  // yuklashda `ba[acodec^=mp4a]` tanlanadi: eng yaxshi m4a (bo'lmasa istalgan audio)
  const audPool = audio.filter((f) => /^mp4a/.test(f.acodec));
  const audioFmt = (audPool.length ? audPool : audio).sort(
    (a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0)
  )[0];

  // Har bir pog'ona uchun eng yaxshi format (avc1 afzal, so'ng bitreyt bo'yicha)
  const byTier = new Map();
  for (const f of video) {
    const t = tierOf(f);
    if (!t) continue;
    const score = (/^(avc1|h264)/.test(f.vcodec) ? 1e6 : 0) + (f.tbr || 0);
    const cur = byTier.get(t);
    if (!cur || score > cur.score) byTier.set(t, { f, score });
  }
  const tiers = TIERS.filter((t) => byTier.has(t));

  const [aud, ...vids] = await Promise.all([
    audioFmt ? sizeInfo(audioFmt) : Promise.resolve({ s: 0, exact: true }),
    ...tiers.map((t) => sizeInfo(byTier.get(t).f)),
  ]);

  const options = tiers.map((t, i) => {
    const f = byTier.get(t).f;
    const hasAudio = !!f.acodec && f.acodec !== "none";
    const v = vids[i];
    let est = v.s || null;
    let exact = v.exact;
    if (est && !hasAudio) {
      est = Math.round((est + (aud.s || 0)) * 1.01); // birlashtirish (mp4 konteyner) ~1%
      exact = exact && aud.exact;
    }
    return { q: String(t), fid: f.format_id, hasAudio, est, exact };
  });
  // Format haqida ma'lumot bo'lmasa (ba'zi Instagram postlari)
  if (!options.length) options.push({ q: "best", fid: null, hasAudio: true, est: null, exact: false });

  return {
    key: info.id ? `${(info.extractor_key || "x").toLowerCase()}:${info.id}` : null,
    thumb: pickThumb(info),
    title: (info.title || "Video").slice(0, 200),
    uploader: info.uploader || info.channel || "",
    duration,
    options,
    // MP3 128 kbit/s ≈ 16 000 bayt/soniya
    mp3Est: duration ? Math.round(duration * 16000) : null,
  };
}

export async function download(url, sel, dir) {
  const args = [...commonArgs()];
  if (sel.mp3) {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "128K");
  } else {
    let fmt = "b[ext=mp4]/bv*+ba/b";
    if (sel.fid) {
      const id = sel.fid;
      fmt = sel.hasAudio ? `${id}/b` : `${id}+ba[acodec^=mp4a]/${id}+ba/${id}/b`;
    }
    args.push("-f", fmt, "--merge-output-format", "mp4", "--remux-video", "mp4");
  }
  args.push(
    "--max-filesize", MAX_SIZE_ARG,
    "--restrict-filenames",
    "-o", path.join(dir, "%(id)s.%(ext)s"),
    url
  );

  let stderr = "";
  try {
    ({ err: stderr } = await run(args, DL_TIMEOUT));
  } catch (e) {
    if (/larger than max-filesize/i.test(e.stderr || "")) throw new TooBigError();
    throw e;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => !/\.(part|ytdl|tmp)$/i.test(f))
    .map((f) => ({ f: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.size - a.size);

  if (!files.length) {
    if (/larger than max-filesize/i.test(stderr)) throw new TooBigError();
    throw new Error("fayl topilmadi");
  }
  if (files[0].size > TG_LIMIT) throw new TooBigError();
  return { file: files[0].f, size: files[0].size };
}
