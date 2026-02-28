import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const signals = await prisma.intelligenceSignal.findMany({
    orderBy: { detectedAt: 'desc' },
    take: 100,
    include: { contact: true },
  })
  return NextResponse.json(signals)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const signal = await prisma.intelligenceSignal.create({
    data: {
      contactId: body.contactId,
      signalType: body.signalType,
      title: body.title,
      description: body.description || null,
      sourceUrl: body.sourceUrl || null,
      sourceName: body.sourceName || null,
      outreachHook: body.outreachHook || null,
      relevanceScore: body.relevanceScore || 5.0,
    },
  })
  return NextResponse.json(signal, { status: 201 })
}
