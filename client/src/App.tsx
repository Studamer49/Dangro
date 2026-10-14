import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useGlobalButtonBounce } from "@/hooks/useBounce";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import VideoCallModal from "@/components/VideoCallModal";
import CallInvitation from "@/components/CallInvitation";

/**
 * Full-bleed auth/loading screen.
 *
 * Sits on the body's ambient field rather than a flat fill, and centres the
 * spinner in a lit ring — so the moment before login resolves already looks
 * like the product rather than a blank wait.
 */
function Splash() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        {/* The ring is a conic gradient masked into a circle, which gives a
            real sweeping arc instead of the default hard-edged border spin. */}
        <div
          className="animate-ring-spin absolute inset-0 rounded-full opacity-80"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, rgb(var(--accent-400-rgb) / 0.9) 60%, transparent 100%)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
          }}
        />
        <div className="h-2.5 w-2.5 rounded-full bg-accent-400 shadow-glow" />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <Splash />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return <Splash />;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const fetchUser = useAuthStore((s) => s.fetchUser);

  // One subtle press bounce for every button that does not animate itself.
  useGlobalButtonBounce();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <ErrorBoundary>
      <VideoCallModal />
      <CallInvitation />
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
