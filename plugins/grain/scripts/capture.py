#!/usr/bin/env python3
"""grain — capture hook (shared by PreCompact and SessionEnd).

Reads the hook payload from stdin, extracts the high-signal parts of the session
transcript (your prompts, files touched, the closing summary, any next steps),
and upserts a single Markdown block for this session into the project's memory
file. In 'precompact' mode it also prints a short anchor to stdout.

Standard library only. Designed never to raise out to the hook: any failure
simply results in no capture. Honors <private>/<no-memory> opt-out markers.

Usage: capture.py <precompact|sessionend>   (payload JSON on stdin)
"""
import sys
import os
import json
import re
import subprocess
from datetime import datetime

MAX_PROMPTS = 6
MAX_PROMPT_LEN = 300
MAX_FILES = 25
MAX_OUTCOME = 600
MAX_NEXTS = 5
EDIT_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
PRIVACY_MARKERS = ("<private>", "<no-memory>", "<nomemory>")
NEXT_RE = re.compile(r'^\s*(?:[-*]\s*)?(?:next steps?|todo|to[- ]?do|next:|follow[- ]?up)\b', re.I)


def is_noise_prompt(text):
    t = text.lstrip()
    if not t:
        return True
    if t.startswith(("<command-", "<local-command", "<bash-", "<system-reminder",
                     "<task-notification", "<user-prompt-submit-hook")):
        return True
    if "<command-name>" in t[:60]:
        return True
    return False


def text_from_content(content):
    """Concatenate text blocks from a message.content (str or list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [b["text"] for b in content
                 if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str)]
        return "\n".join(parts)
    return ""


def extract(transcript_path):
    asked, touched, nexts = [], [], []
    last_assistant_text = ""
    seen_files = set()
    if not transcript_path or not os.path.exists(transcript_path):
        return asked, touched, last_assistant_text, nexts
    try:
        with open(transcript_path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                rtype = rec.get("type")
                msg = rec.get("message") or {}
                if rtype == "user" and not rec.get("isMeta"):
                    content = msg.get("content")
                    if isinstance(content, str):
                        txt = content.strip()
                        if txt and not is_noise_prompt(txt):
                            asked.append(txt[:MAX_PROMPT_LEN])
                elif rtype == "assistant":
                    content = msg.get("content")
                    if isinstance(content, list):
                        for b in content:
                            if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") in EDIT_TOOLS:
                                fp = (b.get("input") or {}).get("file_path")
                                if fp and fp not in seen_files:
                                    seen_files.add(fp)
                                    touched.append(fp)
                    atext = text_from_content(content).strip()
                    if atext:
                        last_assistant_text = atext
                        for ln in atext.splitlines():
                            if NEXT_RE.match(ln):
                                nexts.append(ln.strip()[:MAX_PROMPT_LEN])
    except Exception:
        pass

    # de-dup prompts preserving order
    seen, uniq = set(), []
    for a in asked:
        if a not in seen:
            seen.add(a)
            uniq.append(a)
    # keep the opening goal + the most recent asks
    if len(uniq) > MAX_PROMPTS:
        uniq = uniq[:1] + uniq[-(MAX_PROMPTS - 1):]
    return uniq, touched[:MAX_FILES], last_assistant_text[:MAX_OUTCOME], nexts[:MAX_NEXTS]


def render_block(session_id, cwd, asked, touched, outcome, nexts):
    short = (session_id or "unknown").split("-")[0]
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    proj = os.path.basename(cwd.rstrip("/")) or cwd
    out = [f"## {ts} · {proj} · session {short}",
           f"<!-- grain:session={session_id} -->"]
    if asked:
        if len(asked) == 1:
            out.append(f"**Asked:** {asked[0]}")
        else:
            out.append("**Asked:**")
            out.extend(f"- {a}" for a in asked)
    if touched:
        shown = ", ".join(os.path.relpath(f, cwd) if f.startswith(cwd) else f for f in touched)
        out.append(f"**Touched:** {shown}")
    if outcome:
        out.append(f"**Outcome:** {outcome}")
    if nexts:
        out.append("**Next:**")
        out.extend(f"- {n}" for n in nexts)
    return "\n".join(out) + "\n"


def split_blocks(content):
    """Split into (header_text, [block, ...]); each block starts with '## '."""
    header, blocks, cur = [], [], None
    for ln in content.splitlines(keepends=True):
        if ln.startswith("## "):
            if cur is not None:
                blocks.append("".join(cur))
            cur = [ln]
        elif cur is None:
            header.append(ln)
        else:
            cur.append(ln)
    if cur is not None:
        blocks.append("".join(cur))
    return "".join(header), blocks


def upsert(mem_file, new_block, session_id):
    """Insert new_block at the top (newest first), replacing any prior block for
    this session so a compact-then-end pair yields one clean entry."""
    os.makedirs(os.path.dirname(mem_file), exist_ok=True)
    existing = ""
    if os.path.exists(mem_file):
        with open(mem_file, "r", encoding="utf-8", errors="replace") as fh:
            existing = fh.read()
    header, blocks = split_blocks(existing) if existing else ("", [])
    marker = f"grain:session={session_id}"
    blocks = [b for b in blocks if marker not in b]
    if "# grain" not in header:
        header = "# grain — project memory\n\n"
    body = "\n".join(b.rstrip("\n") for b in ([new_block] + blocks))
    content = header.rstrip("\n") + "\n\n" + body + "\n"
    tmp = mem_file + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(content)
    os.replace(tmp, mem_file)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "sessionend"
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}

    cwd = payload.get("cwd") or os.getcwd()
    transcript_path = payload.get("transcript_path")
    session_id = payload.get("session_id") or "unknown"

    here = os.path.dirname(os.path.abspath(__file__))
    try:
        out = subprocess.check_output([os.path.join(here, "grain-paths.sh"), cwd],
                                      text=True, stderr=subprocess.DEVNULL)
        mem_file = out.splitlines()[0]
    except Exception:
        return 0

    asked, touched, outcome, nexts = extract(transcript_path)

    # privacy opt-out: if the user marked anything private, capture nothing
    blob = "\n".join(asked) + "\n" + outcome
    if any(m in blob for m in PRIVACY_MARKERS):
        return 0
    # noise guard: skip sessions with nothing worth remembering
    if not asked and not touched:
        return 0

    block = render_block(session_id, cwd, asked, touched, outcome, nexts)
    upsert(mem_file, block, session_id)

    if mode == "precompact":
        sys.stdout.write("## grain memory anchor (preserved across compaction)\n" + block)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main() or 0)
    except Exception:
        sys.exit(0)
