import { createHash } from "node:crypto";
import { issuer } from "@openauthjs/openauth";
// import { CodeUI } from "@openauthjs/openauth/ui/code";
// import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { handle } from "hono/aws-lambda";
import { cors } from "hono/cors";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { subjects } from "@openai-realtime-agents/shared/auth";

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
      const { id, normalized } = createUserIdentity(value.email);
      return ctx.subject("user", {
        id,
        email: normalized,
      });
    }
    throw new Error("Invalid provider");
  },
});

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["*"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: false,
  }),
);

export const handler = handle(app);
