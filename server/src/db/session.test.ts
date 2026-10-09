import { describe, expect, it } from "vitest";
import { transactionsUnsupported } from "./mongoClient.js";
import { sessionOpts } from "./session.js";

describe("transactionsUnsupported", () => {
  it("recognises the standalone mongod rejection", () => {
    expect(
      transactionsUnsupported(
        new Error("Transaction numbers are only allowed on a replica set member or mongos")
      )
    ).toBe(true);
  });

  it("recognises a tier that refuses transactions outright", () => {
    expect(transactionsUnsupported(new Error("Transactions are not supported on this cluster"))).toBe(
      true
    );
  });

  it("does not swallow unrelated failures", () => {
    // A duplicate-key error during a transaction must surface, not silently
    // fall back and leave the writes partially applied.
    expect(
      transactionsUnsupported(new Error("E11000 duplicate key error collection: dangro.friends"))
    ).toBe(false);
    expect(transactionsUnsupported(new Error("not authorized on dangro to perform find"))).toBe(false);
    expect(transactionsUnsupported(new Error("network timeout"))).toBe(false);
    expect(transactionsUnsupported(undefined)).toBe(false);
  });
});

describe("sessionOpts", () => {
  it("always returns an object, since some overloads reject undefined", () => {
    const empty = sessionOpts();
    expect(empty).toEqual({});
    expect(sessionOpts({ returnDocument: "after" })).toEqual({ returnDocument: "after" });
  });

  it("leaves existing options untouched when no transaction is running", () => {
    const options = { limit: 10 };
    expect(sessionOpts(options)).toEqual(options);
    expect(sessionOpts(options)).not.toBe(options);
  });
});