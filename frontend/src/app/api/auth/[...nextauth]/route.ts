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
    const text = await res.text().catch(() => "");
    throw new Error(`FastAPI oauth/google failed (${res.status}) ${text}`);
  }
  // ⬇️ allow backend to return role if it has one
  return res.json() as Promise<{ id: string; appJwt: string; role?: string | null }>;
}

export const authOptions: NextAuthOptions = {
  debug: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: { params: { prompt: "consent select_account" } },
    }),
  ],

  callbacks: {
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
          if (data.role) (token as any).role = data.role; // ⬅️ carry role if backend has it
        } catch (err) {
          console.error("[oauth/google] upsert failed:", err);
        }
      }
      return token;
    },

    async session({ session, token }) {
      (session as any).uid = (token as any).uid;
      (session as any).appJwt = (token as any).appJwt;
      // expose role on session + session.user for convenience
      const role = (token as any).role;
      if (role) {
        (session as any).role = role;
        if (session.user) (session.user as any).role = role;
      }
      return session;
    },
  },

  logger: {
    error(code, ...msg) { console.error("NextAuth error:", code, ...msg); },
    warn(code, ...msg)  { console.warn("NextAuth warn:", code, ...msg); },
    debug(code, ...msg) { console.debug("NextAuth debug:", code, ...msg); },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
