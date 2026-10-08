import { describe, expect, it } from "vitest";
import { cleanGithubInput, isGithubUsername } from "./players";

describe("GitHub usernames", () => {
  it("accepts real usernames", () => {
    for (const name of ["TWadi", "GhassenJamoussi99", "bravo421", "omar-dev", "a", "x".repeat(39)]) {
      expect(isGithubUsername(name)).toBe(true);
    }
  });

  it("rejects what GitHub rejects", () => {
    for (const name of ["", "-omar", "omar-", "om--ar", "om ar", "omar_dev", "x".repeat(40), "o'mar"]) {
      expect(isGithubUsername(name)).toBe(false);
    }
  });

  it("cleans pasted handles and profile links", () => {
    expect(cleanGithubInput("  @omar-dev ")).toBe("omar-dev");
    expect(cleanGithubInput("https://github.com/omar-dev")).toBe("omar-dev");
    expect(cleanGithubInput("https://www.github.com/omar-dev/some-repo")).toBe("omar-dev");
    expect(cleanGithubInput("omar")).toBe("omar");
  });
});
