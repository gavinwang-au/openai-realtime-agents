import { createClient } from "@openauthjs/openauth/client";
import { subjects, type UserSubject } from "@openai-realtime-agents/shared/auth";

const ISSUER_URL = process.env.AUTH_ISSUER_URL;
const API_CLIENT_ID = process.env.AUTH_API_CLIENT_ID ?? "jwt-api";

if (!ISSUER_URL) {
  throw new Error("AUTH_ISSUER_URL is not defined");
}

export const authClient = createClient({
  clientID: API_CLIENT_ID,
  issuer: ISSUER_URL,
});

type AuthorizationVerificationResult =
  | { err: Error }
  | { subject: UserSubject; token: string };

export async function verifyAuthorizationHeader(
  authorization?: string | null,
): Promise<AuthorizationVerificationResult> {
  if (!authorization?.startsWith("Bearer ")) {
    return { err: new Error("Unauthorized") };
  }

  const token = authorization.slice("Bearer ".length).trim();

  try {
    const verified = await authClient.verify(subjects, token);

    if (verified.err) {
      return { err: new Error("Unauthorized") };
    }

    return {
      subject: verified.subject,
      token,
    };
  } catch (err) {
    console.error("Failed to verify access token", err);
    return { err: new Error("Unauthorized") };
  }
}
