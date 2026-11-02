import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function exec(cmd, args, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      reject(new Error(`${cmd} timeout`));
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split("\n").pop() || `${cmd} exit ${code}`));
    });
  });
}

/** Videoning haqiqiy eni, bo'yi va davomiyligi */
export async function probe(file) {
  try {
    const out = await exec(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
      60 * 1000
    );
    const j = JSON.parse(out);
    const s = j.streams?.[0] || {};
    const d = Number(j.format?.duration);
    return {
      width: s.width || undefined,
      height: s.height || undefined,
      duration: d > 0 ? Math.round(d) : undefined,
    };
  } catch {
    return {};
  }
}

/** moov atomini boshiga ko'chiradi: Telegram videoni darhol oldindan ko'rsata oladi va oqim sifatida ijro etadi */
export async function faststart(file) {
  try {
    if (fs.statSync(file).size > 1.2 * 1024 ** 3) return; // juda katta fayl: disk joyini tejaymiz
    const tmp = file.replace(/\.mp4$/i, "") + ".fs.mp4";
    try {
      await exec("ffmpeg", ["-y", "-v", "error", "-i", file, "-c", "copy", "-movflags", "+faststart", tmp], 15 * 60 * 1000);
      fs.renameSync(tmp, file);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  } catch (e) {
    console.error("faststart:", e.message);
  }
}

/**
 * Telegram uchun muqova (JPEG, <=320px, <200 KB). Avval YouTube/Instagram muqovasi (buf),
 * bo'lmasa videoning o'z kadri. Muqova videoning nisbatiga (w/h) qirqiladi.
 */
export async function makeThumb(dir, { buf, file, duration, ratio }) {
  const out = path.join(dir, "thumb.jpg");
  const ar = ratio && ratio > 0.2 && ratio < 5 ? ratio.toFixed(4) : null;
  const crop = ar
    ? `crop=w='if(gt(iw/ih,${ar}),ih*${ar},iw)':h='if(gt(iw/ih,${ar}),ih,iw/${ar})',`
    : "";
  const vf = `${crop}scale=320:320:force_original_aspect_ratio=decrease`;

  const encode = async (input, pre = []) => {
    for (const q of ["4", "8", "14"]) {
      await exec("ffmpeg", ["-y", "-v", "error", ...pre, "-i", input, "-vf", vf, "-frames:v", "1", "-q:v", q, out], 60 * 1000);
      if (fs.statSync(out).size <= 190 * 1024) return true;
    }
    return false;
  };

  try {
    if (buf) {
      const raw = path.join(dir, "cover_raw");
      fs.writeFileSync(raw, buf);
      if (await encode(raw)) return out;
    }
  } catch (e) {
    console.error("muqova tayyorlash:", e.message);
  }
  try {
    if (file) {
      const ss = duration ? Math.max(1, Math.min(duration * 0.1, 60)) : 1;
      if (await encode(file, ["-ss", String(ss)])) return out;
    }
  } catch (e) {
    console.error("kadr olish:", e.message);
  }
  return null;
}
