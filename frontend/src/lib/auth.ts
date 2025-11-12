/* frontend/src/lib/auth.ts
   Full file — only real logic change: signup() now attempts to persist the new user
   to the backend via /api/auth/local_signup (server-side proxy attaches x-api-key).
   Non-fatal if backend call fails (keeps local-demo UX).
*/

export type User = { id: string; name: string; email: string; role?: string };

type StoredUser = User & {
  passwordHash: string;
  createdAt: number;
  salt?: string;
  algo?: "s256" | "sha256-legacy";
};

const USERS_KEY = "auth:users";
const SESSION_KEY = "auth:session";
const LEGACY_KEY = "auth:user";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
function assertBrowser() {
  if (!isBrowser()) throw new Error("auth.ts must run in the browser");
}

function normalizeEmail(e: string) {
  return (e || "").trim().toLowerCase();
}
function safeParse(val: string | null, fallback: any) {
  try {
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}
function emit() {
  try { window.dispatchEvent(new Event("auth:changed")); } catch {}
}
function err(message: string, code?: string) {
  const e: any = new Error(message);
  if (code) e.code = code;
  return e;
}

function setDemoCookie(email: string | null) {
  if (!isBrowser()) return;
  try {
    if (email) {
      document.cookie =
        `demoEmail=${encodeURIComponent(email)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    } else {
      document.cookie = "demoEmail=; Path=/; Max-Age=0; SameSite=Lax";
    }
  } catch {}
}

export function isValidEmail(input: string) {
  const email = normalizeEmail(input);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email);
}
export function isStrongPassword(pw: string) {
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[^A-Za-z]/.test(pw);
}

function readUsers(): Record<string, StoredUser> {
  assertBrowser();
  return safeParse(localStorage.getItem(USERS_KEY), {});
}
function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function pub(u: StoredUser): User {
  const { id, name, email, role } = u;
  return { id, name, email, role };
}

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
      const email = normalizeEmail(user.email);
      const users = readUsers();
      if (!users[email]) {
        users[email] = {
          id: user.id || crypto.randomUUID(),
          name: user.name || email.split("@")[0],
          email,
          role: undefined,
          passwordHash: "",
          createdAt: Date.now(),
          algo: "sha256-legacy",
        };
        writeUsers(users);
      }
      localStorage.setItem(SESSION_KEY, email);
      setDemoCookie(email);
    }
  } catch {
  } finally {
    localStorage.removeItem(LEGACY_KEY);
  }
}

async function hashRaw(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function genSalt(len = 16): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashSalted(password: string, salt: string): Promise<string> {
  return hashRaw(`${salt}:${password}`);
}

async function passwordMatchesAndMaybeMigrate(u: StoredUser, enteredPw: string, usersAll: Record<string, StoredUser>): Promise<boolean> {
  if (u.salt) {
    const expected = await hashSalted(enteredPw, u.salt);
    return expected === u.passwordHash;
  } else {
    const legacy = await hashRaw(enteredPw);
    const ok = legacy === u.passwordHash;
    if (ok) {
      const salt = genSalt();
      u.passwordHash = await hashSalted(enteredPw, salt);
      u.salt = salt;
      u.algo = "s256";
      writeUsers(usersAll);
    }
    return ok;
  }
}

function getSessionEmailRaw(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(SESSION_KEY);
}
export function isSignedIn() {
  return !!getSessionEmailRaw();
}
export function getUser(): User | null {
  if (!isBrowser()) return null;
  migrateLegacyIfNeeded();
  const email = getSessionEmailRaw();
  if (!email) return null;
  const u = readUsers()[email];
  return u ? pub(u) : null;
}

/**
 * signup
 * - persist locally (existing behavior)
 * - then attempt to persist to backend via /api/auth/local_signup (server proxy attaches service x-api-key)
 *   - backend persistence is non-fatal; failure keeps local store working
 */
export async function signup(p: {
  name: string;
  email: string;
  password: string;
  role?: string;
}): Promise<User> {
  assertBrowser();
  const email = normalizeEmail(p.email);
  if (!isValidEmail(email)) throw err("Please enter a valid email", "INVALID_EMAIL");

  const users = readUsers();
  if (users[email]) throw err("Email is already registered", "USER_EXISTS");

  const salt = genSalt();
  const stored: StoredUser = {
    id: crypto.randomUUID(),
    name: (p.name || "").trim() || email.split("@")[0],
    email,
    role: p.role?.trim() || undefined,
    passwordHash: await hashSalted(p.password, salt),
    createdAt: Date.now(),
    salt,
    algo: "s256",
  };

  // persist locally
  users[email] = stored;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, email);
  setDemoCookie(email);
  emit();

  // --- NEW: try to persist to backend via server-side proxy ---
  try {
    // fire-and-forget but await to surface errors when developer inspects console
    const res = await fetch("/api/auth/local_signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: stored.name,
        email: stored.email,
        password: p.password, // backend doesn't persist password long-term in this demo, but expects it
        role: stored.role ?? null,
      }),
    });

    if (res.ok) {
      // backend returned JSON like { id, appJwt, role? }
      // if backend returns role, keep local role in sync (optional)
      const data = await res.json().catch(() => ({}));
      if (data?.role !== undefined) {
        users[stored.email] = { ...users[stored.email], role: data.role ?? undefined };
        writeUsers(users);
        emit();
      }
    } else {
      // non-fatal: log for developer visibility
      const txt = await res.text().catch(() => "");
      console.warn("backend signup persisted failed:", res.status, txt);
    }
  } catch (e) {
    console.warn("backend signup persist call failed:", e);
  }

  return pub(stored);
}

export async function login(p: { email: string; password: string }): Promise<User> {
  assertBrowser();
  const email = normalizeEmail(p.email);
  const users = readUsers();
  const u = users[email];
  if (!u) throw err("No account found. Please sign up first.", "NO_ACCOUNT");

  const ok = await passwordMatchesAndMaybeMigrate(u, p.password, users);
  if (!ok) throw err("Invalid email or password.", "BAD_CREDENTIALS");

  localStorage.setItem(SESSION_KEY, email);
  setDemoCookie(email);
  emit();
  return pub(u);
}

export function logout() {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
  setDemoCookie(null);
  emit();
}

export function updateProfile(partial: Partial<Pick<User, "name" | "role">>) {
  assertBrowser();
  const email = getSessionEmailRaw();
  if (!email) return;
  const users = readUsers();
  const u = users[email];
  if (!u) return;
  users[email] = { ...u, ...partial };
  writeUsers(users);
  emit();
}

/**
 * Updates a specific user's role in the local demo store.
 */
export function updateRoleLocal(emailRaw: string, newRole: string | undefined | null) {
  assertBrowser();
  const email = normalizeEmail(emailRaw);
  const users = readUsers();
  const u = users[email];
  if (!u) return;

  const roleToSet = (newRole === null || newRole === undefined) ? undefined : (newRole as string).trim() || undefined;

  users[email] = { ...u, role: roleToSet };
  writeUsers(users);

  if (getSessionEmailRaw() === email) {
    emit();
  }
}

export async function updatePasswordLocal(emailRaw: string, newPassword: string) {
  assertBrowser();
  const email = normalizeEmail(emailRaw);
  const users = readUsers();
  const existing = users[email];
  const salt = genSalt();

  if (!existing) {
    users[email] = {
      id: crypto.randomUUID(),
      name: email.split("@")[0],
      email,
      role: undefined,
      passwordHash: await hashSalted(newPassword, salt),
      createdAt: Date.now(),
      salt,
      algo: "s256",
    };
  } else {
    const s = existing.salt || salt;
    users[email] = {
      ...existing,
      salt: s,
      algo: "s256",
      passwordHash: await hashSalted(newPassword, s),
    };
  }

  writeUsers(users);

  if (getSessionEmailRaw() === email) {
    setDemoCookie(email);
    emit();
  }
}

export async function changePassword(currentPassword: string, newPassword: string) {
  assertBrowser();
  const email = getSessionEmailRaw();
  if (!email) throw err("Not signed in.", "NOT_SIGNED_IN");

  const users = readUsers();
  const u = users[email];
  if (!u) throw err("No account found.", "NO_ACCOUNT");

  const ok = await passwordMatchesAndMaybeMigrate(u, currentPassword, users);
  if (!ok) throw err("Current password is incorrect.", "BAD_CREDENTIALS");

  const salt = u.salt || genSalt();
  u.salt = salt;
  u.algo = "s256";
  u.passwordHash = await hashSalted(newPassword, salt);
  writeUsers(users);
  setDemoCookie(email);
  emit();
}

export function __getStoredUser(emailRaw: string): StoredUser | undefined {
  const email = normalizeEmail(emailRaw);
  return readUsers()[email];
}

export function __deleteUser(emailRaw: string) {
  assertBrowser();
  const email = normalizeEmail(emailRaw);
  const users = readUsers();
  if (users[email]) {
    delete users[email];
    writeUsers(users);
    if (getSessionEmailRaw() === email) logout();
    emit();
  }
}

export const resetPasswordByEmail = updatePasswordLocal;
