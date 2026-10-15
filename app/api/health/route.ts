import { getDatabase } from "../../runtime";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 16)
      throw Error("ADMIN_PASSWORD must contain at least 16 characters");
    const configured = process.env.PUBLIC_ORIGIN;
    if (configured) {
      const origin = new URL(configured);
      if (
        !["http:", "https:"].includes(origin.protocol) ||
        origin.origin !== configured
      )
        throw Error(
          "PUBLIC_ORIGIN must be an exact origin without path, credentials or trailing slash",
        );
    }
    getDatabase().prepare("SELECT 1 AS healthy").get();
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
