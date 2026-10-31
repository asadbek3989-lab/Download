import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TG_LIMIT = 50 * 1024 * 1024; // Telegram Bot API fayl chegarasi
const MAX_SIZE_ARG = "49M";

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

export async function getInfo(url) {
  const { out } = await run([...commonArgs(), "-J", url], 90 * 1000);
  const json = JSON.parse(out);
  const info = json.entries?.[0] ?? json;
  const formats = info.formats || [];

  const video = formats.filter(
    (f) => f.vcodec && f.vcodec !== "none" && f.height
  );
  const audio = formats.filter(
    (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
  );
  const audioSize = audio.reduce((m, f) => Math.max(m, sizeOf(f) || 0), 0);

  let heights = [...new Set(video.map((f) => f.height))]
    .filter((h) => h >= 240 && h <= 1080)
    .sort((a, b) => a - b);
  if (!heights.length) {
    heights = [...new Set(video.map((f) => f.height))].sort((a, b) => a - b);
  }
  heights = heights.slice(-4);

  const options = [];
  for (const h of heights) {
    const cands = video.filter((f) => f.height === h);
    const pick = cands.find((f) => f.vcodec.startsWith("avc1")) || cands[0];
    let est = sizeOf(pick);
    if (est && pick.acodec === "none") est += audioSize;
    if (est && est > TG_LIMIT) continue; // Telegramga sig'maydi
    options.push({
      q: String(h),
      label: `${h}p` + (est ? ` · ${Math.max(1, Math.round(est / 1048576))}MB` : ""),
    });
  }
  // Format haqida ma'lumot bo'lmasa (ba'zi Instagram postlari)
  if (!video.length) options.push({ q: "best", label: null });

  return {
    title: (info.title || "Video").slice(0, 200),
    uploader: info.uploader || info.channel || "",
    duration: info.duration || null,
    options,
  };
}

export async function download(url, q, dir) {
  const args = [...commonArgs()];
  if (q === "mp3") {
    args.push("-f", "ba/b", "-x", "--audio-format", "mp3", "--audio-quality", "128K");
  } else {
    const fmt =
      q === "best"
        ? "b[ext=mp4]/bv*+ba/b"
        : `bv*[height<=${q}][vcodec^=avc1]+ba[acodec^=mp4a]/bv*[height<=${q}]+ba/b[height<=${q}]/b`;
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
    ({ err: stderr } = await run(args));
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
