import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// OrganizationClassification = narrower regulatory/institutional category membership
// DISTINCT from orgType (broad institutional kind) and industry (sector/domain)
// Explicitly structured and narrow — NOT a generic tag system.

const VALID_CLASSIFICATION_TYPES = [
  "DCO", "DCM", "SEF", "SDR", "FCM", "CPO", "CTA", "SD", "MSP",  // CFTC registrant categories
  "SRO",                                                            // self-regulatory organization
  "prudential_regulator", "federal_agency",                         // government
  "senate_committee", "house_committee",                            // congressional
] as const

const VALID_CLASSIFICATION_SYSTEMS = [
  "cftc_registrant",
  "government_body",
  "market_infrastructure",
] as const

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get("organizationId")
    const classificationType = searchParams.get("classificationType")
    const classificationSystem = searchParams.get("classificationSystem")
    const isActive = searchParams.get("isActive")

    const where: any = {}

    if (organizationId) where.organizationId = organizationId
    if (classificationType) where.classificationType = classificationType
    if (classificationSystem) where.classificationSystem = classificationSystem
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      where.isActive = isActive === "true"
    }

    const classifications = await prisma.organizationClassification.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true, industry: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    })

    return NextResponse.json(classifications)
  } catch (error) {
    console.error("[OrgClassifications] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch classifications" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { organizationId, classificationType, classificationSystem, effectiveDate, endDate, isActive } = body

    // Validate required fields
    if (!organizationId || !classificationType || !classificationSystem) {
      return NextResponse.json(
        { error: "organizationId, classificationType, and classificationSystem are required" },
        { status: 400 }
      )
    }

    // Validate classificationType
    if (!VALID_CLASSIFICATION_TYPES.includes(classificationType)) {
      return NextResponse.json(
        {
          error: `Invalid classificationType: "${classificationType}". Valid types: ${VALID_CLASSIFICATION_TYPES.join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Validate classificationSystem
    if (!VALID_CLASSIFICATION_SYSTEMS.includes(classificationSystem)) {
      return NextResponse.json(
        {
          error: `Invalid classificationSystem: "${classificationSystem}". Valid systems: ${VALID_CLASSIFICATION_SYSTEMS.join(", ")}`,
        },
        { status: 400 }
      )
    }

    // Validate organization exists
    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Upsert: dedup by unique constraint (organizationId, classificationType, classificationSystem)
    const existing = await prisma.organizationClassification.findUnique({
      where: {
        organizationId_classificationType_classificationSystem: {
          organizationId,
          classificationType,
          classificationSystem,
        },
      },
    })

    if (existing) {
      // Update existing
      const updated = await prisma.organizationClassification.update({
        where: { id: existing.id },
        data: {
          isActive: isActive !== undefined ? isActive : existing.isActive,
          effectiveDate: effectiveDate ?? existing.effectiveDate,
          endDate: endDate ?? existing.endDate,
          updatedAt: new Date().toISOString(),
        },
        include: {
          organization: {
            select: { id: true, name: true, industry: true },
          },
        },
      })
      return NextResponse.json(updated, { status: 200 })
    }

    // Create new
    const created = await prisma.organizationClassification.create({
      data: {
        organizationId,
        classificationType,
        classificationSystem,
        isActive: isActive !== undefined ? isActive : true,
        effectiveDate: effectiveDate || null,
        endDate: endDate || null,
      },
      include: {
        organization: {
          select: { id: true, name: true, industry: true },
        },
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("[OrgClassifications] POST error:", error)
    return NextResponse.json({ error: "Failed to create classification" }, { status: 500 })
  }
}
