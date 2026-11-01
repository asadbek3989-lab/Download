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

export async function getInfo(url) {
  const { out } = await run([...commonArgs(), "-J", url], 90 * 1000);
  const json = JSON.parse(out);
  const info = json.entries?.[0] ?? json;
  const formats = info.formats || [];
  const duration = info.duration || null;

  const est = (f) => sizeOf(f) || (f.tbr && duration ? Math.round(f.tbr * 125 * duration) : null);

  const video = formats.filter((f) => f.vcodec && f.vcodec !== "none" && (f.height || f.width));
  const audio = formats.filter(
    (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
  );
  const m4a = audio.filter((f) => /^mp4a/.test(f.acodec));
  const audioSize = (m4a.length ? m4a : audio).reduce((m, f) => Math.max(m, est(f) || 0), 0);

  // Har bir pog'ona uchun eng yaxshi format (avc1 afzal, so'ng bitreyt bo'yicha)
  const byTier = new Map();
  for (const f of video) {
    const t = tierOf(f);
    if (!t) continue;
    const score = (/^(avc1|h264)/.test(f.vcodec) ? 1e6 : 0) + (f.tbr || 0);
    const cur = byTier.get(t);
    if (!cur || score > cur.score) byTier.set(t, { f, score });
  }

  const options = [];
  for (const t of TIERS) {
    const hit = byTier.get(t);
    if (!hit) continue;
    const f = hit.f;
    const hasAudio = !!f.acodec && f.acodec !== "none";
    let size = est(f);
    if (size && !hasAudio) size += audioSize;
    options.push({ q: String(t), fid: f.format_id, hasAudio, est: size || null });
  }
  // Format haqida ma'lumot bo'lmasa (ba'zi Instagram postlari)
  if (!options.length) options.push({ q: "best", fid: null, hasAudio: true, est: null });

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
