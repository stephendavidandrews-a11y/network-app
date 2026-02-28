import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null

        const validUsername = process.env.AUTH_USERNAME
        const passwordHash = process.env.AUTH_PASSWORD_HASH

        if (!validUsername || !passwordHash) return null

        if (credentials.username !== validUsername) return null

        const isValid = await bcrypt.compare(credentials.password, passwordHash)
        if (!isValid) return null

        return {
          id: '1',
          name: 'Stephen Andrews',
          email: 'stephen@stephenandrews.org',
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.AUTH_SECRET,
}
