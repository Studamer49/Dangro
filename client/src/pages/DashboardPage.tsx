import { useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatArea from "@/components/ChatArea";
import FriendsPage from "@/pages/FriendsPage";
import SettingsPage from "@/pages/SettingsPage";
import DirectMessagesPage from "@/pages/DirectMessagesPage";
import FeedPage from "@/pages/FeedPage";
import ExplorePage from "@/pages/ExplorePage";
import ProfilePage from "@/pages/ProfilePage";
import JoinServerPage from "@/pages/JoinServerPage";
import NotificationsBell from "@/components/NotificationsBell";
import Avatar from "@/components/Avatar";
import NotFoundPage from "@/pages/NotFoundPage";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();

  const showChannelSidebar = location.pathname.startsWith("/channels/");

  const handleLogout = async () => {
    // logout() never rejects, but awaiting it in an onClick handler would turn
    // any future throw into an unhandled rejection.
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    document.title = "Dangro";
  }, []);

  return (
    <div className="flex h-screen overflow-hidden text-white">
      <ServerSidebar />
      {showChannelSidebar && <ChannelSidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Sticky glass bar. The blur is what keeps the chat legible as it
          scrolls underneath — without it the header would need an opaque
          fill and the ambient field would stop at the top of the viewport.
        */}
        <header className="glass layer-chrome sticky top-0 flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar user={user} className="h-8 w-8 text-sm" lit />
            <div className="flex flex-col leading-tight">
              <span className="font-semibold tracking-tight">{user?.username}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
                Online
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <NotificationsBell />
            <button
              onClick={() => navigate("/settings")}
              className="icon-btn"
              title="Settings"
              aria-label="Settings"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button onClick={handleLogout} className="btn-ghost ml-1 px-3 py-1.5 text-xs">
              Logout
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/dms" element={<DirectMessagesPage />} />
            <Route path="/dms/:conversationId" element={<DirectMessagesPage />} />
            <Route path="/friends/*" element={<FriendsPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/channels/:channelId" element={<ChatArea />} />
            <Route path="/invite/:inviteCode" element={<JoinServerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
