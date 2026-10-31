import fs from "node:fs";
import path from "node:path";

const dir = process.env.DATA_DIR || "./data";
const file = path.join(dir, "users.json");

let users = {};
try {
  users = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  users = {};
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(users));
    } catch (e) {
      console.error("store save error:", e.message);
    }
  }, 500);
}

export const getLang = (id) => users[id]?.lang || null;

export function setLang(id, lang) {
  users[id] = { ...(users[id] || {}), lang };
  save();
}

export const countUsers = () => Object.keys(users).length;
