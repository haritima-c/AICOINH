import fs from "fs";
import path from "path";

export const runtime = "nodejs";

type LogMessage = {
    timestamp: string;
    role: "user" | "assistant";
    message: string;
    session_id: string | null;
    qualtrics_id: string | null;
    prolific_id: string | null;
};

type Conversation = {
    session_id: string | null;
    qualtrics_id: string | null;
    prolific_id: string | null;
    messages: LogMessage[];
};

export async function POST(req: Request) {
    const data = await req.json();
    const entry = normalizeLogEntry(data);

    if (!entry) {
        return new Response(
            JSON.stringify({ error: "Missing valid role/message fields" }),
            {
                status: 400,
                headers: { "Content-Type": "application/json" }
            }
        );
    }

    const logDir = path.join(process.cwd(), "logs");

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    const filePath = path.join(logDir, `${entry.session_id ?? "null"}.json`);

    let conversation: Conversation = {
        session_id: entry.session_id,
        qualtrics_id: entry.qualtrics_id,
        prolific_id: entry.prolific_id,
        messages: []
    };

    if (fs.existsSync(filePath)) {
        conversation = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    conversation.session_id = entry.session_id;
    conversation.qualtrics_id = entry.qualtrics_id;
    conversation.prolific_id = entry.prolific_id;
    conversation.messages.push(entry);

    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));

    return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" }
    });
}

function normalizeLogEntry(data: unknown): LogMessage | null {
    if (!data || typeof data !== "object") {
        return null;
    }

    const record = data as Record<string, unknown>;
    const role = normalizeRole(record.role);
    const message = normalizeMessage(record);

    if (!role || !message) {
        return null;
    }

    return {
        timestamp: normalizeString(record.timestamp) ?? new Date().toISOString(),
        role,
        message,
        session_id:
            normalizeString(record.session_id) ??
            normalizeString(record.qualtrics_id) ??
            normalizeString(record.qualtrics_response_id) ??
            normalizeString(record.prolific_id) ??
            normalizeString(record.prolific) ??
            null,
        qualtrics_id:
            normalizeString(record.qualtrics_id) ??
            normalizeString(record.qualtrics_response_id) ??
            null,
        prolific_id:
            normalizeString(record.prolific_id) ??
            normalizeString(record.prolific) ??
            null
    };
}

function normalizeRole(value: unknown): LogMessage["role"] | null {
    return value === "user" || value === "assistant" ? value : null;
}

function normalizeMessage(record: Record<string, unknown>): string | null {
    const directMessage = normalizeString(record.message);
    if (directMessage) {
        return directMessage;
    }

    const contentMessage = normalizeString(record.content);
    if (contentMessage) {
        return contentMessage;
    }

    return null;
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
