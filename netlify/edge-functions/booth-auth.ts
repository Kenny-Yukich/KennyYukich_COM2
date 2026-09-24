// Password gate for the POOVLOV booth page. Runs on Netlify's edge before
// anything under /booth is served, so the page's JS and CSS are covered too.
// The password lives in the BOOTH_PASSWORD environment variable in Netlify,
// never in this repo. Any username is accepted; only the password is checked.

const REALM = "POOVLOV booth";

function unauthorized(): Response {
  return new Response("Password required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });
}

// Compare without bailing early, so response timing doesn't leak the password.
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const password = Netlify.env.get("BOOTH_PASSWORD");

  // Fail closed: if the variable isn't set, keep the page locked.
  if (!password) {
    return new Response("This page is not available yet.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return unauthorized();

  let decoded: string;
  try {
    decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
    );
  } catch {
    return unauthorized();
  }

  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (!safeEqual(given, password)) return unauthorized();

  const response = await context.next();
  // Keep shared caches from storing the protected page.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export const config = { path: ["/booth", "/booth/*"] };
