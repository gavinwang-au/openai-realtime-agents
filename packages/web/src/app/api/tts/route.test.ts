import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import { verifyAuthorizationHeader } from "../lib/openauth";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

vi.mock("../lib/openauth", () => ({
  verifyAuthorizationHeader: vi.fn(),
}));

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-polly", () => {
  return {
    PollyClient: vi.fn().mockImplementation(() => ({
      send: sendMock,
    })),
    SynthesizeSpeechCommand: vi.fn().mockImplementation((args) => ({
      input: args,
    })),
  };
});

const mockVerifyAuthorizationHeader = vi.mocked(verifyAuthorizationHeader);

function createRequest(body: any, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthorized requests", async () => {
    mockVerifyAuthorizationHeader.mockResolvedValue({ err: "unauthorized" } as any);

    const response = await POST(
      createRequest({ text: "hello" }, { Authorization: "Bearer test" })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("validates request body", async () => {
    mockVerifyAuthorizationHeader.mockResolvedValue({ userId: "123" } as any);

    const response = await POST(
      createRequest({ text: "   " }, { Authorization: "Bearer test" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing text" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("streams audio from Polly on success", async () => {
    mockVerifyAuthorizationHeader.mockResolvedValue({ userId: "123" } as any);
    const audioBytes = new Uint8Array([1, 2, 3]);
    sendMock.mockResolvedValue({ AudioStream: audioBytes });

    const response = await POST(
      createRequest({ text: " Kia ora " }, { Authorization: "Bearer test" })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const commandArg = sendMock.mock.calls[0][0] as any;
    expect(commandArg.input.Text).toBe("Kia ora");

    const buffer = new Uint8Array(await response.arrayBuffer());
    expect([...buffer]).toEqual([...audioBytes]);
  });
});
