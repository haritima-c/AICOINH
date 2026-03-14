import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

export function initializeSessionLog(
  sessionId: string,
  metadata: {
    prolific_id?: string;
    qualtrics_response_id?: string;
    condition?: string;
  }
) {
  const filePath = path.join(LOG_DIR, `${sessionId}.json`);

  const data = {
    session_id: sessionId,
    metadata,
    messages: []
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function appendMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  const filePath = path.join(LOG_DIR, `${sessionId}.json`);

  const file = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(file);

  data.messages.push({
    timestamp: new Date().toISOString(),
    role,
    content
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}