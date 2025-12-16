import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { HiQuestionMarkCircle, HiLogin } from 'react-icons/hi';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSimpleLoginMutation } from '@/queries/authQueries';
import { useEffect } from 'react';

export default function Login() {
  const { authStatus, loading } = useAuthContext();
  const navigate = useNavigate();
  const isAuthenticated = authStatus?.authenticated;
  const isSimpleAuth = authStatus?.auth_method === 'simple';
  const simpleLoginMutation = useSimpleLoginMutation();

  // Get the 'next' parameter from URL to redirect after login
  const urlParams = new URLSearchParams(window.location.search);
  const nextUrl = urlParams.get('next') || '/browse';

  // If already authenticated, redirect to browse or next URL
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(nextUrl, { replace: true });
    }
  }, [loading, isAuthenticated, nextUrl, navigate]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;

    simpleLoginMutation.mutate(
      { username, next: nextUrl },
      {
        onSuccess: data => {
          // Redirect to root with next parameter
          // Root component will handle final navigation after auth updates
          const destination = data.redirect || `/?next=${encodeURIComponent(nextUrl)}`;
          window.location.href = destination;
        }
      }
    );
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full p-8">
      <h1 className="text-4xl font-bold text-foreground mb-4">
        Welcome to Fileglancer
      </h1>
      <p className="text-lg text-muted-foreground mb-12">
        A powerful file browser and management tool
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          className="flex items-start p-6 border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors group"
          to="/help"
        >
          <HiQuestionMarkCircle className="w-8 h-8 mr-4 text-primary flex-shrink-0" />
          <div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-accent-foreground">
              Help & Documentation
            </h2>
            <p className="text-muted-foreground">
              Learn more about Fileglancer and how to use it
            </p>
          </div>
        </Link>

        {isSimpleAuth ? (
          <div className="p-6 border-2 border-primary rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-primary">Log In</h2>
            <p className="text-muted-foreground mb-4">
              Enter your username to access your files
            </p>
            <form className="space-y-4 " onSubmit={handleLogin}>
              <div>
                <label
                  className="block text-sm font-medium text-foreground mb-2"
                  htmlFor="username"
                >
                  Username
                </label>
                <input
                  autoFocus
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                  disabled={simpleLoginMutation.isPending}
                  id="username"
                  name="username"
                  required
                  type="text"
                />
              </div>
              {simpleLoginMutation.error ? (
                <div className="text-sm text-error">
                  {simpleLoginMutation.error.message}
                </div>
              ) : null}
              <button
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={simpleLoginMutation.isPending}
                type="submit"
              >
                {simpleLoginMutation.isPending ? 'Logging in...' : 'Log In'}
              </button>
            </form>
          </div>
        ) : (
          <div className="p-6 border-2 border-primary rounded-lg">
            <div className="flex items-start mb-4">
              <HiLogin className="w-8 h-8 mr-4 text-primary flex-shrink-0 scale-x-[-1]" />
              <div>
                <h2 className="text-xl font-semibold mb-2 text-primary">
                  Log In with OKTA
                </h2>
                <p className="text-muted-foreground">
                  Sign in to access your files and manage settings
                </p>
              </div>
            </div>
            <a
              className="block w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium text-center hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
              href={`/api/auth/login?next=${encodeURIComponent(nextUrl)}`}
            >
              Log In
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
