"""Cut the narration track for the walkthrough from the recorder's own scene timings.

   python tools/narrate_walkthrough.py

Reads docs/walkthrough/scenes.json (written by web/scripts/record-walkthrough.mjs), speaks each
scene's narration through tools/narrate-walkthrough.ps1 and the Windows desktop voice, then lays the
result out on the measured timeline of the recording: a scene's audio starts 1.2 s in, after the
title card has cleared, and the slot it occupies is the length the scene actually ran for.

Outputs, all under docs/walkthrough:
  narration/<n>-<scene>.wav  one padded line per scene, ready to re-cut individually
  ninecube-narration.wav     the whole track, aligned to the video

Alignment is reported rather than assumed: if a line is longer than its scene, the script says so
and the track ends up that much longer than the picture.
"""
from __future__ import annotations

import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs" / "walkthrough"
SCENES = DOCS / "scenes.json"
RAW = DOCS / "narration" / "raw"
LINES = DOCS / "narration"
TRACK = DOCS / "ninecube-narration.wav"
LEAD_MS = 1200


def speak() -> None:
    script = ROOT / "tools" / "narrate-walkthrough.ps1"
    RAW.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script),
            "-ScenesJson", str(SCENES), "-OutDir", str(RAW),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"narration failed:\n{result.stdout}\n{result.stderr}")


def read_wav(path: Path) -> tuple[bytes, object]:
    with wave.open(str(path), "rb") as handle:
        if handle.getcomptype() != "NONE":
            sys.exit(f"{path.name} is {handle.getcomptype()}, expected uncompressed PCM")
        return handle.readframes(handle.getnframes()), handle.getparams()


def silence(ms: float, params) -> bytes:
    frames = max(0, int(round(ms * params.framerate / 1000)))
    return b"\x00" * (frames * params.sampwidth * params.nchannels)


def format_of(params) -> tuple:
    return (params.framerate, params.nchannels, params.sampwidth, params.comptype)


def main() -> None:
    if not SCENES.exists():
        sys.exit(f"{SCENES} is written by the recorder; run web/scripts/record-walkthrough.mjs first")
    plan = json.loads(SCENES.read_text(encoding="utf-8"))
    if "--synthesize" in sys.argv:
        speak()

    LINES.mkdir(parents=True, exist_ok=True)
    params = None
    track = bytearray()
    rows = []
    previous_end_ms = 0

    for index, scene in enumerate(plan["scenes"], start=1):
        raw = RAW / f"{index:02d}-{scene['id']}.wav"
        if not raw.exists():
            sys.exit(f"the voice produced no file for scene {index}: {raw}")
        speech, current = read_wav(raw)
        if params is None:
            params = current
        elif format_of(current) != format_of(params):
            sys.exit(f"{raw.name} is {format_of(current)} but the first line was {format_of(params)}; one voice only")
        spoken_ms = len(speech) / (params.framerate * params.sampwidth * params.nchannels) * 1000

        slot_ms = scene["durationMs"]
        if LEAD_MS + spoken_ms + 400 > slot_ms:
            sys.exit(f"Scene {scene['id']} is too short for its measured voice; record it again after preparing narration")
        start_frame = round(scene["startMs"] * params.framerate / 1000)
        start_byte = start_frame * params.sampwidth * params.nchannels
        if start_byte < len(track):
            # Millisecond rounding can overlap a frame; it must not move subsequent commentary.
            overlap = len(track) - start_byte
            if overlap > params.framerate * params.sampwidth * params.nchannels * .05:
                sys.exit("Scene timeline overlaps; refusing to shift narration")
            del track[start_byte:]
        track += b"\x00" * (start_byte - len(track))
        body = silence(LEAD_MS, params) + speech + silence(slot_ms - LEAD_MS - spoken_ms, params)
        track += body

        with wave.open(str(LINES / raw.name), "wb") as handle:
            handle.setnchannels(params.nchannels)
            handle.setsampwidth(params.sampwidth)
            handle.setframerate(params.framerate)
            handle.writeframes(body)

        rows.append(
            {
                "scene": index,
                "id": scene["id"],
                "words": len(scene["narration"].split()),
                "spokenMs": int(spoken_ms),
                "sceneMs": scene["durationMs"],
                "slotMs": int(slot_ms),
                "driftMs": int(slot_ms - scene["durationMs"]),
            }
        )

    with wave.open(str(TRACK), "wb") as handle:
        handle.setnchannels(params.nchannels)
        handle.setsampwidth(params.sampwidth)
        handle.setframerate(params.framerate)
        handle.writeframes(bytes(track))

    picture = plan["totalMs"]
    audio = len(track) / (params.framerate * params.sampwidth * params.nchannels) * 1000
    print(f"{'#':>2} {'scene':<18} {'words':>6} {'spoken':>8} {'picture':>8} {'slot':>8} {'drift':>7}")
    for row in rows:
        print(
            f"{row['scene']:>2} {row['id']:<18} {row['words']:>6} "
            f"{row['spokenMs'] / 1000:>7.1f}s {row['sceneMs'] / 1000:>7.1f}s "
            f"{row['slotMs'] / 1000:>7.1f}s {row['driftMs'] / 1000:>+6.1f}s"
        )
    print(f"\npicture {(picture / 1000):.1f}s, narration track {(audio / 1000):.1f}s "
          f"({params.framerate} Hz, {params.nchannels} channel, {params.sampwidth * 8}-bit)")
    print(f"wrote {TRACK.name} and {len(rows)} padded lines to {LINES.relative_to(ROOT)}")
    if audio > picture + 1000:
        print("note: at least one line outlasts its scene; re-cut the picture or shorten the text")


if __name__ == "__main__":
    main()
