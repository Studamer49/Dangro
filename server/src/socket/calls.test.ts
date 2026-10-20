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
/**
 * `block` is part of the contact gate in `canContact` (socket/index.ts): a
 * block in either direction stops a call. Without it here the handler threw
 * `Cannot read properties of undefined (reading 'findFirst')`, which the
 * socket layer swallows into a log line, so every call test failed with an
 * empty `emitted` array instead of an error that named the missing model.
 */
const prismaMock = vi.hoisted(() => ({
  friend: { findFirst: vi.fn() },
  follow: { findUnique: vi.fn() },
  block: { findFirst: vi.fn() },
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
  const handlers = new Map<string, (payload: unknown) => unknown>();
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
    on: (event: string, handler: (payload: unknown) => unknown) => handlers.set(event, handler),
    emit: (event: string, payload: unknown) => {
      emitted.push({ room: `socket:${userId}`, event, payload });
    },
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
    has: (event: string) => handlers.has(event),
  };
}

function fakeIo() {
  const emitted: Emitted[] = [];
  let onConnection: ((socket: ReturnType<typeof fakeSocket>) => void) | undefined;

  /**
   * Presence has to be modelled, not stubbed away. `call_invite` asks
   * `fetchSockets()` whether the callee is home and, if nobody is, deletes
   * the call it just registered (socket/index.ts). Returning a hardcoded `[]`
   * told every call it was made into the void, so the call was torn down
   * before the test could send `call_end` or any WebRTC signal — which is why
   * those cases failed with an empty `emitted` array.
   */
  const connected: Array<ReturnType<typeof fakeSocket>> = [];

  const io = {
    emitted,
    use: () => undefined,
    on: (event: string, cb: (socket: ReturnType<typeof fakeSocket>) => void) => {
      if (event === "connection") onConnection = cb;
    },
    to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }),
    in: (room: string) => ({
      fetchSockets: async () => connected.filter((s) => s.rooms.has(room)),
    }),
    sockets: { adapter: { rooms: new Map<string, Set<string>>() } },
    connect: (socket: ReturnType<typeof fakeSocket>) => {
      connected.push(socket);
      onConnection?.(socket);
    },
  };

  return io;
}

/** Makes `from` and `to` friends, which is what authorises a call. */
function asFriends() {
  prismaMock.friend.findFirst.mockResolvedValue({ id: "edge-1" });
  prismaMock.follow.findUnique.mockResolvedValue(null);
  prismaMock.block.findFirst.mockResolvedValue(null);
}

/** Makes them strangers: no friendship, no follow. */
function asStrangers() {
  prismaMock.friend.findFirst.mockResolvedValue(null);
  prismaMock.follow.findUnique.mockResolvedValue(null);
  prismaMock.block.findFirst.mockResolvedValue(null);
}

/** Friends, but one has blocked the other. */
function asBlocked() {
  prismaMock.friend.findFirst.mockResolvedValue({ id: "edge-1" });
  prismaMock.follow.findUnique.mockResolvedValue(null);
  prismaMock.block.findFirst.mockResolvedValue({ id: "block-1" });
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
  // `mockClear` keeps implementations, so a default here is what stops a test
  // that forgets to pick a relationship from inheriting the previous one's
  // `block` result.
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

  it("is dropped when either side has blocked the other", async () => {
    // Friendship alone must not authorise the call: a blocker who is still a
    // friend would otherwise be reachable by ringing them instead of DMing.
    asBlocked();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });

    expect(io.emitted.filter((e) => e.event === "call_invite")).toHaveLength(0);
  });

  it("tears the call down when the callee has no live socket", async () => {
    // Ringing an account nobody is sitting in is the same dead end as a
    // refusal, so the call is dropped and the caller told why. B never
    // connects here, which is what `fetchSockets` reports.
    asFriends();
    const io = fakeIo();
    setupSocketHandlers(io as never);
    const a = fakeSocket(A);
    io.connect(a);

    await a.fire("call_invite", { targetUserId: B, callType: "voice", roomId: nextRoom() });

    expect(a.emitted).toContainEqual(
      expect.objectContaining({
        event: "call_unavailable",
        payload: { targetUserId: B, reason: "offline" },
      })
    );

    // And the dropped call leaves nothing to signal on.
    io.emitted.length = 0;
    a.emitted.length = 0;
    await a.fire("webrtc_offer", { targetUserId: B, signal: { sdp: "x" } });
    expect(io.emitted.filter((e) => e.event === "webrtc_offer")).toHaveLength(0);
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
    // B has to be home, otherwise `call_invite` tears the call down as offline.
    io.connect(fakeSocket(B));

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
    io.connect(fakeSocket(B));

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