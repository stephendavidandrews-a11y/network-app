import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, memberIds, groupName } = body

    if (action === 'accept') {
      if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return NextResponse.json({ error: 'memberIds required' }, { status: 400 })
      }

      // Create PersonalGroup + members
      const group = await prisma.personalGroup.create({
        data: {
          name: groupName || 'New Group',
          members: {
            create: memberIds.map((contactId: string) => ({
              contactId,
            })),
          },
        },
        include: { members: true },
      })

      return NextResponse.json(group, { status: 201 })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Group Suggestions] POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
