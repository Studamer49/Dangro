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
      <div className="w-60 shrink-0 border-r border-gray-800 bg-gray-900 p-4">
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

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <EmptyState message="Loading…" />
        ) : (
          <>
            {activeTab === "friends" && (
              <div>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-white">Friends</h2>
                  <div className="flex rounded-lg bg-gray-900 p-1">
                    <button
                      onClick={() => setScope("online")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        scope === "online"
                          ? "bg-accent-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Online ({onlineFriends.length})
                    </button>
                    <button
                      onClick={() => setScope("all")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        scope === "all"
                          ? "bg-accent-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      All ({friends.length})
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
                              className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div>
                <h2 className="mb-4 text-xl font-bold text-white">Friend Requests</h2>
                {incoming.length === 0 ? (
                  <EmptyState message="No pending friend requests." />
                ) : (
                  <div className="space-y-2">
                    {incoming.map((r) => {
                      const sender = r.sender;
                      if (!sender) return null;
                      return (
                        <UserRow
                          key={r.id}
                          username={sender.username}
                          avatar={sender.avatar}
                          status={sender.status}
                          meta="Sent you a friend request"
                          actions={
                            <>
                              <button
                                onClick={() => void acceptRequest(r)}
                                disabled={busyId === r.id}
                                className="rounded-lg bg-green-600/20 px-3 py-1.5 text-xs text-green-400 transition-colors hover:bg-green-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => void rejectRequest(r)}
                                disabled={busyId === r.id}
                                className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div>
                <h2 className="mb-4 text-xl font-bold text-white">Sent Requests</h2>
                {sent.length === 0 ? (
                  <EmptyState message="No outgoing friend requests. Find people in Add Friend." />
                ) : (
                  <div className="space-y-2">
                    {sent.map((r) => {
                      const receiver = r.receiver;
                      if (!receiver) return null;
                      return (
                        <UserRow
                          key={r.id}
                          username={receiver.username}
                          avatar={receiver.avatar}
                          status={receiver.status}
                          meta="Waiting for a response"
                          actions={
                            <button
                              onClick={() => void cancelRequest(r)}
                              disabled={busyId === r.id}
                              className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              <div>
                <h2 className="mb-4 text-xl font-bold text-white">Add Friend</h2>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => void searchUsers(e.target.value)}
                  placeholder="Search by username..."
                  className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
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
                              <span className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400">
                                Friends
                              </span>
                            ) : pending ? (
                              <span className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-400">
                                Pending
                              </span>
                            ) : (
                              <button
                                onClick={() => void sendRequest(user)}
                                disabled={busyId === user.id}
                                className="rounded-lg bg-accent-600/20 px-3 py-1.5 text-xs text-accent-400 transition-colors hover:bg-accent-600/30 disabled:cursor-not-allowed disabled:opacity-50"
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
