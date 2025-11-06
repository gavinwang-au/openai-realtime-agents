import { createClient } from "@openauthjs/openauth/client";
import { subjects } from "@openai-realtime-agents/shared/auth";

const ISSUER_URL = process.env.AUTH_ISSUER_URL;
const API_CLIENT_ID = process.env.AUTH_API_CLIENT_ID ?? "jwt-api";

if (!ISSUER_URL) {
  throw new Error("AUTH_ISSUER_URL is not defined");
}

export const authClient = createClient({
  clientID: API_CLIENT_ID,
  issuer: ISSUER_URL,
});

export async function verifyAuthorizationHeader(
  authorization?: string | null,
) {
  if (!authorization?.startsWith("Bearer ")) {
    return { err: new Error("Unauthorized") } as const;
  }

  const token = authorization.slice("Bearer ".length).trim();
  let verified: Awaited<ReturnType<typeof authClient.verify>>;

  try {
    verified = await authClient.verify(subjects, token);
  } catch (err) {
    console.error("Failed to verify access token", err);
    return { err: new Error("Unauthorized") } as const;
  }

  if (verified.err) {
    return { err: new Error("Unauthorized") } as const;
  }

  return {
    subject: verified.subject,
    token,
  } as const;
}
