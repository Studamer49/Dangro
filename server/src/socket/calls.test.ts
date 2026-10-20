import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression tests for call authorisation.
 *
 * The bug these cover: every call and WebRTC handler took an arbitrary
 * `targetUserId` and relayed straight to it, with no check that the sender
 * was even in a call with that person. Any authenticated user could end,
 * reject or hijack anyone else's call — and `call_invite` could ring one
 * person indefinitely.
 */

// vi.mock factories are hoisted above module-level declarations, so the
// stub has to be created through vi.hoisted to exist by the time it runs.
const prismaMock = vi.hoisted(() => ({
  block: { findFirst: vi.fn() },
  friend: { findFirst: vi.fn() },
  follow: { findUnique: vi.fn() },
  user: { update: vi.fn() },
}));

vi.mock("../prisma.js", () => ({ prisma: prismaMock, mongoClient: null }));

// Imported statically: vi.mock is hoisted above this, so the mock still
// applies. The package is CommonJS, so a top-level await is not an option.
import { setupSocketHandlers, resetActiveCalls } from "./index.js";

interface Emitted {
  room: string;
  event: string;
  payload: unknown;
}

function fakeSocket(userId: string) {
  const handlers = new Map<string, (payload: unknown, ack?: unknown) => unknown>();
  const rooms = new Set<string>([`user:${userId}`]);
  const emitted: Emitted[] = [];

  return {
    data: { userId },
    rooms,
    /** What this socket sent back to its own client. */
    emitted,
    handshake: { auth: { token: "test" } },
    join: (room: string) => rooms.add(room),
    leave: (room: string) => rooms.delete(room),
    on: (event: string, handler: (payload: unknown, ack?: unknown) => unknown) =>
      handlers.set(event, handler),
    emit: (event: string, payload: unknown) => {
      emitted.push({ room: `socket:${userId}`, event, payload });
    },
    fire: (event: string, payload: unknown, ack?: (response: unknown) => void) =>
      handlers.get(event)?.(payload, ack),
    has: (event: string) => handlers.has(event),
  };
}

function fakeIo() {
  const emitted: Emitted[] = [];
  let onConnection: ((socket: ReturnType<typeof fakeSocket>) => void) | undefined;

  const io = {
    emitted,
    use: () => undefined,
    on: (event: string, cb: (socket: ReturnType<typeof fakeSocket>) => void) => {
      if (event === "connection") onConnection = cb;
    },
    to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }),
    in: () => ({ fetchSockets: async () => [] as Array<{ rooms: Set<string> }> }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
    connect: (socket: ReturnType<typeof fakeSocket>) => onConnection?.(socket),
  };

  return io;
}

/** Makes `from` and `to` friends, which is what authorises a call. */
function asFriends() {
  prismaMock.friend.findFirst.mockResolvedValue({ id: "edge-1" });
  prismaMock.follow.findUnique.mockResolvedValue(null);
}

/** Makes them strangers: no friendship, no follow. */
function asStrangers() {
  prismaMock.friend.findFirst.mockResolvedValue(null);
  prismaMock.follow.findUnique.mockResolvedValue(null);
}

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const ATTACKER = "cccccccc-3333-4333-8333-333333333333";

let roomSeq = 0;
const nextRoom = () => `call_test_${roomSeq++}`;

beforeEach(() => {
  roomSeq = 0;
  vi.clearAllMocks();
  // Live calls are held in module state, so they have to be cleared between
  // cases or one test's call authorises the next test's signalling.
  resetActiveCalls();
  prismaMock.user.update.mockResolvedValue({});
  // Nobody is blocked by default; a case that cares overrides this.
  prismaMock.block.findFirst.mockResolvedValue(null);
});

describe("call_invite", () => {
  it("is relayed between friends", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });

    expect(io.emitted).toContainEqual(
      expect.objectContaining({ event: "call_invite", room: `user:${B}` })
    );
  });

  it("is dropped when the two are not allowed to contact each other", async () => {
    asStrangers();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: ATTACKER, callType: "voice", roomId: nextRoom() });

    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(0);
  });

  it("cannot be used to ring one person repeatedly", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    for (let i = 0; i < 8; i += 1) {
      await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });
    }

    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(5);
  });

  it("cannot be used to ring yourself", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: A, callType: "voice", roomId: nextRoom() });

    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(0);
  });
});

describe("call_end", () => {
  it("cannot tear down a call the sender is not part of", async () => {
    // The regression: any socket could end any other user's call by id.
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const attacker = fakeSocket(ATTACKER);
    io.connect(a);
    io.connect(attacker);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
    io.emitted.length = 0;

    await attacker.fire("call_end", { targetUserId: B });

    expect(io.emitted.filter((e) => e.event === "call_end")).toHaveLength(0);
  });

  it("cannot tear down a call that does not exist", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_end", { targetUserId: B });

    expect(io.emitted.filter((e) => e.event === "call_end")).toHaveLength(0);
  });

  it("ends a call the sender is actually part of", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId: nextRoom() });
    io.emitted.length = 0;

    await a.fire("call_end", { targetUserId: B });

    expect(io.emitted).toContainEqual(
      expect.objectContaining({ event: "call_end", room: `user:${B}` })
    );
  });

  it("stops relaying signalling once the call is over", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId: nextRoom() });
    await a.fire("call_end", { targetUserId: B });
    io.emitted.length = 0;

    await a.fire("ice_candidate", { targetUserId: B, signal: { candidate: "x" } });

    expect(io.emitted.filter((e) => e.event === "ice_candidate")).toHaveLength(0);
  });
});

describe("call_reject", () => {
  it("cannot reject a call the sender is not part of", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const attacker = fakeSocket(ATTACKER);
    io.connect(a);
    io.connect(attacker);

    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId: nextRoom() });
    io.emitted.length = 0;

    await attacker.fire("call_reject", { targetUserId: B });

    expect(io.emitted.filter((e) => e.event === "call_reject")).toHaveLength(0);
  });
});

describe("call_accept", () => {
  it("is only accepted by the user who was invited", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const attacker = fakeSocket(ATTACKER);
    io.connect(a);
    io.connect(attacker);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
    io.emitted.length = 0;

    await attacker.fire("call_accept", { targetUserId: A, roomId });

    expect(io.emitted.filter((e) => e.event === "call_accept")).toHaveLength(0);
  });
});

describe("WebRTC signalling", () => {
  it("is dropped when the two are not in a call together", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    for (const event of ["webrtc_offer", "webrtc_answer", "ice_candidate"]) {
      await a.fire(event, { targetUserId: B, signal: { sdp: "x" } });
    }

    expect(io.emitted.filter((e) => e.event.startsWith("webrtc_") || e.event === "ice_candidate")).toHaveLength(0);
  });

  it("is relayed between the two participants", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId: nextRoom() });
    io.emitted.length = 0;

    await a.fire("webrtc_offer", { targetUserId: B, signal: { sdp: "x" } });
    await a.fire("ice_candidate", { targetUserId: B, signal: { candidate: "y" } });

    expect(io.emitted.filter((e) => e.event === "webrtc_offer")).toHaveLength(1);
    expect(io.emitted.filter((e) => e.event === "ice_candidate")).toHaveLength(1);
  });
});

describe("voice_signal", () => {
  it("is dropped when the sender is not in a voice room", async () => {
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("voice_signal", { targetUserId: B, signal: { sdp: "x" } });

    expect(io.emitted.filter((e) => e.event === "voice_signal")).toHaveLength(0);
  });
});

describe("async handler failures", () => {
  /**
   * Every async listener is wrapped so a rejected database call cannot escape
   * as an unhandled rejection. Socket.IO does not await listeners, and the
   * global `unhandledRejection` handler only logs — so without the wrapper the
   * event vanished with no reply and the socket stayed half-joined.
   */
  it("reports the failure to the client instead of rejecting", async () => {
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    prismaMock.friend.findFirst.mockRejectedValueOnce(new Error("db is down"));
    prismaMock.follow.findUnique.mockResolvedValue(null);

    // Resolves rather than rejecting: an escaped rejection would be swallowed
    // by the process-level handler with no reply at all.
    await expect(
      a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() })
    ).resolves.toBeUndefined();

    expect(a.emitted).toContainEqual(
      expect.objectContaining({ event: "error", payload: { message: "Request failed" } })
    );
    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(0);
  });

  it("leaves the connection usable after a failed event", async () => {
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    prismaMock.friend.findFirst.mockRejectedValueOnce(new Error("db is down"));
    prismaMock.follow.findUnique.mockResolvedValue(null);
    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });

    asFriends();
    io.emitted.length = 0;
    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });

    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(1);
  });
});

/** Captures the acknowledgement an event handler sends back to its emitter. */
async function ackOf(
  socket: ReturnType<typeof fakeSocket>,
  event: string,
  payload: unknown
): Promise<{ ok?: boolean; reason?: string }> {
  let response: { ok?: boolean; reason?: string } | undefined;
  await socket.fire(event, payload, (reply) => {
    response = reply as { ok?: boolean; reason?: string };
  });
  return response ?? {};
}

describe("invite acknowledgement", () => {
  it("tells the caller when they are not allowed to ring", async () => {
    asStrangers();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    const reply = await ackOf(a, "call_invite", {
      targetUserId: B,
      callType: "voice",
      roomId: nextRoom(),
    });

    // The old behaviour dropped the invite in silence, so the caller rang at
    // a screen nobody was ever going to answer.
    expect(reply).toEqual({ ok: false, reason: "unavailable" });
  });

  it("tells the caller when the callee is already in another call", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const c = fakeSocket(ATTACKER);
    io.connect(a);
    io.connect(c);

    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });
    const reply = await ackOf(c, "call_invite", {
      targetUserId: B,
      callType: "voice",
      roomId: nextRoom(),
    });

    expect(reply).toEqual({ ok: false, reason: "busy" });
  });

  it("reuses the first room when the caller rings the same person twice", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId });
    // A double tap minted a second room id that was never registered, so the
    // callee's accept landed on nothing and both sides hung.
    const reply = await ackOf(a, "call_invite", {
      targetUserId: B,
      callType: "voice",
      roomId: nextRoom(),
    });

    expect(reply).toEqual({ ok: true });
    const invites = io.emitted.filter((e) => e.event === "call_invite");
    expect(invites).toHaveLength(2);
    expect(invites[1].payload).toEqual(expect.objectContaining({ roomId }));
  });
});

describe("ring timeout", () => {
  it("tells both sides when nobody answers, and stops relaying", async () => {
    asFriends();
    vi.useFakeTimers();
    try {
      const io = fakeIo();
      setupSocketHandlers(io as never);
      const a = fakeSocket(A);
      io.connect(a);

      await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });
      io.emitted.length = 0;

      // The callee's client auto-declines after 30s on its own; this fires
      // when it never saw the invite at all.
      vi.advanceTimersByTime(41_000);

      expect(io.emitted.filter((e) => e.event === "call_timeout")).toHaveLength(2);
      expect(io.emitted.map((e) => e.room)).toEqual(expect.arrayContaining([`user:${A}`, `user:${B}`]));

      await a.fire("ice_candidate", { targetUserId: B, signal: { candidate: "x" } });
      expect(io.emitted.filter((e) => e.event === "ice_candidate")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fire once the call was answered", async () => {
    asFriends();
    vi.useFakeTimers();
    try {
      const io = fakeIo();
      setupSocketHandlers(io as never);
      const a = fakeSocket(A);
      const b = fakeSocket(B);
      io.connect(a);
      io.connect(b);

      const roomId = nextRoom();
      await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
      const accept = await ackOf(b, "call_accept", { targetUserId: A, roomId });
      expect(accept).toEqual({ ok: true });

      io.emitted.length = 0;
      vi.advanceTimersByTime(41_000);

      expect(io.emitted.filter((e) => e.event === "call_timeout")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("call_accept acknowledgement", () => {
  it("refuses an accept for a room the caller already left", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const b = fakeSocket(B);
    io.connect(a);
    io.connect(b);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
    await a.fire("call_end", { targetUserId: B });
    io.emitted.length = 0;

    // Without this refusal the callee sat at "Connecting…" forever, waiting
    // for an offer the caller would never send.
    const reply = await ackOf(b, "call_accept", { targetUserId: A, roomId });
    expect(reply).toEqual({ ok: false, reason: "gone" });
    expect(io.emitted.filter((e) => e.event === "call_accept")).toHaveLength(0);
  });

  it("lets only the first device win the race", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const b = fakeSocket(B);
    const bSecondDevice = fakeSocket(B);
    io.connect(a);
    io.connect(b);
    io.connect(bSecondDevice);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
    io.emitted.length = 0;

    const first = await ackOf(b, "call_accept", { targetUserId: A, roomId });
    const second = await ackOf(bSecondDevice, "call_accept", { targetUserId: A, roomId });

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: "gone" });
    // The caller must receive exactly one offer's worth of "go ahead".
    expect(io.emitted.filter((e) => e.event === "call_accept")).toHaveLength(1);
    // And the winning device's siblings are told to stop ringing.
    expect(io.emitted.filter((e) => e.event === "call_accepted")).toHaveLength(1);
  });
});

describe("participant disconnect", () => {
  it("ends an answered call for the peer when the last device drops", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const b = fakeSocket(B);
    io.connect(a);
    io.connect(b);

    const roomId = nextRoom();
    await a.fire("call_invite", { targetUserId: B, callType: "video", roomId });
    await b.fire("call_accept", { targetUserId: A, roomId });
    io.emitted.length = 0;

    // The peer used to be left in a call that could never be signalled
    // again: no hang-up, no candidates, just a frozen screen.
    b.fire("disconnect", undefined);

    expect(io.emitted).toContainEqual(
      expect.objectContaining({ event: "call_end", room: `user:${A}` })
    );
  });

  it("reports an unanswered ring as timed out for the caller", async () => {
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    const b = fakeSocket(B);
    io.connect(a);
    io.connect(b);

    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });
    io.emitted.length = 0;

    b.fire("disconnect", undefined);

    expect(io.emitted).toContainEqual(
      expect.objectContaining({ event: "call_timeout", room: `user:${A}` })
    );
  });
});