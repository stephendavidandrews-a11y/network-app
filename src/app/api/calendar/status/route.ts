import { NextResponse } from 'next/server'
import { testCalendarConnection } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await testCalendarConnection()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      connected: false,
      email: null,
      error: String(error),
    })
  }
}
