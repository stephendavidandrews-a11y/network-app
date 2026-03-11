import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import path from 'path'

export async function POST() {
  try {
    const scriptDir = path.join(process.cwd(), 'scripts', 'text-sync')
    const pythonPath = path.join(scriptDir, 'venv', 'bin', 'python3')
    const scriptPath = path.join(scriptDir, 'sync_voice.py')

    // Run in background — don't await
    const child = exec(
      `cd "${scriptDir}" && "${pythonPath}" "${scriptPath}"`,
      { timeout: 3600000 } // 1 hour timeout
    )

    child.unref()

    return NextResponse.json({
      success: true,
      message: 'Voice profiling started in background. Check voice.log for progress.',
    })
  } catch (error) {
    console.error('Voice trigger error:', error)
    return NextResponse.json(
      { error: 'Failed to trigger voice profiling' },
      { status: 500 }
    )
  }
}
