"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2, Upload } from "lucide-react";


type AudioRecorderProps = {
  onRecordingComplete?: (file: File) => void;
  filename?: string;
  preferredMimeType?: string;
  showInlineUploadButton?: boolean;
  maxDurationMs?: number;          // default 15 minutes
  maxBytes?: number;               // default 50 MB
  audioBitsPerSecond?: number;     // bitrate hint (e.g., 128_000)
};

function pickSupportedType(candidates: string[]): string | undefined {
  if (typeof window === "undefined" || typeof (window as Window & typeof globalThis).MediaRecorder === "undefined") return;
  const MR = (window as Window & typeof globalThis).MediaRecorder as typeof MediaRecorder;
  return candidates.find((t) => (MR as typeof MediaRecorder).isTypeSupported?.(t));
}

export default function AudioRecorder({
  onRecordingComplete,
  filename = "interview-answer",
  preferredMimeType,
  showInlineUploadButton = true,
  maxDurationMs = 15 * 60 * 1000,
  maxBytes = 50 * 1024 * 1024,
  audioBitsPerSecond = 128_000,
}: AudioRecorderProps) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterTimerRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [ticker, setTicker] = useState<number | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | undefined>(undefined);
  const [sizeBytes, setSizeBytes] = useState(0);

  // Mic devices
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>(undefined);

  // Input level (0..1)
  const [level, setLevel] = useState(0);

  const timeLabel =
    elapsedMs >= 3600_000
      ? new Date(elapsedMs).toISOString().substring(11, 19)
      : new Date(elapsedMs).toISOString().substring(14, 19);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;

    try { mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    mediaStreamRef.current = null;

    if (ticker) { window.clearInterval(ticker); setTicker(null); }
    if (meterTimerRef.current) { window.clearInterval(meterTimerRef.current); meterTimerRef.current = null; }

    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;

    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }
  }

  async function refreshMics() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMics(devices.filter((d) => d.kind === "audioinput"));
    } catch {
      // ignore
    }
  }

  async function start() {
    setError(null);
    setFile(null);
    setSizeBytes(0);
    setBlobUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
    setElapsedMs(0);
    setLevel(0);

    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia || !("MediaRecorder" in window)) {
      setError("Microphone requires https:// (or http://localhost) and a modern browser.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      };
      const stream = await md.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // List mics (labels appear only after permission is granted)
      await refreshMics();

      const chosenType =
        preferredMimeType ||
        pickSupportedType([
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4", // Safari
          "audio/mpeg",
        ]);
      setMimeType(chosenType);

      const options: MediaRecorderOptions & { audioBitsPerSecond?: number } = {};
      if (chosenType) options.mimeType = chosenType;
      if (audioBitsPerSecond) options.audioBitsPerSecond = audioBitsPerSecond;

      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;

      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          setSizeBytes((prev) => prev + e.data.size);
          if (maxBytes && estimateBytes() > maxBytes) {
            setError(`Max size reached (${formatBytes(estimateBytes())}). Stopping…`);
            stop();
          }
        }
      };

      mr.onstart = () => {
        setRecording(true);
        const id = window.setInterval(() => {
          setElapsedMs((v) => {
            const next = v + 1000;
            if (maxDurationMs && next >= maxDurationMs) {
              setError(`Max duration reached (${Math.floor(maxDurationMs / 60000)} min). Stopping…`);
              stop();
            }
            return next;
          });
          return;
        }, 1000);
        setTicker(id);
      };

      mr.onerror = (ev) => {
        console.warn("MediaRecorder error:", ev);
        setError("Recording error occurred.");
        stop();
      };

      mr.onstop = () => {
        if (ticker) { window.clearInterval(ticker); setTicker(null); }
        if (meterTimerRef.current) { window.clearInterval(meterTimerRef.current); meterTimerRef.current = null; }
        try { audioCtxRef.current?.close(); } catch {}
        audioCtxRef.current = null;
        analyserRef.current = null;

        setRecording(false);

        if (!chunksRef.current.length) {
          setError("No audio captured. Check mic device/permissions and try again.");
          return;
        }

        const blob = new Blob(chunksRef.current, { type: chosenType || "audio/webm" });
        if (!blob.size) { setError("Captured audio was empty."); return; }

        const ext =
          (chosenType?.includes("mp4") && "m4a") ||
          (chosenType?.includes("mpeg") && "mp3") ||
          (chosenType?.includes("ogg") && "ogg") ||
          "webm";
        const f = new File([blob], `${filename}.${ext}`, { type: blob.type });
        setFile(f);
        setBlobUrl(URL.createObjectURL(blob));
        onRecordingComplete?.(f);
      };

      // 🔊 Setup input level meter (WebAudio)
      const Ctx =
        (window.AudioContext as typeof AudioContext | undefined) ||
        ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext as typeof AudioContext | undefined);
      if (!Ctx) {
        setError("Web Audio API is not supported in this browser.");
        return;
      }
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buffer = new Uint8Array(analyser.fftSize);

      meterTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        setLevel(rms); // ~0..0.5 range for normal speech
      }, 200);

      // ✅ Timeslice so data flushes regularly (prevents 0:00 blobs)
      mr.start(1000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Microphone permission denied or unsupported browser.";
      setError(message);
      cleanup();
    }
  }

  function estimateBytes() {
    return chunksRef.current.reduce((sum: number, p: BlobPart) => {
      if (p instanceof Blob) {
        return sum + p.size;
      } else if (typeof p === "string") {
        return sum + new TextEncoder().encode(p).length;
      } else if (p instanceof ArrayBuffer) {
        return sum + p.byteLength;
      } else if (ArrayBuffer.isView(p)) {
        return sum + p.byteLength;
      }
      return sum;
    }, 0);
  }

  function stop() {
    try { mediaRecorderRef.current?.stop(); } catch {}
    try { mediaStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    mediaStreamRef.current = null;
  }

  function reset() {
    stop();
    setElapsedMs(0);
    setSizeBytes(0);
    setFile(null);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }
    chunksRef.current = [];
    setError(null);
    setRecording(false);
    setLevel(0);
  }

  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Audio Recorder</p>
          <p className="text-xs text-muted-foreground">
            {recording ? "Recording…" : file ? "Ready to upload" : "Click Start to begin"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!recording ? (
            <button onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600 focus-ring" title="Start recording">
              <Mic className="h-4 w-4" />
              Start
            </button>
          ) : (
            <button onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-white hover:bg-rose-700 focus-ring" title="Stop recording">
              <Square className="h-4 w-4" />
              Stop
            </button>
          )}

          <button onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 hover:bg-muted focus-ring" title="Reset">
            <Trash2 className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      {/* mic selector + level meter */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground/70">Mic:</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={selectedMicId ?? ""}
            onChange={(e) => setSelectedMicId(e.target.value || undefined)}
            onClick={() => {
              // If no labels yet, prompt device enumeration by asking for permission via a quick probe
              if (!mics.length && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(() => refreshMics()).catch(() => {});
              }
            }}
            aria-label="Select microphone"
          >
            <option value="">System default</option>
            {mics.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-foreground/80">
          {recording ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              {timeLabel}
            </>
          ) : (
            <>Elapsed: {timeLabel}</>
          )}
        </span>

        {mimeType && <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{mimeType}</span>}
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-foreground/70">{formatBytes(sizeBytes)}</span>

        {/* Level meter */}
        
        <span className="text-[11px] text-foreground/70">{level.toFixed(2)}</span>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive-foreground">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <audio className="w-full" controls src={blobUrl ?? undefined} aria-label="Recording playback" />
        {file && showInlineUploadButton && (
          <button onClick={() => onRecordingComplete?.(file)} className="inline-flex items-center gap-2 self-start rounded-lg bg-accent-600 px-3 py-1.5 text-white hover:bg-accent-700 focus-ring" title="Use this recording">
            <Upload className="h-4 w-4" />
            Upload
          </button>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
