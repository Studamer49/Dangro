import { useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import ServerSidebar from "@/components/ServerSidebar";
import ChannelSidebar from "@/components/ChannelSidebar";
import ChatArea from "@/components/ChatArea";
import FriendsPage from "@/pages/FriendsPage";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  useEffect(() => {
    document.title = "Dangro";
  }, []);

  return (
    <div className="flex h-screen bg-gray-950">
      <ServerSidebar />
      <ChannelSidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-dangro-600 flex items-center justify-center text-sm font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-white font-medium">{user?.username}</span>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<ChatArea />} />
            <Route path="/friends/*" element={<FriendsPage />} />
            <Route path="/channels/:channelId" element={<ChatArea />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
