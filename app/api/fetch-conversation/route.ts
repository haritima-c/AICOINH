import fs from "fs";
import path from "path";
// import { saveMessageToDB } from "@/lib/db";          // ← ADD
import { saveMessageToDB, ensureConversationsTable } from "@/lib/db";

export const runtime = "nodejs";

type ThreadItem = {
  id: string;
  type: string;
  role?: string;  
  created_at?: number;    
  content: { type: string; text?: string }[];
};

export async function POST(req: Request) {
  const body = (await req.json()) as {
    session_id?: string;
    prolific_id?: string | null;
    prolific_system_id?: string | null;
    qualtrics_id?: string | null;
    condition?: string | null;
    source_url?: string | null;   
  };

  const { session_id, prolific_system_id, prolific_id, qualtrics_id, condition, source_url, } = body;

  if (!session_id) {
    return new Response(JSON.stringify({ error: "Missing session_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await ensureConversationsTable();   // ← ADD THIS LINE
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const uid = qualtrics_id ?? "NA";
    const prolific = prolific_id ?? "NA";
    // const userString = "uid:" + uid + ";prolific:" + prolific + ";cond:NA";
    const prolificSystem = prolific_system_id ?? "NA";
    const cond = condition ?? "NA";
    const userString = "uid:" + uid + ";prolific:" + prolific + ";prolificSystemId:" + prolificSystem + ";cond:" + cond;

    // Step 1: Find the thread for this user
    const listRes = await fetch(
      "https://api.openai.com/v1/chatkit/threads?limit=20&order=desc",
      {
        headers: {
          Authorization: "Bearer " + apiKey,
          "OpenAI-Beta": "chatkit_beta=v1",
        },
      }
    );

    if (!listRes.ok) {
      return new Response(JSON.stringify({ error: "Could not list threads" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const listData = (await listRes.json()) as {
      data: { id: string; user?: string; created_at?: number }[];  
    };

      // ADD THIS TEMPORARILY
    // console.log("[fetch-conversation] threads found:", JSON.stringify(listData.data?.map(t => ({ id: t.id, user: t.user }))));
    // console.log("[fetch-conversation] looking for:", userString);

    const thread =
      listData?.data?.find((t) => t.user === userString) ??
      listData?.data?.[0];

    if (!thread?.id) {
      return new Response(
        JSON.stringify({ ok: true, message_count: 0, note: "No thread yet" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch thread ITEMS via the items sub-endpoint
    const itemsRes = await fetch(
      "https://api.openai.com/v1/chatkit/threads/" + thread.id + "/items?limit=100&order=asc",
      {
        headers: {
          Authorization: "Bearer " + apiKey,
          "OpenAI-Beta": "chatkit_beta=v1",
        },
      }
    );

    const itemsRaw = await itemsRes.text();

    if (!itemsRes.ok) {
      return new Response(JSON.stringify({ error: "Items fetch failed", raw: itemsRaw }), {
        status: itemsRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const itemsData = JSON.parse(itemsRaw) as { data?: ThreadItem[] };
    const items: ThreadItem[] = itemsData?.data ?? [];

    // // Step 3: Save raw JSON (as requested) + clean messages
    // const fileId = qualtrics_id ?? prolific_id ?? session_id;
    // const logDir = path.join(process.cwd(), "logs");
    // if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    // fs.writeFileSync(
    //   path.join(logDir, fileId + ".json"),
    //   JSON.stringify({ session_id, prolific_id, prolific_system_id, qualtrics_id, condition, thread_id: thread.id, items }, null, 2)
    // );

    // Step 3: Save raw JSON — local only, skip in production
    try {
      const fileId = qualtrics_id ?? prolific_id ?? session_id;
      const logDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(
        path.join(logDir, fileId + ".json"),
        JSON.stringify({ session_id, prolific_id, prolific_system_id, qualtrics_id, condition, thread_id: thread.id, items }, null, 2)
      );
    } catch {
      // File system not available in production — skip silently
    }

    // Step 4: ALSO save to Postgres
    // console.log("[fetch-conversation] items count:", items.length);
    for (const item of items) {
      const text = (item.content || [])
        .filter((c) => ["input_text", "output_text", "text"].includes(c.type) && c.text)
        .map((c) => c.text)
        .join(" ")
        .trim();
      // console.log("[fetch-conversation] item:", item.id, "type:", item.type, "role:", item.role, "text length:", text.length);
      if (!text) continue;

      await saveMessageToDB({
        session_id:          session_id,
        thread_id:           thread.id,
        qualtrics_id:        qualtrics_id ?? null,
        prolific_id:         prolific_id ?? null,
        prolific_system_id:  prolific_system_id ?? null,
        condition:           condition ?? null,
        source_url:          source_url ?? null,
        role:                item.type === "chatkit.user_message" ? "user" : "assistant",
        message:             text,
        item_id:             item.id,
        thread_created_at:   thread.created_at ? new Date(thread.created_at * 1000) : null,   // ← ADD
        message_created_at:  item.created_at ? new Date(item.created_at * 1000) : null,        // ← ADD
      });
    }

    return new Response(
      JSON.stringify({ ok: true, message_count: items.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[fetch-conversation] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}