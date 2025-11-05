import { createHash } from "node:crypto";
import { issuer } from "@openauthjs/openauth";
// import { CodeUI } from "@openauthjs/openauth/ui/code";
// import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { handle } from "hono/aws-lambda";
import { subjects } from "@openai-realtime-agents/shared/auth";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const createUserIdentity = (email: string) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("Email is required");
  }
  return {
    normalized,
    id: createHash("sha256").update(normalized).digest("hex"),
  };
};

const getStorage = () => {
  if (process.env.OPENAUTH_STORAGE || process.env.LAMBDA_TASK_ROOT) {
    return undefined;
  }

  return MemoryStorage({
    persist: "./persist.json",
  });
};

const storage = getStorage();

const app = issuer({
  subjects,
  ...(storage ? { storage } : {}),
  // Remove after setting custom domain
  allow: async () => true,
  providers: {
    // code: CodeProvider(
    //   CodeUI({
    //      copy: {
    //       code_info: "We'll send a pin code to your email"
    //     },
    //     sendCode: async (email, code) => {
    //       console.log(email, code);
    //     },
    //   }),
    // ),
    password: PasswordProvider(
      PasswordUI({
        sendCode: async (email, code) => {
          console.log(`Password verification`, {
            target: email,
            code,
            timestamp: new Date().toISOString(),
          });
        },
      }),
    ),
  },
  success: async (ctx, value) => {
    if (value.provider === "password") {
      const { id } = createUserIdentity(value.email);
      return ctx.subject("user", {
        id,
      });
    }
    throw new Error("Invalid provider");
  },
});

export const handler = handle(app);
