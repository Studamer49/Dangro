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
  const handlers = new Map<string, (payload: unknown) => unknown>();
  const rooms = new Set<string>([`user:${userId}`]);

  return {
    data: { userId },
    rooms,
    handshake: { auth: { token: "test" } },
    join: (room: string) => rooms.add(room),
    leave: (room: string) => rooms.delete(room),
    on: (event: string, handler: (payload: unknown) => unknown) => handlers.set(event, handler),
    emit: () => undefined,
    fire: (event: string, payload: unknown) => handlers.get(event)?.(payload),
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