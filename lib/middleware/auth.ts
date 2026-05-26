import { getServerSession } from 'next-auth'
import { authOptions } from '../auth'
import { NextResponse } from 'next/server'

export type Role = 'admin' | 'staff'

export async function requireAuth(requiredRole?: Role) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }
  const userRole = (session.user as any).role as Role
  if (requiredRole === 'admin' && userRole !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { error: null, session }
}
