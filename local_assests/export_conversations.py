"""
export_conversations.py
-----------------------
Bulk exports all ChatKit threads for your study to CSV.

Usage:
    python export_conversations.py

Requirements:
    pip install requests python-dotenv

Output files:
    conversations_export.csv   — one row per message (long format, best for analysis)
    conversations_summary.csv  — one row per participant (wide format, easy to merge with Qualtrics)

Setup:
    Set OPENAI_API_KEY in your .env file or as an environment variable.
"""

import os
import csv
import json
import time
import re
from zipfile import Path
import requests
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

# Load from .env if present
try:
    from dotenv import load_dotenv
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env.local")
    load_dotenv(env_path)
except ImportError:
    pass

API_KEY = os.environ.get("OPENAI_API_KEY")
if not API_KEY:
    raise ValueError("Missing OPENAI_API_KEY environment variable")

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "OpenAI-Beta": "chatkit_beta=v1",
}

BASE_URL = "https://api.openai.com/v1/chatkit"

script_dir = os.path.dirname(os.path.abspath(__file__))
# ── Helpers ───────────────────────────────────────────────────────────────────

def list_all_threads():
    """Fetch all threads, handling pagination."""
    threads = []
    url = f"{BASE_URL}/threads?limit=100&order=desc"

    while url:
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()

        threads.extend(data.get("data", []))
        print(f"  Fetched {len(threads)} threads so far...")

        # Handle pagination
        if data.get("has_more") and data.get("last_id"):
            url = f"{BASE_URL}/threads?limit=100&order=desc&after={data['last_id']}"
        else:
            url = None

        time.sleep(0.2)  # be polite to the API

    return threads


def get_thread_items(thread_id):
    """Fetch all items for a thread."""
    url = f"{BASE_URL}/threads/{thread_id}/items?limit=100&order=asc"
    resp = requests.get(url, headers=HEADERS)

    if resp.status_code == 404:
        return []

    resp.raise_for_status()
    data = resp.json()
    return data.get("data", [])


def parse_user_string(user_str):
    """
    Parse 'uid:R_999;prolific:test123;cond:NA' into a dict.
    Returns {'uid': 'R_999', 'prolific': 'test123', 'cond': 'NA'}
    """
    result = {"uid": None, "prolific": None, "cond": None}
    if not user_str:
        return result

    for part in user_str.split(";"):
        if ":" in part:
            key, _, val = part.partition(":")
            key = key.strip()
            val = val.strip()
            if key in result:
                result[key] = val if val != "NA" else None

    return result


def extract_text(content_list):
    """Extract text from a content array."""
    return " ".join(
        c.get("text", "")
        for c in (content_list or [])
        if c.get("type") in ("input_text", "output_text", "text")
        and c.get("text")
    ).strip()


# ── Main export ───────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("ChatKit Conversation Exporter")
    print("=" * 60)

    # Step 1: Get all threads
    print("\n[1/3] Fetching all threads...")
    threads = list_all_threads()
    print(f"  Total threads: {len(threads)}")

    if not threads:
        print("No threads found. Check your API key and workflow.")
        return

    # Step 2: Fetch items for each thread
    print("\n[2/3] Fetching messages for each thread...")

    rows_long = []     # one row per message
    rows_summary = []  # one row per participant

    for i, thread in enumerate(threads):
        thread_id = thread["id"]
        user_str = thread.get("user", "")
        participant = parse_user_string(user_str)
        created_at = datetime.utcfromtimestamp(thread.get("created_at", 0)).isoformat()

        print(f"  [{i+1}/{len(threads)}] Thread {thread_id[:20]}... user={user_str}")

        items = get_thread_items(thread_id)
        time.sleep(0.1)

        # Filter to just user and assistant messages
        messages = [
            item for item in items
            if item.get("type") in ("chatkit.user_message", "chatkit.assistant_message")
        ]

        user_messages = [m for m in messages if m.get("type") == "chatkit.user_message"]
        assistant_messages = [m for m in messages if m.get("type") == "chatkit.assistant_message"]

        # Build full transcript
        transcript_parts = []
        for msg in messages:
            role = "USER" if msg.get("type") == "chatkit.user_message" else "ASSISTANT"
            text = extract_text(msg.get("content", []))
            if text:
                transcript_parts.append(f"{role}: {text}")

        transcript = "\n".join(transcript_parts)

        # Long format — one row per message
        for msg in messages:
            role = "user" if msg.get("type") == "chatkit.user_message" else "assistant"
            text = extract_text(msg.get("content", []))
            rows_long.append({
                "thread_id": thread_id,
                "prolific_id": participant["prolific"],
                "qualtrics_id": participant["uid"],
                "condition": participant["cond"],
                "thread_created_at": created_at,
                "item_id": msg["id"],
                "role": role,
                "message": text,
                "message_created_at": datetime.utcfromtimestamp(msg.get("created_at", 0)).isoformat(),
            })

        # Summary format — one row per participant
        rows_summary.append({
            "thread_id": thread_id,
            "prolific_id": participant["prolific"],
            "qualtrics_id": participant["uid"],
            "condition": participant["cond"],
            "thread_created_at": created_at,
            "total_messages": len(messages),
            "user_messages": len(user_messages),
            "assistant_messages": len(assistant_messages),
            "transcript": transcript,
        })

    # Step 3: Write JSON files — one per session in conversations_json/
    print("\n[3/4] Writing JSON files...")
    json_dir = os.path.join(script_dir, "conversations_json")
    os.makedirs(json_dir, exist_ok=True)

    for row in rows_summary:
        thread_messages = [r for r in rows_long if r["thread_id"] == row["thread_id"]]
        raw_id = row["qualtrics_id"] or row["prolific_id"] or row["thread_id"]
        # Strip Qualtrics unresolved placeholders like ${e://Field/UID}
        if raw_id and raw_id.startswith("${"):
            raw_id = row["prolific_id"] or row["thread_id"]
        # Sanitize filename — remove any chars invalid on Windows/Mac
        file_id = re.sub(r'[\\/:*?"<>|{}$]', "_", raw_id or row["thread_id"])
        filepath = os.path.join(json_dir, file_id + ".json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump({
                "thread_id": row["thread_id"],
                "prolific_id": row["prolific_id"],
                "qualtrics_id": row["qualtrics_id"],
                "condition": row["condition"],
                "thread_created_at": row["thread_created_at"],
                "total_messages": row["total_messages"],
                "messages": [
                    {"role": m["role"], "message": m["message"], "created_at": m["message_created_at"]}
                    for m in thread_messages
                ],
            }, f, indent=2)

    print(f"  ✅ {json_dir}/ — {len(rows_summary)} files")

    # Step 4: Write CSV files
    print("\n[4/4] Writing CSV files...")

    # Long format
    if rows_long:
        long_file = os.path.join(script_dir, "conversations_export.csv")
        with open(long_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows_long[0].keys())
            writer.writeheader()
            writer.writerows(rows_long)
        print(f"  ✅ {long_file} — {len(rows_long)} message rows")

    # Summary format
    if rows_summary:
        summary_file = os.path.join(script_dir, "conversations_summary.csv")
        with open(summary_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=rows_summary[0].keys())
            writer.writeheader()
            writer.writerows(rows_summary)
        print(f"  ✅ {summary_file} — {len(rows_summary)} participant rows")

    print("\n" + "=" * 60)
    print(f"Done! Exported {len(threads)} conversations.")
    print("=" * 60)


if __name__ == "__main__":
    main()