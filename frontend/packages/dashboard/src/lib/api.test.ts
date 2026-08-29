import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request, setAccessToken } from "./api";
import { errorMessage } from "./errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("request error path", () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setAccessToken(null);
  });

  it("throws an ApiError carrying the status and the server detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(403, { detail: "insufficient role" })),
    );

    await expect(request("/api/v1/policy")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      detail: "insufficient role",
    });
  });

  it("keeps a structured detail intact so callers can branch on it", async () => {
    const detail = {
      code: "org_selection_required",
      organizations: [{ id: "1" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(409, { detail })),
    );

    const err = await request("/api/v1/auth/login", {
      method: "POST",
      skipAuth: true,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).detail).toEqual(detail);
  });

  it("falls back to the status text when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502 })),
    );

    const err = (await request("/api/v1/events/analytics").catch(
      (e: unknown) => e,
    )) as ApiError;
    expect(err.status).toBe(502);
    expect(typeof err.detail).toBe("string");
  });

  it("returns undefined for a 204 rather than trying to parse an empty body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(
      request("/api/v1/auth/logout", { method: "POST" }),
    ).resolves.toBeUndefined();
  });

  it("retries once with a refreshed token after a 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { detail: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    setAccessToken("stale-token");

    await expect(request<{ ok: boolean }>("/api/v1/members")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const replayCall = fetchMock.mock.calls[2] as unknown[] | undefined;
    const replayHeaders = (replayCall?.[1] as RequestInit | undefined)
      ?.headers as Record<string, string> | undefined;
    expect(replayHeaders?.["Authorization"]).toBe("Bearer fresh-token");
  });

  it("does not attempt a refresh for a request that opted out of auth", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { detail: "invalid credentials" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      request("/api/v1/auth/login", { method: "POST", skipAuth: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('drops undefined query values instead of sending the string "undefined"', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, []));
    vi.stubGlobal("fetch", fetchMock);

    await request("/api/v1/quarantine", {
      query: { status: undefined, limit: 100 },
    });
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(String(firstCall?.[0])).toMatch(/\/api\/v1\/quarantine\?limit=100$/);
  });
});

describe("errorMessage", () => {
  it("uses the server string when there is one", () => {
    expect(errorMessage(new ApiError(403, "insufficient role"))).toBe(
      "insufficient role",
    );
  });

  it("flattens a FastAPI validation array into something a person can act on", () => {
    const err = new ApiError(422, [
      {
        loc: ["body", "password"],
        msg: "String should have at least 12 characters",
      },
    ]);
    expect(errorMessage(err)).toBe(
      "password: String should have at least 12 characters",
    );
  });

  it("never renders an object as [object Object]", () => {
    const err = new ApiError(409, { code: "org_selection_required" });
    expect(errorMessage(err)).toBe("org_selection_required");
    expect(errorMessage(new ApiError(500, {}))).not.toContain(
      "[object Object]",
    );
  });

  it("has a readable fallback for every common status", () => {
    expect(errorMessage(new ApiError(401, {}))).toMatch(/session/i);
    expect(errorMessage(new ApiError(429, {}))).toMatch(/too many/i);
    expect(errorMessage(new ApiError(418, {}))).toBe("Request failed (418).");
  });

  it("handles a plain network Error and an unknown throw", () => {
    expect(errorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(errorMessage("nope", "fallback")).toBe("fallback");
  });
});
