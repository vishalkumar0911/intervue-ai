// Demo/local auth persistence. Not for production.

export type User = { id: string; name: string; email: string; role?: string };

type StoredUser = User & {
  passwordHash: string;
  createdAt: number;
};

const USERS_KEY   = "auth:users";     // Record<email, StoredUser>
const SESSION_KEY = "auth:session";   // current session email
const LEGACY_KEY  = "auth:user";      // old shape (migrated once)

function isBrowser() { return typeof window !== "undefined"; }
function assertBrowser() { if (!isBrowser()) throw new Error("auth.ts must run in the browser"); }

function readUsers(): Record<string, StoredUser> {
  assertBrowser();
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); }
  catch { return {}; }
}
function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function pub(u: StoredUser): User {
  const { id, name, email, role } = u;
  return { id, name, email, role };
}
function emit() { try { window.dispatchEvent(new Event("auth:changed")); } catch {} }

// --- migrate old `auth:user` value (either {user,pass} or plain user) ---
function migrateLegacyIfNeeded() {
  if (!isBrowser()) return;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    let user: { id?: string; name?: string; email?: string } | null = null;

    if (data && typeof data === "object" && "user" in data) {
      user = (data as any).user;
    } else if (data && typeof data === "object" && "email" in data) {
      user = data as any;
    }

    if (user?.email) {
      const email = user.email.toLowerCase();
      const users = readUsers();
      if (!users[email]) {
        users[email] = {
          id: user.id || crypto.randomUUID(),
          name: user.name || email.split("@")[0],
          email,
          role: undefined,
          passwordHash: "",
          createdAt: Date.now(),
        };
        writeUsers(users);
      }
      localStorage.setItem(SESSION_KEY, email);
    }
  } catch {
    // ignore
  } finally {
    localStorage.removeItem(LEGACY_KEY);
  }
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function getUser(): User | null {
  if (!isBrowser()) return null;
  migrateLegacyIfNeeded();
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return null;
  const u = readUsers()[email];
  return u ? pub(u) : null;
}

export async function signup(p: {
  name: string;
  email: string;
  password: string;
  role?: string;                 // optional
}): Promise<User> {
  assertBrowser();
  const email = p.email.trim().toLowerCase();
  if (!email.includes("@")) throw { message: "Please enter a valid email" };

  const users = readUsers();
  if (users[email]) throw { message: "Email is already registered" };

  const stored: StoredUser = {
    id: crypto.randomUUID(),
    name: p.name.trim() || email.split("@")[0],
    email,
    role: p.role?.trim() || undefined,
    passwordHash: await hash(p.password),
    createdAt: Date.now(),
  };

  users[email] = stored;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, email);
  emit();
  return pub(stored);
}

export async function login(p: {
  email: string;
  password: string;
}): Promise<User> {
  assertBrowser();
  const email = p.email.trim().toLowerCase();
  const users = readUsers();
  const u = users[email];
  if (!u) throw { message: "No account found. Please sign up first." };
  if (u.passwordHash !== (await hash(p.password))) throw { message: "Invalid email or password." };
  localStorage.setItem(SESSION_KEY, email);
  emit();
  return pub(u);
}

export function logout() {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
  emit();
}

// --- Profile updates (non-password) ---
export function updateProfile(partial: Partial<Pick<User, "name" | "role">>) {
  assertBrowser();
  const email = localStorage.getItem(SESSION_KEY);
  if (!email) return;
  const users = readUsers();
  const u = users[email];
  if (!u) return;
  users[email] = { ...u, ...partial };
  writeUsers(users);
  emit();
}
