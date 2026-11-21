"""Local word timestamps with faster-whisper. Prints [{text, start, end}] as JSON.

Called by transcribe.mjs --local. Uses the GPU when CUDA works, otherwise the CPU.
"""
import json
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

video, model_name = sys.argv[1], sys.argv[2]

# Decode with FFmpeg instead of faster-whisper's PyAV path: PyAV 16+ dropped the
# metadata_errors argument that faster-whisper 1.2 still passes.
pcm = subprocess.run(
    ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
    capture_output=True, check=True,
).stdout
audio = np.frombuffer(pcm, np.int16).astype(np.float32) / 32768.0


def transcribe(device, compute_type):
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _ = model.transcribe(audio, word_timestamps=True, vad_filter=True)
    return [
        {"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
        for s in segments
        for w in s.words
    ]


try:
    words = transcribe("cuda", "int8_float16")
except Exception as e:  # no CUDA, or CUDA 12 libraries missing
    print(f"GPU unavailable ({e}); using CPU", file=sys.stderr)
    words = transcribe("cpu", "int8")

print(json.dumps(words))
