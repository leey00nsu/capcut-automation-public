#!/usr/bin/env python3
"""Convert YouTube WebVTT captions to the app's timestamped text format."""

import argparse
import html
import re
from pathlib import Path


def convert(captions: str) -> str:
    lines = []
    for block in re.split(r"\n\s*\n", captions.replace("\r\n", "\n")):
        cue_lines = block.splitlines()
        if not cue_lines or cue_lines[0].startswith(("NOTE", "STYLE", "REGION")):
            continue
        for index, line in enumerate(cue_lines):
            match = re.fullmatch(
                r"((?:\d{2}:)?\d{2}:\d{2}\.\d{3}) --> "
                r"((?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s+.*)?",
                line.strip(),
            )
            if not match:
                continue
            start, end = match.groups()
            start = start if start.count(":") == 2 else "00:" + start
            end = end if end.count(":") == 2 else "00:" + end
            text = " ".join(cue_lines[index + 1:])
            text = " ".join(html.unescape(re.sub(r"<[^>]+>", "", text)).split())
            if text:
                lines.append(f"[{start} - {end}] {text}")
            break
    if not lines:
        raise ValueError("No caption cues found in the WebVTT file")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captions", type=Path)
    parser.add_argument("transcript", type=Path)
    args = parser.parse_args()
    transcript = convert(args.captions.read_text(encoding="utf-8-sig"))
    args.transcript.parent.mkdir(parents=True, exist_ok=True)
    args.transcript.write_text(transcript, encoding="utf-8")
    print(f"Saved {len(transcript.splitlines())} cues to {args.transcript}")
