export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}