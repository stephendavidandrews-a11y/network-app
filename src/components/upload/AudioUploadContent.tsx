'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Mic,
  MicOff,
  Upload,
  FileAudio,
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Inbox,
} from 'lucide-react'

type Mode = 'idle' | 'recording' | 'uploading' | 'processing' | 'done' | 'error'

const ACCEPTED_FORMATS = '.m4a,.mp3,.wav,.webm,.mp4,.ogg,.flac'
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

export function AudioUploadContent() {
  const [mode, setMode] = useState<Mode>('idle')
  const [contactHint, setContactHint] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [resultId, setResultId] = useState<string | null>(null)
  const [resultSummary, setResultSummary] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)

  // Recording state
  const [recordingTime, setRecordingTime] = useState(0)
  const [amplitude, setAmplitude] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Contact autocomplete
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; organization: string | null }>>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredContacts, setFilteredContacts] = useState<Array<{ id: string; name: string; organization: string | null }>>([])

  // Fetch contacts for autocomplete
  useEffect(() => {
    fetch('/api/contacts?limit=500&fields=id,name,organization')
      .then(res => res.json())
      .then(data => {
        if (data.contacts) setContacts(data.contacts)
      })
      .catch(() => {/* ignore */})
  }, [])

  useEffect(() => {
    if (contactHint.length >= 2) {
      const lower = contactHint.toLowerCase()
      const matches = contacts.filter(c =>
        c.name.toLowerCase().includes(lower) ||
        (c.organization && c.organization.toLowerCase().includes(lower))
      ).slice(0, 5)
      setFilteredContacts(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }, [contactHint, contacts])

  // ── Recording ──

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up audio analysis for amplitude visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Set up MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        await submitAudio(blob)
      }

      recorder.start(1000) // Collect in 1s chunks
      mediaRecorderRef.current = recorder
      setMode('recording')
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

      // Start amplitude visualization
      const updateAmplitude = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        setAmplitude(Math.min(1, rms * 3)) // Scale up for visibility
        animFrameRef.current = requestAnimationFrame(updateAmplitude)
      }
      updateAmplitude()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission denied') || msg.includes('NotAllowed')) {
        setErrorMsg('Microphone access denied. Please allow microphone access in your browser settings.')
      } else {
        setErrorMsg(`Failed to start recording: ${msg}`)
      }
      setMode('error')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }
    setAmplitude(0)
    setMode('processing')
  }, [])

  // ── File Upload ──

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 25MB.`)
      setMode('error')
      return
    }

    setFileName(file.name)
    setFileSize(file.size)
    setMode('uploading')

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      if (!base64) {
        setErrorMsg('Failed to read file')
        setMode('error')
        return
      }
      setMode('processing')
      await submitBase64(base64)
    }
    reader.onerror = () => {
      setErrorMsg('Failed to read file')
      setMode('error')
    }
    reader.readAsDataURL(file)
  }, [])

  // ── Submit Logic ──

  const submitAudio = async (blob: Blob) => {
    try {
      // Convert blob to base64
      const buffer = await blob.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      await submitBase64(base64)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process audio')
      setMode('error')
    }
  }

  const submitBase64 = async (audioBase64: string) => {
    try {
      setMode('processing')
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'voice',
          audioBase64,
          contactHint: contactHint || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`)
      }

      if (data.duplicate) {
        setErrorMsg('Duplicate content — already in queue')
        setMode('error')
        return
      }

      setResultId(data.id)
      setResultSummary(data.summary || 'Processing complete')
      setMode('done')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit audio')
      setMode('error')
    }
  }

  const reset = () => {
    setMode('idle')
    setErrorMsg('')
    setResultId(null)
    setResultSummary('')
    setFileName('')
    setFileSize(0)
    setRecordingTime(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Mic className="w-7 h-7 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Voice Upload</h1>
      </div>

      {/* Contact Hint */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Who was this with?
        </label>
        <input
          type="text"
          value={contactHint}
          onChange={e => setContactHint(e.target.value)}
          onFocus={() => contactHint.length >= 2 && setShowSuggestions(filteredContacts.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder="Contact name (optional)"
          className="w-full px-4 py-3 text-base bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={mode === 'recording' || mode === 'processing'}
        />
        {showSuggestions && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
            {filteredContacts.map(c => (
              <button
                key={c.id}
                className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 first:rounded-t-lg last:rounded-b-lg"
                onMouseDown={() => {
                  setContactHint(c.name)
                  setShowSuggestions(false)
                }}
              >
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.organization && (
                  <span className="text-gray-500 ml-2">{c.organization}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Idle State ── */}
      {mode === 'idle' && (
        <div className="space-y-4">
          {/* Record Button */}
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-3 px-6 py-6 text-lg font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm active:scale-[0.98]"
          >
            <Mic className="w-6 h-6" />
            Record Voice Note
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-sm text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Upload File */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-3 px-6 py-6 text-lg font-medium text-gray-700 bg-white border-2 border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 rounded-xl transition-colors active:scale-[0.98]"
          >
            <Upload className="w-6 h-6" />
            Upload Audio File
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_FORMATS}
            onChange={handleFileSelect}
            className="hidden"
          />

          <p className="text-xs text-gray-400 text-center">
            Accepts .m4a, .mp3, .wav, .webm, .mp4 (max 25MB)
          </p>
        </div>
      )}

      {/* ── Recording State ── */}
      {mode === 'recording' && (
        <div className="space-y-6">
          {/* Amplitude Visualization */}
          <div className="flex items-center justify-center gap-1 h-20">
            {Array.from({ length: 30 }).map((_, i) => {
              const barAmplitude = Math.max(
                0.05,
                amplitude * (0.5 + 0.5 * Math.sin(Date.now() / 200 + i * 0.5))
              )
              return (
                <div
                  key={i}
                  className="w-1.5 bg-red-500 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(4, barAmplitude * 80)}px` }}
                />
              )
            })}
          </div>

          {/* Timer */}
          <div className="text-center">
            <span className="text-4xl font-mono font-bold text-gray-900">
              {formatTime(recordingTime)}
            </span>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-600 font-medium">Recording</span>
            </div>
          </div>

          {/* Stop Button */}
          <button
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-3 px-6 py-6 text-lg font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition-colors shadow-sm active:scale-[0.98]"
          >
            <MicOff className="w-6 h-6" />
            Stop Recording
          </button>
        </div>
      )}

      {/* ── Uploading State ── */}
      {mode === 'uploading' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <FileAudio className="w-12 h-12 text-blue-500" />
          <div className="text-center">
            <p className="font-medium text-gray-900">{fileName}</p>
            <p className="text-sm text-gray-500">{(fileSize / 1024 / 1024).toFixed(1)} MB</p>
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Reading file...</p>
        </div>
      )}

      {/* ── Processing State ── */}
      {mode === 'processing' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <div className="text-center">
            <p className="font-medium text-gray-900">Processing...</p>
            <p className="text-sm text-gray-500">Transcribing with Whisper, then analyzing with Claude</p>
            <p className="text-xs text-gray-400 mt-2">This may take 15-60 seconds</p>
          </div>
        </div>
      )}

      {/* ── Done State ── */}
      {mode === 'done' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <div className="text-center">
            <p className="font-medium text-gray-900">Sent to inbox for review</p>
            <p className="text-sm text-gray-500 mt-1">{resultSummary}</p>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Link
              href="/inbox"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Inbox className="w-4 h-4" />
              View Inbox
            </Link>
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
            >
              Record Another
            </button>
          </div>
        </div>
      )}

      {/* ── Error State ── */}
      {mode === 'error' && (
        <div className="flex flex-col items-center gap-4 py-8">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <div className="text-center">
            <p className="font-medium text-red-700">{errorMsg}</p>
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
