"""
delete_threads.py
-----------------
Delete ChatKit threads with three modes:

  Mode 1: Delete ALL threads
  Mode 3: Delete threads older than X days
  Mode 4: Delete specific thread IDs

Usage:
    python delete_threads.py

Requirements:
    pip install requests python-dotenv
"""

import os
import re
import time
import requests
from datetime import datetime, timezone, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def list_all_threads():
    threads = []
    url = f"{BASE_URL}/threads?limit=100&order=desc"
    while url:
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        threads.extend(data.get("data", []))
        if data.get("has_more") and data.get("last_id"):
            url = f"{BASE_URL}/threads?limit=100&order=desc&after={data['last_id']}"
        else:
            url = None
        time.sleep(0.2)
    return threads


def delete_thread(thread_id):
    resp = requests.delete(
        f"{BASE_URL}/threads/{thread_id}",
        headers=HEADERS
    )
    return resp.status_code in (200, 204)


def confirm(message):
    answer = input(f"\n⚠️  {message} (yes/no): ").strip().lower()
    return answer == "yes"


def delete_threads_list(threads_to_delete):
    if not threads_to_delete:
        print("No threads to delete.")
        return

    print(f"\nThreads to delete ({len(threads_to_delete)}):")
    for t in threads_to_delete:
        created = datetime.utcfromtimestamp(t.get("created_at", 0)).strftime("%Y-%m-%d %H:%M")
        print(f"  {t['id'][:30]}...  user={t.get('user','?')[:40]}  created={created}")

    if not confirm(f"Permanently delete {len(threads_to_delete)} threads? This cannot be undone."):
        print("Cancelled.")
        return

    deleted = 0
    failed = 0
    for t in threads_to_delete:
        success = delete_thread(t["id"])
        if success:
            deleted += 1
            print(f"  ✅ Deleted {t['id'][:30]}...")
        else:
            failed += 1
            print(f"  ❌ Failed  {t['id'][:30]}...")
        time.sleep(0.1)

    print(f"\nDone. Deleted: {deleted} | Failed: {failed}")


# ── Modes ─────────────────────────────────────────────────────────────────────

def mode_delete_all():
    print("\n[Mode 1] Delete ALL threads")
    print("Fetching all threads...")
    threads = list_all_threads()
    print(f"Found {len(threads)} threads.")
    delete_threads_list(threads)


def mode_delete_older_than():
    print("\n[Mode 3] Delete threads older than X days")
    try:
        days = int(input("Delete threads older than how many days? ").strip())
    except ValueError:
        print("Invalid number.")
        return

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_ts = cutoff.timestamp()
    print(f"Cutoff date: {cutoff.strftime('%Y-%m-%d %H:%M UTC')}")

    print("Fetching all threads...")
    threads = list_all_threads()

    old_threads = [t for t in threads if t.get("created_at", 0) < cutoff_ts]
    print(f"Found {len(old_threads)} threads older than {days} days (out of {len(threads)} total).")

    delete_threads_list(old_threads)


def mode_delete_specific():
    print("\n[Mode 4] Delete specific thread IDs")
    print("Paste thread IDs one per line. Press Enter twice when done:")

    ids = []
    while True:
        line = input().strip()
        if not line:
            break
        ids.append(line)

    if not ids:
        print("No IDs provided.")
        return

    # Fetch all threads to show details
    print("Fetching thread details...")
    all_threads = list_all_threads()
    thread_map = {t["id"]: t for t in all_threads}

    threads_to_delete = []
    for tid in ids:
        if tid in thread_map:
            threads_to_delete.append(thread_map[tid])
        else:
            print(f"  ⚠️  Not found: {tid}")

    delete_threads_list(threads_to_delete)


# ── Main menu ─────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("ChatKit Thread Deleter")
    print("=" * 60)
    print("\nSelect mode:")
    print("  1 — Delete ALL threads (clean slate)")
    print("  3 — Delete threads older than X days")
    print("  4 — Delete specific thread IDs")
    print("  q — Quit")

    choice = input("\nEnter choice: ").strip().lower()

    if choice == "1":
        mode_delete_all()
    elif choice == "3":
        mode_delete_older_than()
    elif choice == "4":
        mode_delete_specific()
    elif choice == "q":
        print("Bye!")
    else:
        print("Invalid choice.")


if __name__ == "__main__":
    main()