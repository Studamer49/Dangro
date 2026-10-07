import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center text-gray-100">
      <p className="text-7xl font-bold text-accent-500">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-gray-400">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        to="/"
        className="mt-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
      >
        Back to home
      </Link>
    </div>
  );
}
