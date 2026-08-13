import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("dashboard API client", () => {
  it("keeps access tokens in memory and sends bearer authentication", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./api");
    api.setAccessToken("access-token");

    await api.request<{ ok: boolean }>("/api/v1/example");

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("include");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer access-token",
    });
  });

  it("deduplicates concurrent refreshes and retries with the rotated session", async () => {
    vi.useFakeTimers();
    let refreshCalls = 0;
    const protectedCalls = new Map<string, number>();
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/refresh")) {
        refreshCalls += 1;
        return new Response(
          JSON.stringify({ access_token: "rotated-access" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      const callCount = protectedCalls.get(url) ?? 0;
      protectedCalls.set(url, callCount + 1);
      if (callCount === 0) return new Response(null, { status: 401 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = await import("./api");
    api.setAccessToken("expired-access");

    const results = await Promise.all([
      api.request<{ ok: boolean }>("/api/v1/one"),
      api.request<{ ok: boolean }>("/api/v1/two"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
    expect(api.getAccessToken()).toBe("rotated-access");
  });
});
