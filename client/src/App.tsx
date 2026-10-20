import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useGlobalButtonBounce } from "@/hooks/useBounce";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import VerifyEmailPage from "@/pages/VerifyEmailPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import VideoCallModal from "@/components/VideoCallModal";
import CallInvitation from "@/components/CallInvitation";
import IceConfigLoader from "@/components/IceConfigLoader";

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

/**
 * Public route for the pages a link in an email can land on.
 *
 * Same as GuestRoute with one difference: someone who is already signed in and
 * clicks their own verification link should be shown the result, not bounced
 * into the app where they cannot see it. So this only renders a splash while
 * the session is being resolved, and never redirects.
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuthStore();

  if (isLoading) return <Splash />;

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
      {/* Fetches this deployment's STUN/TURN list before anyone places a call. */}
      <IceConfigLoader />
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
        {/* Reached from a link in an email, on a device that is not signed in
            — and sometimes on one that is. */}
        <Route
          path="/verify-email"
          element={
            <PublicRoute>
              <VerifyEmailPage />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <ResetPasswordPage />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <ForgotPasswordPage />
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
