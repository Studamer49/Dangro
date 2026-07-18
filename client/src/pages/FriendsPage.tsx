import { useState, useEffect } from "react";
import api from "@/lib/api";
import type { Friend, FriendRequest, User } from "@/types";

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<"friends" | "requests" | "add">("friends");

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, []);

  const fetchFriends = async () => {
    try {
      const { data } = await api.get("/friends");
      setFriends(data.friends);
    } catch {
      // silent
    }
  };

  const fetchRequests = async () => {
    try {
      const { data } = await api.get("/friends/requests");
      setRequests(data.requests);
    } catch {
      // silent
    }
  };

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      setSearchResults(data.users);
    } catch {
      // silent
    }
  };

  const sendRequest = async (userId: string) => {
    try {
      await api.post("/friends/request", { userId });
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      // silent
    }
  };

  const acceptRequest = async (requestId: string) => {
    try {
      await api.post(`/friends/accept`, { requestId });
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      fetchFriends();
    } catch {
      // silent
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      await api.delete(`/friends/remove/${friendId}`);
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch {
      // silent
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-60 border-r border-gray-800 bg-gray-900 p-4">
        <nav className="space-y-1">
          <button
            onClick={() => setActiveTab("friends")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeTab === "friends"
                ? "bg-accent-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            Friends
          </button>
          <button
            onClick={() => setActiveTab("requests")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeTab === "requests"
                ? "bg-accent-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            Requests {requests.length > 0 && `(${requests.length})`}
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeTab === "add"
                ? "bg-accent-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            Add Friend
          </button>
        </nav>
      </div>

      <div className="flex-1 p-6">
        {activeTab === "friends" && (
          <div>
            <h2 className="mb-4 text-xl font-bold text-white">Friends</h2>
            {friends.length === 0 ? (
              <p className="text-gray-400">No friends yet. Add some!</p>
            ) : (
              <div className="space-y-2">
                {friends.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg bg-gray-900 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-accent-600 flex items-center justify-center text-sm font-bold">
                        {f.friend?.username?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-white">{f.friend?.username}</span>
                    </div>
                    <button
                      onClick={() => removeFriend(f.id)}
                      className="rounded-lg bg-red-600/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-600/30"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div>
            <h2 className="mb-4 text-xl font-bold text-white">Friend Requests</h2>
            {requests.length === 0 ? (
              <p className="text-gray-400">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg bg-gray-900 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-accent-600 flex items-center justify-center text-sm font-bold">
                        {r.sender?.username?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-white">{r.sender?.username}</span>
                    </div>
                    <button
                      onClick={() => acceptRequest(r.id)}
                      className="rounded-lg bg-green-600/20 px-3 py-1.5 text-xs text-green-400 hover:bg-green-600/30"
                    >
                      Accept
                    </button>
                  </div>
                ))}
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
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Search by username..."
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            />
            <div className="space-y-2">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg bg-gray-900 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent-600 flex items-center justify-center text-sm font-bold">
                      {user.username[0].toUpperCase()}
                    </div>
                    <span className="text-white">{user.username}</span>
                  </div>
                  <button
                    onClick={() => sendRequest(user.id)}
                    className="rounded-lg bg-accent-600/20 px-3 py-1.5 text-xs text-accent-400 hover:bg-accent-600/30"
                  >
                    Add Friend
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
