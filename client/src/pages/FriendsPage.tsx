import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import type { Friend, FriendRequest, User } from "@/types";
import EmptyState from "@/components/friends/EmptyState";
import NavTab from "@/components/friends/NavTab";
import UserRow from "@/components/friends/UserRow";

type Tab = "friends" | "pending" | "sent" | "add";
type FriendScope = "online" | "all";

interface FriendsResponse {
  friends: Friend[];
}

interface RequestsResponse {
  requests: FriendRequest[];
}

interface SearchResponse {
  users: User[];
}

const STATUS_LABEL: Record<User["status"], string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [sent, setSent] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("friends");
  const [scope, setScope] = useState<FriendScope>("online");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toast = useToast();
  const toastRef = useRef(toast);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchFriends = useCallback(async () => {
    try {
      const { data } = await api.get<FriendsResponse>("/friends");
      setFriends(data.friends ?? []);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
    }
  }, []);

  const fetchIncoming = useCallback(async () => {
    try {
      const { data } = await api.get<RequestsResponse>("/friends/requests");
      setIncoming(data.requests ?? []);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
    }
  }, []);

  const fetchSent = useCallback(async () => {
    try {
      const { data } = await api.get<RequestsResponse>("/friends/requests/sent");
      setSent(data.requests ?? []);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchFriends(), fetchIncoming(), fetchSent()]).finally(() =>
      setLoading(false)
    );
  }, [fetchFriends, fetchIncoming, fetchSent]);

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    const seq = (searchSeqRef.current += 1);
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setSearching(false);
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data } = await api.get<SearchResponse>(
        `/users/search?q=${encodeURIComponent(trimmed)}`
      );
      if (seq !== searchSeqRef.current) return;
      setSearchResults(data.users ?? []);
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      toast.error(apiErrorMessage(err));
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
    }
  };

  const sendRequest = async (user: User) => {
    setBusyId(user.id);
    try {
      const { data } = await api.post<{ request: FriendRequest }>("/friends/request", {
        userId: user.id,
      });
      toast.success(`Friend request sent to ${user.username}`);
      setSent((prev) =>
        prev.some((r) => r.receiverId === user.id)
          ? prev
          : [{ ...data.request, receiver: user }, ...prev]
      );
      void fetchIncoming();
      void fetchSent();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const acceptRequest = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await api.post("/friends/accept", { requestId: request.id });
      toast.success(
        request.sender
          ? `You are now friends with ${request.sender.username}`
          : "Friend request accepted"
      );
      void fetchFriends();
      void fetchIncoming();
      void fetchSent();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await api.post("/friends/reject", { requestId: request.id });
      toast.success("Friend request rejected");
      void fetchIncoming();
      void fetchSent();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const cancelRequest = async (request: FriendRequest) => {
    setBusyId(request.id);
    try {
      await api.delete(`/friends/request/${request.id}`);
      toast.success("Friend request cancelled");
      void fetchIncoming();
      void fetchSent();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const removeFriend = async (friend: Friend) => {
    const target = friend.friend;
    if (!target) return;
    if (!window.confirm(`Remove ${target.username} from your friends?`)) return;

    setBusyId(target.id);
    try {
      await api.delete(`/friends/remove/${target.id}`);
      toast.success(`${target.username} removed from your friends`);
      void fetchFriends();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const onlineFriends = friends.filter((f) => f.friend?.status === "online");
  const visibleFriends = scope === "online" ? onlineFriends : friends;
  const isFriendOf = (userId: string) => friends.some((f) => f.friend?.id === userId);
  const hasSentTo = (userId: string) => sent.some((r) => r.receiverId === userId);

  const friendsEmptyMessage =
    friends.length === 0 ? "No friends yet. Add some!" : "Nobody is online right now.";

  return (
    <div className="flex h-full">
      {/*
        The nav column is a genuine side pane, so it earns real material: the
        core `glass` level plus a hairline right edge to separate it from the
        scrolling list. No solid fill — the ambient field has to keep reading
        through the gap between the two panes.
      */}
      <div className="glass w-60 shrink-0 border-r border-gray-800 p-4">
        <nav className="space-y-1">
          <NavTab
            label="Friends"
            active={activeTab === "friends"}
            count={friends.length}
            onClick={() => setActiveTab("friends")}
          />
          <NavTab
            label="Pending"
            active={activeTab === "pending"}
            count={incoming.length}
            onClick={() => setActiveTab("pending")}
          />
          <NavTab
            label="Sent"
            active={activeTab === "sent"}
            count={sent.length}
            onClick={() => setActiveTab("sent")}
          />
          <NavTab label="Add Friend" active={activeTab === "add"} onClick={() => setActiveTab("add")} />
        </nav>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {loading ? (
          <EmptyState message="Loading…" />
        ) : (
          <>
            {activeTab === "friends" && (
              <div className="animate-fade-up">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold tracking-tight text-white">Friends</h2>
                  {/* Segmented rather than two buttons: the Online/All choice is
                      a view switch, not an action, and the lit thumb makes the
                      current scope legible without a second accent surface. */}
                  <div className="segment">
                    <button
                      onClick={() => setScope("online")}
                      data-active={scope === "online"}
                      className="segment-item"
                    >
                      Online <span className="tabular ml-1 opacity-70">{onlineFriends.length}</span>
                    </button>
                    <button
                      onClick={() => setScope("all")}
                      data-active={scope === "all"}
                      className="segment-item"
                    >
                      All <span className="tabular ml-1 opacity-70">{friends.length}</span>
                    </button>
                  </div>
                </div>

                {visibleFriends.length === 0 ? (
                  <EmptyState message={friendsEmptyMessage} />
                ) : (
                  <div className="space-y-2">
                    {visibleFriends.map((f) => {
                      const user = f.friend;
                      if (!user) return null;
                      return (
                        <UserRow
                          key={f.id}
                          username={user.username}
                          avatar={user.avatar}
                          status={user.status}
                          meta={STATUS_LABEL[user.status]}
                          actions={
                            <button
                              onClick={() => void removeFriend(f)}
                              disabled={busyId === user.id}
                              className="btn-danger !px-3 !py-1.5 !text-xs"
                            >
                              Remove
                            </button>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "pending" && (
              <div className="animate-fade-up">
                <h2 className="mb-5 text-xl font-bold tracking-tight text-white">
                  Friend Requests
                </h2>
                {incoming.length === 0 ? (
                  <EmptyState message="No pending friend requests." />
                ) : (
                  <div className="space-y-2">
                    {incoming.map((r) => {
                      const sender = r.sender;
                      // Fall back to the id from the request itself rather
                      // than dropping the row: a pending request must never
                      // be invisible while the tab still counts it.
                      return (
                        <UserRow
                          key={r.id}
                          username={sender?.username ?? "Deleted user"}
                          avatar={sender?.avatar ?? null}
                          status={sender?.status ?? "offline"}
                          meta="Sent you a friend request"
                          actions={
                            <>
                              {/* Green is semantic here, not decorative:
                                  accepting is the one affirmative outcome on
                                  this row, so it gets the only lit-positive
                                  treatment rather than another ghost button. */}
                              <button
                                onClick={() => void acceptRequest(r)}
                                disabled={busyId === r.id}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all duration-200 hover:border-emerald-400/50 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => void rejectRequest(r)}
                                disabled={busyId === r.id}
                                className="btn-danger !px-3 !py-1.5 !text-xs"
                              >
                                Reject
                              </button>
                            </>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "sent" && (
              <div className="animate-fade-up">
                <h2 className="mb-5 text-xl font-bold tracking-tight text-white">Sent Requests</h2>
                {sent.length === 0 ? (
                  <EmptyState message="No outgoing friend requests. Find people in Add Friend." />
                ) : (
                  <div className="space-y-2">
                    {sent.map((r) => {
                      const receiver = r.receiver;
                      return (
                        <UserRow
                          key={r.id}
                          username={receiver?.username ?? "Deleted user"}
                          avatar={receiver?.avatar ?? null}
                          status={receiver?.status ?? "offline"}
                          meta="Waiting for a response"
                          actions={
                            <button
                              onClick={() => void cancelRequest(r)}
                              disabled={busyId === r.id}
                              className="btn-ghost !px-3 !py-1.5 !text-xs"
                            >
                              Cancel
                            </button>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "add" && (
              <div className="animate-fade-up">
                <h2 className="mb-5 text-xl font-bold tracking-tight text-white">Add Friend</h2>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => void searchUsers(e.target.value)}
                  placeholder="Search by username..."
                  className="field mb-5"
                />

                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((user) => {
                      const alreadyFriends = isFriendOf(user.id);
                      const pending = hasSentTo(user.id);
                      return (
                        <UserRow
                          key={user.id}
                          username={user.username}
                          avatar={user.avatar}
                          status={user.status}
                          actions={
                            alreadyFriends ? (
                              /* Not a control — a fact about the relationship.
                                 It reads as a quiet recessed chip rather than a
                                 disabled button so the eye skips it. */
                              <span className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-400">
                                Friends
                              </span>
                            ) : pending ? (
                              <span className="rounded-lg border border-gray-700/60 bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-400">
                                Pending
                              </span>
                            ) : (
                              <button
                                onClick={() => void sendRequest(user)}
                                disabled={busyId === user.id}
                                className="btn-primary !px-3 !py-1.5 !text-xs"
                              >
                                Add Friend
                              </button>
                            )
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    message={
                      searching
                        ? "Searching…"
                        : searchQuery.trim().length < 2
                          ? "Type at least 2 characters to search for people."
                          : `No users found for "${searchQuery.trim()}".`
                    }
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
