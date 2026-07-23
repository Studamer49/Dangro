import { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatArea from "@/components/ChatArea";
import FriendsPage from "@/pages/FriendsPage";
import SettingsPage from "@/pages/SettingsPage";
import DirectMessagesPage from "@/pages/DirectMessagesPage";
import FeedPage from "@/pages/FeedPage";
import ExplorePage from "@/pages/ExplorePage";
import ProfilePage from "@/pages/ProfilePage";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    document.title = "Dangro";
  }, []);

  const fontSizeClass =
    fontSize === "small" ? "text-chat-sm" : fontSize === "large" ? "text-chat-lg" : "text-chat-base";

  return (
    <div className={`flex h-screen bg-gray-950 text-white ${fontSizeClass}`}>
      <ServerSidebar />
      <ChannelSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-accent-600 flex items-center justify-center text-sm font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="font-medium">{user?.username}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/settings")}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/dms" element={<DirectMessagesPage />} />
            <Route path="/dms/:conversationId" element={<DirectMessagesPage />} />
            <Route path="/friends/*" element={<FriendsPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/channels/:channelId" element={<ChatArea />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
