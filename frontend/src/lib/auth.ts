// src/lib/auth.ts
// Demo/local auth persistence (browser-only). NOT for production.
// - Stores users in localStorage (keyed by email).
// - signup/login/logout/updateProfile
// - Password flows: updatePasswordLocal (aka resetPasswordByEmail), changePassword
// - Salted SHA-256 (demo) with backward-compat migration from legacy unsalted
// - Safer JSON parsing, email normalization, small DX helpers.

export type User = { id: string; name: string; email: string; role?: string };

type StoredUser = User & {
  passwordHash: string;   // hash of the password
  createdAt: number;      // epoch ms
  // NEW (optional for legacy compatibility)
  salt?: string;          // presence ⇒ salted hash is in use
  algo?: "s256" | "sha256-legacy"; // tag the algo to aid future migrations
};

const USERS_KEY   = "auth:users";     // Record<email, StoredUser>
const SESSION_KEY = "auth:session";   // current session email
const LEGACY_KEY  = "auth:user";      // legacy shape (migrated once)

// ---------------------------------- utils ----------------------------------

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
function assertBrowser() {
  if (!isBrowser()) throw new Error("auth.ts must run in the browser");
}

/** normalize emails consistently (trim + lowercase) */
function normalizeEmail(e: string) {
  return (e || "").trim().toLowerCase();
}

/** safe JSON parse */
function safeParse<T>(val: string | null, fallback: T): T {
  try {
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** broadcast small event; cross-tab sync is handled by window "storage" */
function emit() {
  try { window.dispatchEvent(new Event("auth:changed")); } catch {}
}

/** tiny error helper that preserves .message and adds a code */
function err(message: string, code?: string) {
  const e: any = new Error(message);
  if (code) e.code = code;
  return e;
}

/** set/clear dev cookie consumed by trainer API proxy (→ x-demo-email) */
function setDemoCookie(email: string | null) {
  if (!isBrowser()) return;
  try {
    if (email) {
      // 30d, Lax so same-origin fetches include it; Path=/ to be global
      document.cookie =
        `demoEmail=${encodeURIComponent(email)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    } else {
      document.cookie = "demoEmail=; Path=/; Max-Age=0; SameSite=Lax";
    }
  } catch {
    // ignore cookie write errors in very strict browsers
  }
}

// -------------------------------- validators --------------------------------

export function isValidEmail(input: string) {
  const email = normalizeEmail(input);
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email);
}

export function isStrongPassword(pw: string) {
  // Practical (demo): at least 8 chars, letters + numbers/symbols
  return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[^A-Za-z]/.test(pw);
}

// ------------------------------- storage i/o --------------------------------

function readUsers(): Record<string, StoredUser> {
  assertBrowser();
  return safeParse<Record<string, StoredUser>>(localStorage.getItem(USERS_KEY), {});
}
function writeUsers(users: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** public projection */
function pub(u: StoredUser): User {
  const { id, name, email, role } = u;
  return { id, name, email, role };
}

// ----------------------------- legacy migration -----------------------------

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
      setDemoCookie(email); // keep dev cookie in sync when migrating
    }
  } catch {
    // ignore parse errors
  } finally {
    localStorage.removeItem(LEGACY_KEY);
  }
}

// ---------------------------------- crypto ----------------------------------

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
  // simple salted demo hash; NOT production-grade KDF
  return hashRaw(`${salt}:${password}`);
}

/** compare entered password with stored user (supports legacy + migrates) */
async function passwordMatchesAndMaybeMigrate(u: StoredUser, enteredPw: string, usersAll: Record<string, StoredUser>): Promise<boolean> {
  if (u.salt) {
    // salted path
    const expected = await hashSalted(enteredPw, u.salt);
    return expected === u.passwordHash;
  } else {
    // legacy unsalted path
    const legacy = await hashRaw(enteredPw);
    const ok = legacy === u.passwordHash;
    if (ok) {
      // migrate to salted transparently
      const salt = genSalt();
      u.passwordHash = await hashSalted(enteredPw, salt);
      u.salt = salt;
      u.algo = "s256";
      writeUsers(usersAll);
    }
    return ok;
  }
}

// --------------------------------- session ----------------------------------

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

// ---------------------------------- signup ----------------------------------

export async function signup(p: {
  name: string;
  email: string;
  password: string;
  role?: string; // optional
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

  users[email] = stored;
  writeUsers(users);
  localStorage.setItem(SESSION_KEY, email);
  setDemoCookie(email); // 🔑 enable dev-proxy access to trainer endpoints
  emit();
  return pub(stored);
}

// ----------------------------------- login ----------------------------------

export async function login(p: { email: string; password: string }): Promise<User> {
  assertBrowser();
  const email = normalizeEmail(p.email);
  const users = readUsers();
  const u = users[email];
  if (!u) throw err("No account found. Please sign up first.", "NO_ACCOUNT");

  const ok = await passwordMatchesAndMaybeMigrate(u, p.password, users);
  if (!ok) throw err("Invalid email or password.", "BAD_CREDENTIALS");

  localStorage.setItem(SESSION_KEY, email);
  setDemoCookie(email); // 🔑 enable dev-proxy access to trainer endpoints
  emit();
  return pub(u);
}

// ---------------------------------- logout ----------------------------------

export function logout() {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
  setDemoCookie(null); // 🔑 revoke dev access for trainer endpoints
  emit();
}

// ------------------------------ profile edits -------------------------------

export function updateProfile(partial: Partial<Pick<User, "name" | "role">>) {
  assertBrowser();
  const email = getSessionEmailRaw();
  if (!email) return;
  const users = readUsers();
  const u = users[email];
  if (!u) return;
  users[email] = { ...u, ...partial };
  writeUsers(users);
  // no cookie change needed (email is identity for dev access)
  emit();
}

// ------------------------------ password flows ------------------------------

/**
 * For the reset-password flow.
 * Called after your backend verifies the token and returns the email.
 * Creates a shell user if missing (so reset works even if the account
 * was created via Google first and later wants a local password).
 */
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
    // migrate to salted if needed
    const s = existing.salt || salt;
    users[email] = {
      ...existing,
      salt: s,
      algo: "s256",
      passwordHash: await hashSalted(newPassword, s),
    };
  }

  writeUsers(users);

  // keep the user logged in if they are the current session
  if (getSessionEmailRaw() === email) {
    setDemoCookie(email); // ensure cookie still present after reset
    emit();
  }
}

/**
 * For a signed-in user changing password from Settings.
 * Verifies current password before writing the new one.
 */
export async function changePassword(currentPassword: string, newPassword: string) {
  assertBrowser();
  const email = getSessionEmailRaw();
  if (!email) throw err("Not signed in.", "NOT_SIGNED_IN");

  const users = readUsers();
  const u = users[email];
  if (!u) throw err("No account found.", "NO_ACCOUNT");

  // Verify current password
  const ok = await passwordMatchesAndMaybeMigrate(u, currentPassword, users);
  if (!ok) throw err("Current password is incorrect.", "BAD_CREDENTIALS");

  // Set new salted password
  const salt = u.salt || genSalt();
  u.salt = salt;
  u.algo = "s256";
  u.passwordHash = await hashSalted(newPassword, salt);
  writeUsers(users);
  setDemoCookie(email); // keep cookie alive after change
  emit();
}

// ---------------------------- (optional) helpers ----------------------------

/** get raw stored user (dev/debug) */
export function __getStoredUser(emailRaw: string): StoredUser | undefined {
  const email = normalizeEmail(emailRaw);
  return readUsers()[email];
}

/** remove a user entirely (dev/debug) */
export function __deleteUser(emailRaw: string) {
  assertBrowser();
  const email = normalizeEmail(emailRaw);
  const users = readUsers();
  if (users[email]) {
    delete users[email];
    writeUsers(users);
    if (getSessionEmailRaw() === email) logout(); // clears cookie too
    emit();
  }
}

/** alias to keep earlier examples working */
export const resetPasswordByEmail = updatePasswordLocal;
