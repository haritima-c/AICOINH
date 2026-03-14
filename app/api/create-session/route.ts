/* eslint-disable */
// @ts-nocheck

import { WORKFLOW_ID } from "@/lib/config";

export const runtime = "edge";

interface CreateSessionRequestBody {
  workflow?: { id?: string | null } | null;
  workflowId?: string | null;
  session?: {
    metadata?: {
      prolific_id?: string | null;
      qualtrics_response_id?: string | null;
    } | null;
  } | null;
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean;
    };
  } | null;
}

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";

export async function POST(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse();
  }

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "Missing OPENAI_API_KEY environment variable" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (!resolvedWorkflowId) {
      return new Response(
        JSON.stringify({ error: "Missing workflow id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const requestProlificId =
      parsedBody?.session?.metadata?.prolific_id?.trim() || "";
    const requestQualtricsId =
      parsedBody?.session?.metadata?.qualtrics_response_id?.trim() || "";

    let user = "anonymous-user";
    let uid = requestQualtricsId;
    let prolific = requestProlificId;
    let prolificSystemId = "NA";
    let condition = "NA";

    const referer = request.headers.get("referer") || "";

    if (!uid && !prolific) {
      try {
        const url = new URL(referer);
        uid = url.searchParams.get("qualtricsId") || "";
        prolific = url.searchParams.get("prolificId") || "";
        prolificSystemId = url.searchParams.get("prolificSystemId") || "NA";
        condition = url.searchParams.get("cond") || "NA";
      } catch {
        // if Referer is missing or malformed, keep user = "anonymous-user"
      }
    } else {
      try {
        const url = new URL(referer);
        prolificSystemId = url.searchParams.get("prolificSystemId") || "NA";
        condition = url.searchParams.get("cond") || "NA";
      } catch {
        // keep default condition when Referer is missing or malformed
      }
    }

    if (uid || prolific) {
      user = `uid:${uid || "NA"};prolific:${prolific || "NA"};prolificSystemId:${prolificSystemId};cond:${condition}`;
    }

    // Log participant-session mapping
    console.log({ uid, prolific, prolificSystemId, condition });

    const payload: Record<string, unknown> = {
      user,
      workflow: { id: resolvedWorkflowId },
      chatkit_configuration: {
        file_upload: {
          enabled:
            parsedBody?.chatkit_configuration?.file_upload?.enabled ?? false,
        },
        automatic_thread_titling: {
          enabled: false, 
    },
      },
    };

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const upstreamResponse = await fetch(`${apiBase}/v1/chatkit/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify(payload),
    });

    const upstreamJson = (await upstreamResponse.json().catch(() => ({}))) as
      | Record<string, unknown>
      | undefined;

    if (!upstreamResponse.ok) {
      const upstreamError = extractUpstreamError(upstreamJson);
      return new Response(
        JSON.stringify({
          error:
            upstreamError ??
            `Failed to create session: ${upstreamResponse.statusText}`,
          details: upstreamJson,
        }),
        {
          status: upstreamResponse.status,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const clientSecret = upstreamJson?.client_secret ?? null;
    const expiresAfter = upstreamJson?.expires_after ?? null;
    const sessionId = upstreamJson?.id ?? null;

    return new Response(
      JSON.stringify({
        client_secret: clientSecret,
        expires_after: expiresAfter,
        session_id: sessionId,
        qualtrics_id: uid || null,
        prolific_id: prolific || null,
        prolific_system_id: prolificSystemId !== "NA" ? prolificSystemId : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create session error", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET(): Promise<Response> {
  return methodNotAllowedResponse();
}

function methodNotAllowedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Method Not Allowed" }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function extractUpstreamError(
  payload: Record<string, unknown> | undefined
): string | null {
  if (!payload) return null;

  const error = payload.error;
  if (typeof error === "string") return error;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  const details = payload.details;
  if (typeof details === "string") return details;

  if (details && typeof details === "object" && "error" in details) {
    const nestedError = (details as { error?: unknown }).error;
    if (typeof nestedError === "string") return nestedError;
    if (
      nestedError &&
      typeof nestedError === "object" &&
      "message" in nestedError &&
      typeof (nestedError as { message?: unknown }).message === "string"
    ) {
      return (nestedError as { message: string }).message;
    }
  }

  if (typeof payload.message === "string") return payload.message;

  return null;
}