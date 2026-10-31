import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = process.env.DATA_DIR || "./data";
const file = path.join(dir, "db.json");
const legacyFile = path.join(dir, "users.json"); // eski versiya (faqat tillar)

// Asosiy adminlar (egalar): ADMIN_ID=123,456
export const OWNERS = String(process.env.ADMIN_ID || "")
  .split(/[\s,;]+/)
  .map(Number)
  .filter((n) => Number.isInteger(n) && n > 0);

const DAY = 24 * 60 * 60 * 1000;
const MAX_SHARES = 10000;
const MAX_CACHE = 5000;

const defaults = () => ({
  admins: [], // panel orqali qo'shilgan adminlar
  channels: [], // majburiy obuna kanallari: {id,title,url,username}
  subOn: true,
  maintenance: false,
  dailyLimit: 0, // 0 = cheksiz
  maxDurationMin: null, // null = ENV dagi qiymat
  promoOn: true,
  promo: null, // video captioni reklamasi (HTML); null = standart
  autoBackup: true,
  start: { uz: null, ru: null, en: null }, // {type,fid,html,buttons}
});

function normalize(raw = {}) {
  const d = defaults();
  const s = { ...d, ...(raw.settings || {}) };
  s.start = { ...d.start, ...(raw.settings?.start || {}) };
  return {
    users: raw.users || {},
    settings: s,
    daily: raw.daily || {},
    shares: raw.shares || {},
    cache: raw.cache || {},
    broadcasts: raw.broadcasts || [],
  };
}

let db = normalize();

function load() {
  try {
    db = normalize(JSON.parse(fs.readFileSync(file, "utf8")));
    return;
  } catch {}
  try {
    const old = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
    for (const [id, u] of Object.entries(old)) {
      db.users[id] = { lang: u.lang || null, joined: Date.now(), last: Date.now(), dl: 0 };
    }
    console.log(`Eski users.json dan ${Object.keys(old).length} foydalanuvchi ko'chirildi`);
  } catch {}
}
load();

export const settings = db.settings; // jonli obyekt (importBackup joyida yangilaydi)

// ---------- saqlash ----------
let timer = null;
function save() {
  if (timer) return;
  timer = setTimeout(flush, 2000);
}
export function flush() {
  clearTimeout(timer);
  timer = null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error("store save xato:", e.message);
  }
}
export const persist = save;

// ---------- sana ----------
const TZ = process.env.TZ_NAME || "Asia/Tashkent";
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
export const dayKey = (ts = Date.now()) => dateFmt.format(ts); // YYYY-MM-DD

export function bump(field, n = 1) {
  const d = (db.daily[dayKey()] ??= {});
  d[field] = (d[field] || 0) + n;
  save();
}

// ---------- adminlar ----------
export const isOwner = (id) => OWNERS.includes(Number(id));
export const isAdmin = (id) => isOwner(id) || settings.admins.includes(Number(id));

// ---------- foydalanuvchilar ----------
export const getUser = (id) => db.users[id] || null;
export const allUsers = () => Object.entries(db.users);
export const findByUsername = (name) => {
  const n = name.replace(/^@/, "").toLowerCase();
  const e = Object.entries(db.users).find(([, u]) => u.username?.toLowerCase() === n);
  return e ? Number(e[0]) : null;
};

export function touchUser(from) {
  let u = db.users[from.id];
  let isNew = false;
  if (!u) {
    u = db.users[from.id] = { lang: null, joined: Date.now(), dl: 0 };
    isNew = true;
    bump("new");
  }
  u.name = [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 64);
  u.username = from.username || null;
  u.last = Date.now();
  if (u.blocked) u.blocked = false;
  save();
  return { user: u, isNew };
}

export const getLang = (id) => db.users[id]?.lang || null;
export function setLang(id, lang) {
  if (!db.users[id]) return;
  db.users[id].lang = lang;
  save();
}
export function markBlocked(id, v = true) {
  const u = db.users[id];
  if (!u || !!u.blocked === v) return;
  u.blocked = v;
  save();
}
export function setBanned(id, v = true) {
  const u = db.users[id];
  if (!u) return false;
  u.banned = v;
  save();
  return true;
}
export const isBanned = (id) => !!db.users[id]?.banned;

export function setReferrer(id, refId) {
  const u = db.users[id];
  const r = db.users[refId];
  if (!u || !r || u.ref || Number(id) === Number(refId)) return;
  u.ref = Number(refId);
  r.refs = (r.refs || 0) + 1;
  save();
}

// ---------- yuklashlar ----------
export function dailyUsed(id) {
  const u = db.users[id];
  return u && u.dayKey === dayKey() ? u.dayN || 0 : 0;
}

export function recordDownload(id, { platform, kind, cached }) {
  const u = db.users[id];
  if (u) {
    u.dl = (u.dl || 0) + 1;
    const k = dayKey();
    if (u.dayKey !== k) { u.dayKey = k; u.dayN = 0; }
    u.dayN++;
  }
  bump("dl");
  if (platform) bump(platform);
  if (kind) bump(kind);
  if (cached) bump("cached");
}

// ---------- ulashish (inline) va kesh ----------
export const newShareId = () => "x" + crypto.randomBytes(4).toString("hex");

export function putShare(id, data) {
  db.shares[id] = { ...data, ts: Date.now() };
  const keys = Object.keys(db.shares);
  if (keys.length > MAX_SHARES + 500) {
    for (const k of keys.slice(0, keys.length - MAX_SHARES)) delete db.shares[k];
  }
  save();
}
export const getShare = (id) => db.shares[id] || null;
export function recentShares(uid, limit = 10) {
  const out = [];
  const keys = Object.keys(db.shares);
  for (let i = keys.length - 1; i >= 0 && out.length < limit; i--) {
    const s = db.shares[keys[i]];
    if (s.o === uid) out.push([keys[i], s]);
  }
  return out;
}

export const getCache = (key) => db.cache[key] || null;
export function setCache(key, data) {
  db.cache[key] = data;
  const keys = Object.keys(db.cache);
  if (keys.length > MAX_CACHE + 200) {
    for (const k of keys.slice(0, keys.length - MAX_CACHE)) delete db.cache[k];
  }
  save();
}

// ---------- reklama tarixi ----------
export function addBroadcast(rec) {
  db.broadcasts.push(rec);
  if (db.broadcasts.length > 30) db.broadcasts.shift();
  save();
}
export const lastBroadcast = () => db.broadcasts.at(-1) || null;

// ---------- statistika ----------
export function getStats() {
  const now = Date.now();
  const us = Object.values(db.users);
  const s = {
    total: us.length, blocked: 0, banned: 0, referred: 0,
    a24: 0, a7: 0, a30: 0, n24: 0, n7: 0, n30: 0,
    langs: { uz: 0, ru: 0, en: 0, none: 0 }, totalDl: 0,
  };
  for (const u of us) {
    if (u.blocked) s.blocked++;
    if (u.banned) s.banned++;
    if (u.ref) s.referred++;
    const last = u.last || 0;
    if (now - last < DAY) s.a24++;
    if (now - last < 7 * DAY) s.a7++;
    if (now - last < 30 * DAY) s.a30++;
    const j = u.joined || 0;
    if (now - j < DAY) s.n24++;
    if (now - j < 7 * DAY) s.n7++;
    if (now - j < 30 * DAY) s.n30++;
    s.langs[u.lang || "none"] = (s.langs[u.lang || "none"] || 0) + 1;
    s.totalDl += u.dl || 0;
  }
  const dayVal = (i, f) => db.daily[dayKey(now - i * DAY)]?.[f] || 0;
  const sum = (n, f) => { let t = 0; for (let i = 0; i < n; i++) t += dayVal(i, f); return t; };
  s.today = db.daily[dayKey()] || {};
  s.dl7 = sum(7, "dl");
  s.dl30 = sum(30, "dl");
  s.days = [];
  for (let i = 0; i < 7; i++) {
    s.days.push({ date: dayKey(now - i * DAY), new: dayVal(i, "new"), dl: dayVal(i, "dl"), err: dayVal(i, "err") });
  }
  s.top = Object.entries(db.users)
    .sort((a, b) => (b[1].dl || 0) - (a[1].dl || 0))
    .slice(0, 5)
    .filter(([, u]) => u.dl > 0)
    .map(([id, u]) => ({ id, name: u.name, username: u.username, dl: u.dl }));
  return s;
}

// ---------- backup ----------
export const exportBackup = () => JSON.stringify({ v: 2, ...db });

export function importBackup(obj) {
  if (!obj || typeof obj !== "object" || typeof obj.users !== "object") {
    throw new Error("Bu backup fayli emas");
  }
  const n = normalize(obj);
  db.users = n.users;
  db.daily = n.daily;
  db.shares = n.shares;
  db.cache = n.cache;
  db.broadcasts = n.broadcasts;
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, n.settings);
  flush();
  return Object.keys(db.users).length;
}
