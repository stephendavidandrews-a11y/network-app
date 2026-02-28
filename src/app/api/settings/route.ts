import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const settings = await prisma.appSetting.findMany()
  return NextResponse.json(settings)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const setting = await prisma.appSetting.upsert({
    where: { key: body.key },
    update: {
      value: body.value,
      updatedAt: new Date().toISOString(),
    },
    create: {
      key: body.key,
      value: body.value,
    },
  })
  return NextResponse.json(setting)
}
