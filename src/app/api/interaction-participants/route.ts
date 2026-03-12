import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

/**
 * POST /api/interaction-participants
 *
 * Add a participant to an interaction. Idempotent on (interactionId, contactId).
 *
 * Body: {
 *   interactionId: string (required),
 *   contactId: string (required),
 *   role?: string (default: "participant"),
 *   speakerLabel?: string,
 *   sourceSystem?: string,
 *   sourceId?: string
 * }
 *
 * Returns: { participant, action: "created" | "existing" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { interactionId, contactId, role, speakerLabel, sourceSystem, sourceId } = body;

    if (!interactionId || !contactId) {
      return NextResponse.json(
        { error: "interactionId and contactId are required" },
        { status: 400 }
      );
    }

    // Verify interaction exists
    const interaction = await prisma.interaction.findUnique({
      where: { id: interactionId },
    });
    if (!interaction) {
      return NextResponse.json(
        { error: `Interaction ${interactionId} not found` },
        { status: 404 }
      );
    }

    // Verify contact exists
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return NextResponse.json(
        { error: `Contact ${contactId} not found` },
        { status: 404 }
      );
    }

    // Idempotent: check if participant already exists
    const existing = await prisma.interactionParticipant.findUnique({
      where: {
        interactionId_contactId: { interactionId, contactId },
      },
    });

    if (existing) {
      return NextResponse.json({
        participant: existing,
        action: "existing",
      });
    }

    const participant = await prisma.interactionParticipant.create({
      data: {
        id: crypto.randomUUID(),
        interactionId,
        contactId,
        role: role || "participant",
        speakerLabel: speakerLabel || null,
        sourceSystem: sourceSystem || null,
        sourceId: sourceId || null,
      },
    });

    return NextResponse.json({
      participant,
      action: "created",
    });
  } catch (error) {
    console.error("Error creating interaction participant:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create interaction participant" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/interaction-participants?interactionId=xxx
 *
 * List participants for an interaction.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const interactionId = searchParams.get("interactionId");

    if (!interactionId) {
      return NextResponse.json(
        { error: "interactionId query parameter is required" },
        { status: 400 }
      );
    }

    const participants = await prisma.interactionParticipant.findMany({
      where: { interactionId },
      include: {
        contact: {
          select: { id: true, name: true, title: true, organization: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ participants });
  } catch (error) {
    console.error("Error listing interaction participants:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list participants" },
      { status: 500 }
    );
  }
}
