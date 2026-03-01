'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Square, Loader2, AlertCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DebriefExtraction } from '@/types'

interface VoiceDebriefProps {
  contactId: string
  contactName: string
  onExtractionComplete: (extraction: DebriefExtraction, transcript: string) => void
}

type RecordingState =
  | 'idle'
  | 'recording'
  | 'stopping'
  | 'transcribing'
  | 'extracting'
  | 'error'

const MAX_RECORDING_SECONDS = 30 * 60 // 30 minutes
const MAX_FILE_SIZE_MB = 20

export function VoiceDebrief({ contactId, contactName, onExtractionComplete }: VoiceDebriefProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [amplitude, setAmplitude] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up amplitude analysis
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyserRef.current = analyser

      // Animate amplitude
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateAmplitude = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length
        setAmplitude(avg / 255) // Normalize to 0-1
        animFrameRef.current = requestAnimationFrame(updateAmplitude)
      }
      updateAmplitude()

      // Choose best codec
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        stream.getTracks().forEach(t => t.stop())

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        audioBlobRef.current = blob

        // Check file size
        if (blob.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          setError(`Recording is ${(blob.size / 1024 / 1024).toFixed(1)}MB — exceeds ${MAX_FILE_SIZE_MB}MB limit. Try a shorter recording.`)
          setState('error')
          return
        }

        // Process: transcribe then extract
        await processRecording(blob)
      }

      mediaRecorder.start(1000) // Collect data every second
      mediaRecorderRef.current = mediaRecorder
      setState('recording')
      setElapsed(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Microphone access denied. Please allow microphone access and try again.')
      setState('error')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      setState('stopping')
      mediaRecorderRef.current.stop()
    }
  }, [])

  const processRecording = async (blob: Blob) => {
    // Step 1: Transcribe
    setState('transcribing')
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'debrief.webm')

      const transcribeRes = await fetch('/api/ai/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!transcribeRes.ok) {
        const err = await transcribeRes.json()
        throw new Error(err.error || 'Transcription failed')
      }

      const { transcript } = await transcribeRes.json()

      if (!transcript || transcript.trim().length === 0) {
        setError('No speech detected in recording. Please try again.')
        setState('error')
        return
      }

      // Step 2: Extract
      setState('extracting')
      const extractRes = await fetch('/api/ai/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, contactId }),
      })

      if (!extractRes.ok) {
        const err = await extractRes.json()
        throw new Error(err.error || 'Extraction failed')
      }

      const { extraction } = await extractRes.json()
      onExtractionComplete(extraction, transcript)
    } catch (err) {
      console.error('Processing failed:', err)
      setError(err instanceof Error ? err.message : 'Processing failed. Please try again.')
      setState('error')
    }
  }

  const retryProcessing = async () => {
    if (audioBlobRef.current) {
      setError(null)
      await processRecording(audioBlobRef.current)
    } else {
      setState('idle')
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="space-y-4">
      {/* Recording UI */}
      <div className="flex flex-col items-center justify-center py-8">
        {state === 'idle' && (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Record your debrief for <span className="font-medium text-gray-700">{contactName}</span>
            </p>
            <button
              onClick={startRecording}
              className="group flex items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg transition-all hover:scale-105"
            >
              <Mic className="h-8 w-8" />
            </button>
            <p className="text-xs text-gray-400 mt-3">Click to start recording</p>
          </>
        )}

        {state === 'recording' && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-3 h-3 rounded-full bg-red-500 animate-pulse"
              />
              <span className="text-lg font-mono font-medium text-gray-900">
                {formatTime(elapsed)}
              </span>
            </div>
            {/* Amplitude bar */}
            <div className="w-48 h-2 rounded-full bg-gray-200 mb-4 overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-100"
                style={{ width: `${Math.max(5, amplitude * 100)}%` }}
              />
            </div>
            <button
              onClick={stopRecording}
              className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 hover:bg-gray-900 text-white shadow-lg transition-all"
            >
              <Square className="h-6 w-6" />
            </button>
            <p className="text-xs text-gray-400 mt-3">Click to stop recording</p>
            {elapsed >= MAX_RECORDING_SECONDS - 60 && (
              <p className="text-xs text-amber-500 mt-1">
                {MAX_RECORDING_SECONDS - elapsed}s remaining
              </p>
            )}
          </>
        )}

        {state === 'stopping' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">Processing audio...</p>
          </div>
        )}

        {state === 'transcribing' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
            <p className="text-sm text-gray-700 font-medium">Transcribing audio...</p>
            <p className="text-xs text-gray-400">This may take 10-30 seconds</p>
          </div>
        )}

        {state === 'extracting' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
            <p className="text-sm text-gray-700 font-medium">Extracting key information...</p>
            <p className="text-xs text-gray-400">Identifying commitments, contacts, and follow-ups</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-600 text-center max-w-md">{error}</p>
            <div className="flex gap-2">
              {audioBlobRef.current && (
                <button
                  onClick={retryProcessing}
                  className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry Processing
                </button>
              )}
              <button
                onClick={() => { setState('idle'); setError(null); audioBlobRef.current = null }}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Mic className="h-4 w-4" />
                Record Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
