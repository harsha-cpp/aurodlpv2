import { describe, expect, it } from "vitest";
import {
  channelCounts,
  channelSplitLabel,
  describeWhere,
  GMAIL_LABEL,
  siteLabel,
  UNKNOWN_SITE_LABEL,
} from "./channel";

describe("siteLabel", () => {
  it("passes a plain hostname through", () => {
    expect(siteLabel("chatgpt.com")).toBe("chatgpt.com");
  });

  it("strips the scheme, the path and a bare www", () => {
    expect(siteLabel("https://www.chatgpt.com/c/123")).toBe("chatgpt.com");
    expect(siteLabel("WWW.Claude.AI")).toBe("claude.ai");
  });

  it("keeps subdomains that carry meaning", () => {
    expect(siteLabel("docs.google.com")).toBe("docs.google.com");
  });

  it("names the missing case instead of rendering blank", () => {
    expect(siteLabel(null)).toBe(UNKNOWN_SITE_LABEL);
    expect(siteLabel(undefined)).toBe(UNKNOWN_SITE_LABEL);
    expect(siteLabel("   ")).toBe(UNKNOWN_SITE_LABEL);
  });
});

describe("describeWhere", () => {
  it("says Gmail for an email scan, in prose rather than mono", () => {
    expect(describeWhere("email", null)).toEqual({
      text: GMAIL_LABEL,
      mono: false,
    });
  });

  it("treats a missing channel as email, not as an unknown surface", () => {
    expect(describeWhere(undefined, undefined)).toEqual({
      text: GMAIL_LABEL,
      mono: false,
    });
    expect(describeWhere(null, null).text).toBe(GMAIL_LABEL);
    expect(describeWhere("", null).text).toBe(GMAIL_LABEL);
  });

  it("sets a web scan to its hostname, in mono", () => {
    expect(describeWhere("web", "chatgpt.com")).toEqual({
      text: "chatgpt.com",
      mono: true,
    });
  });

  it("falls back to prose when a web scan reported no host", () => {
    expect(describeWhere("web", null)).toEqual({
      text: UNKNOWN_SITE_LABEL,
      mono: false,
    });
  });

  it("reports an unknown channel in sentence case rather than guessing Gmail", () => {
    expect(describeWhere("slack", null)).toEqual({
      text: "Slack",
      mono: false,
    });
  });

  it("never shouts an enum value", () => {
    for (const channel of ["email", "web", "slack", ""]) {
      expect(describeWhere(channel, "chatgpt.com").text).not.toMatch(
        /^[A-Z]{2,}$/,
      );
    }
  });
});

describe("channelCounts", () => {
  it("reads both channels off the payload", () => {
    expect(channelCounts({ email: 142, web: 18 })).toEqual({
      email: 142,
      web: 18,
    });
  });

  it("defaults to zero when the API predates the field", () => {
    expect(channelCounts(undefined)).toEqual({ email: 0, web: 0 });
    expect(channelCounts(null)).toEqual({ email: 0, web: 0 });
    expect(channelCounts({})).toEqual({ email: 0, web: 0 });
  });

  it("refuses nonsense values rather than rendering NaN", () => {
    expect(channelCounts({ email: Number.NaN, web: -4 })).toEqual({
      email: 0,
      web: 0,
    });
  });
});

describe("channelSplitLabel", () => {
  it("reads as a stat sub-line", () => {
    expect(channelSplitLabel({ email: 142, web: 18 })).toBe(
      "142 email - 18 web",
    );
  });

  it("still names a channel that saw nothing, so the split stays legible", () => {
    expect(channelSplitLabel({ email: 142, web: 0 })).toBe("142 email - 0 web");
  });

  it("is null when there is nothing to split", () => {
    expect(channelSplitLabel(undefined)).toBeNull();
    expect(channelSplitLabel(null)).toBeNull();
    expect(channelSplitLabel({ email: 0, web: 0 })).toBeNull();
  });
});
