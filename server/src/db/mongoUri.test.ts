import { describe, expect, it } from "vitest";
import { describeMongoUri, explainMongoError, redactMongoUri } from "./mongoUri.js";

describe("redactMongoUri", () => {
  it("never lets the password reach a log line", () => {
    const redacted = redactMongoUri("mongodb+srv://dangro:sup3rSecret@ab1.x.mongodb.net/?retryWrites=true");
    expect(redacted).not.toContain("sup3rSecret");
    expect(redacted).toBe("mongodb+srv://dangro:***@ab1.x.mongodb.net/?retryWrites=true");
  });

  it("leaves a URI without credentials alone", () => {
    expect(redactMongoUri("mongodb://127.0.0.1:27017")).toBe("mongodb://127.0.0.1:27017");
  });
});

describe("describeMongoUri", () => {
  it("reports what the URI actually selects", () => {
    const described = describeMongoUri(
      "mongodb+srv://dangro:p%40ss@ab1.x.mongodb.net/dangro?retryWrites=true&w=majority"
    );

    expect(described.user).toBe("dangro");
    expect(described.host).toBe("ab1.x.mongodb.net");
    expect(described.database).toBe("dangro");
    expect(described.authSource).toBeNull();
  });

  it("reports no database when the path is empty, since authSource then defaults to admin", () => {
    const described = describeMongoUri("mongodb+srv://dangro:pw@ab1.x.mongodb.net/?w=majority");
    expect(described.database).toBeNull();
    expect(described.authSource).toBeNull();
  });

  it("picks up an explicit authSource", () => {
    const described = describeMongoUri("mongodb://dangro:pw@127.0.0.1:27017/dangro?authSource=admin");
    expect(described.authSource).toBe("admin");
  });
});

describe("explainMongoError", () => {
  it("turns an auth failure into something actionable", () => {
    const notes = explainMongoError(new Error("MongoServerError: bad auth : authentication failed"));
    expect(notes.join(" ")).toMatch(/username or password/i);
    expect(notes.join(" ")).toMatch(/percent-encoded/i);
  });

  it("distinguishes an unreachable cluster from bad credentials", () => {
    const notes = explainMongoError(new Error("MongoServerSelectionError: connect ECONNREFUSED"));
    expect(notes.join(" ")).toMatch(/could not reach/i);
  });

  it("says nothing for unrelated failures", () => {
    expect(explainMongoError(new Error("disk full"))).toEqual([]);
  });
});