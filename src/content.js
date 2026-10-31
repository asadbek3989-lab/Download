import { getSetting } from "./db.js";
import { clip } from "./utils.js";

export const DEFAULT_AD = "📥 Yuklab olish: @{bot}";

export const adTemplate = () => getSetting("caption_tpl", DEFAULT_AD);
export const titleInCaption = () => getSetting("caption_title", "1") === "1";

/** Video/audio ostidagi caption: [sarlavha] + reklama matni. Telegram limiti: 1024 belgi. */
export function buildCaption(title, botUsername, { withTitle = true } = {}) {
  const ad = adTemplate().replaceAll("{bot}", botUsername);
  if (!withTitle || !titleInCaption() || !title) return clip(ad, 1024);
  const room = 1024 - ad.length - 2;
  if (room < 10) return clip(ad, 1024);
  return `${clip(title, room)}\n\n${ad}`;
}

/** Admin panelda o'zgartirilgan /start xabari ({text, entities}) yoki null. */
export function getStartMsg(lang) {
  const raw = getSetting(`start_${lang}`);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o?.text ? o : null;
  } catch {
    return null;
  }
}
