#!/usr/bin/env python3
"""
Finds and deletes hyphenated duplicate token PNGs in a /tokens folder.

GeezSheets only ever looks for underscore-separated filenames
(e.g. "adult_black_dragon.png"), so any "-"-named file is dead weight.

Usage:
    python3 clean_hyphenated_tokens.py /path/to/tokens          # dry run (lists only)
    python3 clean_hyphenated_tokens.py /path/to/tokens --delete  # actually deletes
"""
import sys, os

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 clean_hyphenated_tokens.py /path/to/tokens [--delete]")
        sys.exit(1)

    folder = sys.argv[1]
    do_delete = "--delete" in sys.argv

    if not os.path.isdir(folder):
        print(f"Not a folder: {folder}")
        sys.exit(1)

    hyphenated = [f for f in os.listdir(folder) if f.endswith(".png") and "-" in f]

    if not hyphenated:
        print("No hyphenated .png files found — nothing to do.")
        return

    print(f"Found {len(hyphenated)} hyphenated file(s):\n")
    for f in sorted(hyphenated):
        print(" ", f)

    if do_delete:
        print(f"\nDeleting {len(hyphenated)} file(s)...")
        for f in hyphenated:
            os.remove(os.path.join(folder, f))
        print("Done.")
    else:
        print(f"\nDry run only — nothing deleted. Re-run with --delete to actually remove these {len(hyphenated)} files.")

if __name__ == "__main__":
    main()
