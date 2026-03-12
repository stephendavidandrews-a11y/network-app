import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

function normalizeOrgName(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")
  const id = searchParams.get("id")

  if (id) {
    const org = await prisma.organization.findUnique({
      where: { id },
      include: { aliases: true, affiliations: { include: { contact: { select: { id: true, name: true } } } }, signals: { take: 20, orderBy: { createdAt: "desc" } } },
    })
    return NextResponse.json(org)
  }

  const orgs = await prisma.organization.findMany({
    where: q ? { OR: [{ normalizedName: { contains: normalizeOrgName(q) } }, { name: { contains: q } }] } : {},
    include: { aliases: true, _count: { select: { affiliations: true, signals: true } } },
    orderBy: { name: "asc" },
    take: 50,
  })
  return NextResponse.json(orgs)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const normalizedName = normalizeOrgName(body.name)

    const existing = await prisma.organization.findUnique({
      where: { normalizedName },
      include: { aliases: true },
    })

    if (existing) {
      const updated = await prisma.organization.update({
        where: { id: existing.id },
        data: {
          legalName: body.legalName ?? existing.legalName,
          orgType: body.orgType ?? existing.orgType,
          website: body.website ?? existing.website,
          domain: body.domain ?? existing.domain,
          description: body.description ?? existing.description,
          hqCity: body.hqCity ?? existing.hqCity,
          hqStateRegion: body.hqStateRegion ?? existing.hqStateRegion,
          hqCountry: body.hqCountry ?? existing.hqCountry,
          updatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
        },
        include: { aliases: true },
      })

      if (body.alias) {
        const aliasExists = existing.aliases.some((a: { alias: string }) => a.alias.toLowerCase() === body.alias.toLowerCase())
        if (!aliasExists) {
          await prisma.organizationAlias.create({
            data: { organizationId: existing.id, alias: body.alias, aliasType: body.aliasType || null },
          })
        }
      }

      return NextResponse.json(updated, { status: 200 })
    }

    const org = await prisma.organization.create({
      data: {
        name: body.name.trim(),
        normalizedName,
        legalName: body.legalName || null,
        orgType: body.orgType || null,
        website: body.website || null,
        domain: body.domain || null,
        description: body.description || null,
        parentOrganizationId: body.parentOrganizationId || null,
        hqCity: body.hqCity || null,
        hqStateRegion: body.hqStateRegion || null,
        hqCountry: body.hqCountry || null,
      },
    })

    if (body.alias) {
      await prisma.organizationAlias.create({
        data: { organizationId: org.id, alias: body.alias, aliasType: body.aliasType || null },
      })
    }

    return NextResponse.json(org, { status: 201 })
  } catch (error) {
    console.error("[Organizations] POST error:", error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
