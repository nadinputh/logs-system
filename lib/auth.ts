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
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!valid) return null;
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};
