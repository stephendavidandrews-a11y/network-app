import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/settings/role-transition — current role transition config
export async function GET() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'role_transition' },
  })

  if (!setting) {
    return NextResponse.json({ error: 'Role transition config not found' }, { status: 404 })
  }

  try {
    const config = JSON.parse(setting.value)
    return NextResponse.json(config)
  } catch {
    return NextResponse.json({ error: 'Invalid role transition config' }, { status: 500 })
  }
}

// POST /api/settings/role-transition — trigger role transition
// Expires all Hawley pretexts, activates CFTC pretexts, updates config
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { confirm } = body as { confirm?: boolean }

  if (!confirm) {
    return NextResponse.json({
      error: 'Must include { confirm: true } to trigger role transition',
      warning: 'This will expire all Hawley pretexts and activate CFTC pretexts. This action is significant.',
    }, { status: 400 })
  }

  // 1. Load current config
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'role_transition' },
  })

  if (!setting) {
    return NextResponse.json({ error: 'Role transition config not found' }, { status: 404 })
  }

  const config = JSON.parse(setting.value)

  // 2. Expire all Hawley pretexts
  const expiredResult = await prisma.$executeRawUnsafe(
    `UPDATE contact_pretexts
     SET valid_until = datetime('now')
     WHERE pretext_type = 'role_based'
       AND hook LIKE '%Hawley%'
       AND (valid_until IS NULL OR valid_until > datetime('now'))`
  )

  // 3. Activate CFTC pretexts (set valid_from to now if it was in the future)
  const activatedResult = await prisma.$executeRawUnsafe(
    `UPDATE contact_pretexts
     SET valid_from = datetime('now')
     WHERE pretext_type = 'role_based'
       AND hook LIKE '%CFTC%'
       AND valid_from > datetime('now')`
  )

  // 4. Update config
  const newConfig = {
    ...config,
    current_role: config.next_role || 'cftc_deputy_gc',
    current_role_label: config.next_role_label || 'Deputy General Counsel, CFTC',
    previous_role: config.current_role,
    previous_role_label: config.current_role_label,
    transition_completed: new Date().toISOString(),
    transition_announced: true,
  }

  await prisma.appSetting.update({
    where: { key: 'role_transition' },
    data: { value: JSON.stringify(newConfig) },
  })

  // 5. Count affected contacts
  const waitCftcActivated = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM contacts WHERE outreach_timing = 'wait_cftc'`
  )

  const nowHawleyExpired = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(
    `SELECT COUNT(*) as cnt FROM contacts WHERE outreach_timing = 'now_hawley'`
  )

  return NextResponse.json({
    success: true,
    message: 'Role transition completed.',
    details: {
      hawleyPretextsExpired: expiredResult,
      cftcPretextsActivated: activatedResult,
      waitCftcContactsNowActive: waitCftcActivated[0]?.cnt || 0,
      nowHawleyContactsExpired: nowHawleyExpired[0]?.cnt || 0,
      newConfig,
    },
  })
}
