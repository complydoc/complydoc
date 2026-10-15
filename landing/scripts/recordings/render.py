"""Frames of the viewer and a camera for each, as a looping video and its first frame.

    python render.py <frames dir> <out.mp4>
"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image

OUT_W, OUT_H, FADE = 1200, 750, 14
src, out = Path(sys.argv[1]), Path(sys.argv[2])
spec = json.loads((src / "frames.json").read_text())
scale, fps = spec["scale"], spec["fps"]
cache = {}

def picture(entry):
    name = entry["file"]
    if name not in cache:
        if len(cache) > 3: cache.pop(next(iter(cache)))
        cache[name] = Image.open(src / name).convert("RGB")
    left, top, width = entry["cam"]
    height = width * OUT_H / OUT_W
    box = tuple(round(v * scale, 2) for v in (left, top, left + width, top + height))
    return cache[name].resize((OUT_W, OUT_H), Image.LANCZOS, box=box)

ease = lambda t: 4 * t**3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
encode = subprocess.Popen(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W}x{OUT_H}", "-r", str(fps),
     "-i", "-", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
    stdin=subprocess.PIPE)
frames = spec["frames"]
first = picture(frames[0]); first.save(out.with_suffix(".webp"), "WEBP", quality=84, method=6)
previous, total = None, 0
for entry in frames:
    image = picture(entry)
    if entry.get("fade") and previous is not None:
        for i in range(FADE):
            encode.stdin.write(Image.blend(previous, image, ease((i + 1) / FADE)).tobytes()); total += 1
    encode.stdin.write(image.tobytes()); total += 1
    previous = image
for i in range(FADE):  # back to the first frame, so the loop has no jump
    encode.stdin.write(Image.blend(previous, first, ease((i + 1) / FADE)).tobytes()); total += 1
encode.stdin.close(); encode.wait()
print(out.name, f"{total / fps:.1f}s", f"{out.stat().st_size / 1024:.0f} KB")
