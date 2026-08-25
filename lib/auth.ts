import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { User } from "./models/User";
import { PreAuthToken } from "./models/PreAuthToken";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await connectDB();
        const user = await User.findOne({
          email: credentials.email.toLowerCase(),
        });
        if (!user || !user.passwordHash) return null;
        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!valid) return null;
        // Block sign-in until the email has been verified (set-password / verify link).
        if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
        };
      },
    }),
    // Passkey bridge: exchanges a one-time pre-auth token (issued after FIDO2 verification) for a NextAuth session
    CredentialsProvider({
      id: "passkey-token",
      name: "Passkey",
      credentials: {
        preAuthToken: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.preAuthToken) return null;
        await connectDB();
        const tokenDoc = await PreAuthToken.findOneAndDelete({
          token: credentials.preAuthToken,
          expiresAt: { $gt: new Date() },
        });
        if (!tokenDoc) return null;
        const user = await User.findById(tokenDoc.userId);
        if (!user) return null;
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.activeTeamId = (user as any).activeTeamId ?? null;
      }

      if (trigger === "update") {
        token.activeTeamId =
          (session as any)?.activeTeamId ?? token.activeTeamId ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).activeTeamId =
          (token as any).activeTeamId ?? null;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
