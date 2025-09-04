import NextAuth, { type NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";

/** Upsert user in FastAPI and get back your app JWT (used by the proxy). */
async function getAppJwtFromFastAPI(email: string, name?: string, sub?: string) {
  const url = `${process.env.FASTAPI_URL}/auth/oauth/google`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.FASTAPI_API_KEY || "",
    },
    body: JSON.stringify({ email, name, google_sub: sub }),
  });

  if (!res.ok) {
    // Add context to the error so debugging is easy in dev
    const text = await res.text().catch(() => "");
    throw new Error(`FastAPI oauth/google failed (${res.status}) ${text}`);
  }
  return res.json() as Promise<{ id: string; appJwt: string }>;
}

export const authOptions: NextAuthOptions = {
  debug: true,                       // log detailed info in dev
  pages: { signIn: "/login" },       // use your custom login page
  session: { strategy: "jwt" },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // In dev, allow linking a Google account to an existing email/password user.
      // Remove this in prod and implement a stricter signIn callback instead.
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { prompt: "consent select_account" } }, // force chooser & consent each time
    }),
  ],

  callbacks: {
    /** Attach your app JWT (from FastAPI) onto the NextAuth token after Google login. */
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        try {
          const data = await getAppJwtFromFastAPI(
            profile.email as string,
            (profile as any).name,
            (profile as any).sub
          );
          (token as any).appJwt = data.appJwt;
          (token as any).uid = data.id;
        } catch (err) {
          // Don’t block Google login if FastAPI is down; your proxy will just omit Authorization.
          console.error("[oauth/google] upsert failed:", err);
        }
      }
      return token;
    },

    /** Expose uid/appJwt on the session so server code (proxy) can read it. */
    async session({ session, token }) {
      (session as any).uid = (token as any).uid;
      (session as any).appJwt = (token as any).appJwt;
      return session;
    },
  },

  // Optional extra logging hooks
  logger: {
    error(code, ...msg) { console.error("NextAuth error:", code, ...msg); },
    warn(code, ...msg)  { console.warn("NextAuth warn:", code, ...msg); },
    debug(code, ...msg) { console.debug("NextAuth debug:", code, ...msg); },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
