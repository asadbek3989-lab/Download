import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || "./data";
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, "bot.db");

export const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, lang TEXT,
  joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  banned INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS downloads(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, platform TEXT, kind TEXT, quality TEXT,
  title TEXT, url TEXT, size INTEGER DEFAULT 0,
  ok INTEGER NOT NULL, error TEXT, cached INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dl_ts ON downloads(ts);
CREATE INDEX IF NOT EXISTS idx_dl_user ON downloads(user_id, ts);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS shares(
  id TEXT PRIMARY KEY, user_id INTEGER, kind TEXT, file_id TEXT,
  title TEXT, caption TEXT, ts INTEGER, uses INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id, ts);
CREATE TABLE IF NOT EXISTS cache(
  key TEXT NOT NULL, q TEXT NOT NULL, kind TEXT, file_id TEXT, ts INTEGER,
  PRIMARY KEY(key, q)
);
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS broadcasts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, ts INTEGER,
  audience TEXT, total INTEGER, sent INTEGER, failed INTEGER, blocked INTEGER
);
`);

const stmts = new Map();
const st = (sql) => {
  let s = stmts.get(sql);
  if (!s) stmts.set(sql, (s = db.prepare(sql)));
  return s;
};
const get = (sql, ...p) => st(sql).get(...p);
const all = (sql, ...p) => st(sql).all(...p);
const run = (sql, ...p) => st(sql).run(...p);
const num = (sql, ...p) => Number(Object.values(get(sql, ...p) || { n: 0 })[0] || 0);

export const now = () => Math.floor(Date.now() / 1000);
const TZ = Number(process.env.TZ_OFFSET_HOURS ?? 5) * 3600; // standart: Toshkent (UTC+5)

/** Bugun boshlanishi (mahalliy vaqt bo'yicha), unix sekundda. */
export function dayStart(daysAgo = 0) {
  const local = now() + TZ;
  return Math.floor(local / 86400) * 86400 - TZ - daysAgo * 86400;
}
export const fmtDate = (ts) =>
  ts ? new Date((ts + TZ) * 1000).toISOString().replace("T", " ").slice(0, 16) : "—";

// ---------- sozlamalar ----------
export const getSetting = (key, def = null) => get("SELECT value FROM settings WHERE key=?", key)?.value ?? def;
export const setSetting = (key, value) =>
  run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, String(value));
export const delSetting = (key) => run("DELETE FROM settings WHERE key=?", key);

// ---------- foydalanuvchilar ----------
export function upsertUser(from) {
  const t = now();
  run(
    `INSERT INTO users(id,username,first_name,joined_at,last_seen) VALUES(?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name,
       last_seen=excluded.last_seen, blocked=0`,
    from.id, from.username || null, from.first_name || null, t, t
  );
  return getUser(from.id);
}
export const getUser = (id) => get("SELECT * FROM users WHERE id=?", id);
export const findUser = (q) => {
  const s = String(q).trim().replace(/^@/, "");
  return /^\d+$/.test(s) ? getUser(Number(s)) : get("SELECT * FROM users WHERE lower(username)=lower(?)", s);
};
export const getLang = (id) => getUser(id)?.lang || null;
export const setLang = (id, lang) => run("UPDATE users SET lang=? WHERE id=?", lang, id);
export const setBanned = (id, v) => run("UPDATE users SET banned=? WHERE id=?", v ? 1 : 0, id);
export const setBlocked = (id, v) => run("UPDATE users SET blocked=? WHERE id=?", v ? 1 : 0, id);
export const topUsers = (n = 10) =>
  all("SELECT * FROM users WHERE downloads>0 ORDER BY downloads DESC LIMIT ?", n);
export const allUsers = () => all("SELECT * FROM users ORDER BY joined_at");

export function audience(lang = null) {
  return lang
    ? all("SELECT id FROM users WHERE banned=0 AND blocked=0 AND lang=?", lang).map((r) => r.id)
    : all("SELECT id FROM users WHERE banned=0 AND blocked=0").map((r) => r.id);
}
export const audienceCount = (lang = null) =>
  lang
    ? num("SELECT count(*) n FROM users WHERE banned=0 AND blocked=0 AND lang=?", lang)
    : num("SELECT count(*) n FROM users WHERE banned=0 AND blocked=0");

// ---------- adminlar ----------
const SUPER = new Set(
  String(process.env.ADMIN_ID || "").split(/[,\s]+/).filter(Boolean).map(Number).filter(Boolean)
);
export const superAdmins = () => [...SUPER];
export const isSuper = (id) => SUPER.has(Number(id));
export const isAdmin = (id) => SUPER.has(Number(id)) || !!get("SELECT 1 x FROM admins WHERE id=?", Number(id));
export const extraAdmins = () => all("SELECT id FROM admins").map((r) => r.id);
export const addAdmin = (id) => run("INSERT OR IGNORE INTO admins(id) VALUES(?)", id);
export const delAdmin = (id) => run("DELETE FROM admins WHERE id=?", id);
export const allAdminIds = () => [...new Set([...SUPER, ...extraAdmins()])];

// ---------- yuklashlar ----------
export function logDownload(d) {
  run(
    `INSERT INTO downloads(user_id,platform,kind,quality,title,url,size,ok,error,cached,ts)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    d.userId, d.platform || null, d.kind || null, d.quality || null, (d.title || "").slice(0, 200),
    d.url || null, d.size || 0, d.ok ? 1 : 0, d.error ? String(d.error).slice(0, 400) : null,
    d.cached ? 1 : 0, now()
  );
  if (d.ok) run("UPDATE users SET downloads=downloads+1 WHERE id=?", d.userId);
}
export const downloadsToday = (userId) =>
  num("SELECT count(*) n FROM downloads WHERE user_id=? AND ok=1 AND ts>=?", userId, dayStart());
export const recentFailures = (n = 10) =>
  all("SELECT * FROM downloads WHERE ok=0 ORDER BY id DESC LIMIT ?", n);
export const allDownloads = (n = 5000) => all("SELECT * FROM downloads ORDER BY id DESC LIMIT ?", n);

// ---------- kesh va ulashish ----------
export const getCache = (key, q) => get("SELECT * FROM cache WHERE key=? AND q=?", key, q);
export const setCache = (key, q, kind, fileId) =>
  run(
    "INSERT INTO cache(key,q,kind,file_id,ts) VALUES(?,?,?,?,?) ON CONFLICT(key,q) DO UPDATE SET kind=excluded.kind,file_id=excluded.file_id,ts=excluded.ts",
    key, q, kind, fileId, now()
  );
export const delCache = (key, q) => run("DELETE FROM cache WHERE key=? AND q=?", key, q);

export const addShare = (s) =>
  run("INSERT INTO shares(id,user_id,kind,file_id,title,caption,ts) VALUES(?,?,?,?,?,?,?)",
    s.id, s.userId, s.kind, s.fileId, (s.title || "").slice(0, 200), s.caption, now());
export const getShare = (id) => get("SELECT * FROM shares WHERE id=?", id);
export const recentShares = (userId, n = 10) =>
  all("SELECT * FROM shares WHERE user_id=? ORDER BY ts DESC LIMIT ?", userId, n);
export const bumpShare = (id) => run("UPDATE shares SET uses=uses+1 WHERE id=?", id);

// ---------- reklama tarixi ----------
export const logBroadcast = (b) =>
  run("INSERT INTO broadcasts(admin_id,ts,audience,total,sent,failed,blocked) VALUES(?,?,?,?,?,?,?)",
    b.adminId, now(), b.audience, b.total, b.sent, b.failed, b.blocked);

// ---------- statistika ----------
export function getStats() {
  const t = now();
  const d0 = dayStart(), d7 = dayStart(6), d30 = dayStart(29);
  const langs = Object.fromEntries(
    all("SELECT COALESCE(lang,'-') l, count(*) n FROM users GROUP BY l").map((r) => [r.l, r.n])
  );
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const a = dayStart(i), b = a + 86400;
    days.push({
      date: fmtDate(a).slice(5, 10),
      users: num("SELECT count(*) n FROM users WHERE joined_at>=? AND joined_at<?", a, b),
      dl: num("SELECT count(*) n FROM downloads WHERE ok=1 AND ts>=? AND ts<?", a, b),
    });
  }
  return {
    users: {
      total: num("SELECT count(*) n FROM users"),
      active: num("SELECT count(*) n FROM users WHERE blocked=0 AND banned=0"),
      blocked: num("SELECT count(*) n FROM users WHERE blocked=1"),
      banned: num("SELECT count(*) n FROM users WHERE banned=1"),
      new0: num("SELECT count(*) n FROM users WHERE joined_at>=?", d0),
      new7: num("SELECT count(*) n FROM users WHERE joined_at>=?", d7),
      new30: num("SELECT count(*) n FROM users WHERE joined_at>=?", d30),
      seen24: num("SELECT count(*) n FROM users WHERE last_seen>=?", t - 86400),
      seen7: num("SELECT count(*) n FROM users WHERE last_seen>=?", t - 7 * 86400),
      langs,
    },
    dl: {
      total: num("SELECT count(*) n FROM downloads WHERE ok=1"),
      today: num("SELECT count(*) n FROM downloads WHERE ok=1 AND ts>=?", d0),
      d7: num("SELECT count(*) n FROM downloads WHERE ok=1 AND ts>=?", d7),
      d30: num("SELECT count(*) n FROM downloads WHERE ok=1 AND ts>=?", d30),
      failed: num("SELECT count(*) n FROM downloads WHERE ok=0"),
      failedToday: num("SELECT count(*) n FROM downloads WHERE ok=0 AND ts>=?", d0),
      cached: num("SELECT count(*) n FROM downloads WHERE ok=1 AND cached=1"),
      video: num("SELECT count(*) n FROM downloads WHERE ok=1 AND kind='video'"),
      mp3: num("SELECT count(*) n FROM downloads WHERE ok=1 AND kind='mp3'"),
      yt: num("SELECT count(*) n FROM downloads WHERE ok=1 AND platform='youtube'"),
      ig: num("SELECT count(*) n FROM downloads WHERE ok=1 AND platform='instagram'"),
      bytes: num("SELECT COALESCE(sum(size),0) n FROM downloads WHERE ok=1"),
    },
    shares: {
      total: num("SELECT count(*) n FROM shares"),
      uses: num("SELECT COALESCE(sum(uses),0) n FROM shares"),
    },
    days,
  };
}

export function backupTo(file) {
  try { fs.rmSync(file, { force: true }); } catch {}
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
}
