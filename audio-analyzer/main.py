"""
Audio Analysis Service (librosa)

Small FastAPI service that analyzes audio files for:
- Pitch (average f0 + variance)
- Energy (RMS, classified as low/medium/high)
- Pace (estimated from energy patterns)
- Laughter detection (high-energy bursts with irregular pitch)
- Silence analysis (longest gap between speech segments)
- Energy pattern description

Runs on port 5050, called by the Next.js ingest endpoint.
"""

import os
import tempfile
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import librosa

app = FastAPI(title="Audio Analyzer", version="1.0.0")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """Analyze an uploaded audio file and return acoustic features."""
    try:
        # Save uploaded file to temp location
        suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Load audio with librosa (auto-resamples to 22050 Hz)
            y, sr = librosa.load(tmp_path, sr=22050, mono=True)
            duration = librosa.get_duration(y=y, sr=sr)

            if duration < 1.0:
                return JSONResponse(content={
                    "error": "Audio too short for analysis",
                    "totalDuration": duration,
                })

            # ── Pitch Analysis (pyin) ──
            f0, voiced_flag, _ = librosa.pyin(
                y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'),
                sr=sr
            )
            voiced_f0 = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]
            if len(voiced_f0) > 0:
                avg_pitch = float(np.nanmean(voiced_f0))
                pitch_variance = float(np.nanstd(voiced_f0))
            else:
                avg_pitch = 0.0
                pitch_variance = 0.0

            # ── Energy Analysis (RMS) ──
            rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
            avg_rms = float(np.mean(rms))
            max_rms = float(np.max(rms))

            # Classify energy level
            if avg_rms > 0.08:
                energy_level = "high"
            elif avg_rms > 0.03:
                energy_level = "medium"
            else:
                energy_level = "low"

            # ── Energy Pattern ──
            # Split into quarters and describe trajectory
            quarter = len(rms) // 4
            if quarter > 0:
                q_energies = [
                    float(np.mean(rms[i * quarter:(i + 1) * quarter]))
                    for i in range(4)
                ]
                # Describe pattern
                trend = q_energies[-1] - q_energies[0]
                mid_peak = max(q_energies[1], q_energies[2]) > max(q_energies[0], q_energies[3]) * 1.3

                if abs(trend) < avg_rms * 0.2:
                    if mid_peak:
                        energy_pattern = "peaks in the middle, consistent bookends"
                    else:
                        energy_pattern = "consistent energy throughout"
                elif trend > 0:
                    energy_pattern = "energy builds over the conversation"
                else:
                    energy_pattern = "energy fades toward the end"

                # Check for spikes
                spike_threshold = avg_rms * 2.5
                spike_count = int(np.sum(rms > spike_threshold))
                if spike_count > 10:
                    energy_pattern += f", with {spike_count} high-energy spikes"
            else:
                energy_pattern = "too short to determine pattern"

            # ── Pace Estimation ──
            # Use onset detection as a proxy for speech rate
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            onsets = librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=sr, units='time'
            )
            if duration > 10 and len(onsets) > 2:
                onsets_per_second = len(onsets) / duration
                if onsets_per_second > 4:
                    pace = "fast"
                elif onsets_per_second > 2:
                    pace = "moderate"
                else:
                    pace = "slow"
            else:
                pace = "moderate"

            # ── Silence / Pause Analysis ──
            # Find segments of low energy
            silence_threshold = avg_rms * 0.15
            is_silent = rms < silence_threshold
            hop_duration = 512 / sr  # duration of each frame in seconds

            longest_silence = 0.0
            current_silence = 0.0
            for frame_silent in is_silent:
                if frame_silent:
                    current_silence += hop_duration
                else:
                    if current_silence > longest_silence:
                        longest_silence = current_silence
                    current_silence = 0.0
            if current_silence > longest_silence:
                longest_silence = current_silence

            # ── Laughter Detection (rough proxy) ──
            # Look for short bursts of high energy with high spectral flux
            # This is a rough heuristic — real laughter detection needs ML
            laughter_count = 0
            if len(rms) > 20:
                spectral_flux = np.diff(
                    librosa.feature.spectral_centroid(y=y, sr=sr)[0]
                )
                # Normalize
                if np.std(spectral_flux) > 0:
                    spectral_flux_z = (spectral_flux - np.mean(spectral_flux)) / np.std(spectral_flux)
                else:
                    spectral_flux_z = spectral_flux

                # Count bursts: high energy + high spectral variation + short duration
                min_len = min(len(rms) - 1, len(spectral_flux_z))
                burst_active = False
                burst_frames = 0
                for i in range(min_len):
                    if rms[i] > avg_rms * 1.8 and abs(spectral_flux_z[i]) > 1.5:
                        if not burst_active:
                            burst_active = True
                            burst_frames = 0
                        burst_frames += 1
                    else:
                        if burst_active and 3 <= burst_frames <= 30:
                            laughter_count += 1
                        burst_active = False
                        burst_frames = 0

            return {
                "totalDuration": round(duration, 1),
                "averageEnergy": energy_level,
                "overallPace": pace,
                "laughterInstances": laughter_count,
                "longestSilence": round(longest_silence, 1),
                "averagePitch": round(avg_pitch, 1),
                "pitchVariance": round(pitch_variance, 1),
                "energyPattern": energy_pattern,
            }

        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "5050"))
    uvicorn.run(app, host="0.0.0.0", port=port)
