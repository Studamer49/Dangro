import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center animate-fade-up">
      <p className="text-8xl font-bold tracking-tight text-gray-700/70">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className="btn-primary mt-7">
        Back to home
      </Link>
    </div>
  );
}
