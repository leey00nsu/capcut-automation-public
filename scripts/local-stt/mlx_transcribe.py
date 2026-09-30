#!/usr/bin/env python3

import argparse
import json
import os
import subprocess
import tempfile

import imageio_ffmpeg
import mlx_whisper


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-path", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--language")
    return parser.parse_args()


def extract_audio(video_path: str) -> str:
    ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    handle, output_path = tempfile.mkstemp(suffix=".wav")
    os.close(handle)
    subprocess.run(
        [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            video_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            output_path,
        ],
        check=True,
    )
    return output_path


def main() -> None:
    args = parse_args()
    audio_path = extract_audio(args.video_path)

    try:
        options = {
            "path_or_hf_repo": args.model_id,
        }

        if args.language:
            options["language"] = args.language

        result = mlx_whisper.transcribe(audio_path, **options)
        segments = []

        for segment in result.get("segments", []):
            text = str(segment.get("text", "")).strip()

            if not text:
                continue

            segments.append(
                {
                    "text": text,
                    "startSeconds": float(segment.get("start", 0)),
                    "endSeconds": float(segment.get("end", 0)),
                }
            )

        print(json.dumps({"segments": segments}, ensure_ascii=False))
    finally:
        try:
            os.remove(audio_path)
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    main()
