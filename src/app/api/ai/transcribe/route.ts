import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { writeFile, unlink } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import os from 'os'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured' },
      { status: 500 }
    )
  }

  let tempPath: string | null = null

  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Check file size (25MB limit for Whisper)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio file exceeds 25MB limit' },
        { status: 400 }
      )
    }

    // Write temp file (Whisper API needs a file)
    const tempId = randomUUID()
    const ext = audioFile.type.includes('mp4') ? 'mp4' : 'webm'
    tempPath = join(os.tmpdir(), `debrief-${tempId}.${ext}`)

    const buffer = Buffer.from(await audioFile.arrayBuffer())
    await writeFile(tempPath, buffer)

    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    })

    return NextResponse.json({ transcript: transcription })
  } catch (error) {
    console.error('[Transcribe] Failed:', error)
    return NextResponse.json(
      { error: 'Transcription failed. Check OPENAI_API_KEY.' },
      { status: 500 }
    )
  } finally {
    // Always clean up temp file
    if (tempPath) {
      try { await unlink(tempPath) } catch { /* ignore */ }
    }
  }
}
