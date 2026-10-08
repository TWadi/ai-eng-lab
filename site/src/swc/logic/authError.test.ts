import { describe, expect, it } from "vitest";
import { readAuthError } from "./authError";

describe("readAuthError", () => {
  it("reads the error from the query string", () => {
    expect(readAuthError("?error=server_error&error_description=Unable+to+exchange+external+code", ""))
      .toBe("Sign-in failed: Unable to exchange external code");
  });

  it("falls back to the hash", () => {
    expect(readAuthError("", "#error_description=Access%20denied")).toBe("Sign-in failed: Access denied");
  });

  it("returns null when there is no error", () => {
    expect(readAuthError("", "")).toBeNull();
    expect(readAuthError("?foo=bar", "#section")).toBeNull();
  });
});
