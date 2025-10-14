import { Link } from 'react-router';
import {
  HiFolderOpen,
  HiLink,
  HiBriefcase,
  HiCog,
  HiQuestionMarkCircle,
  HiLogin
} from 'react-icons/hi';
import { useAuthContext } from '@/contexts/AuthContext';
import React from 'react';

export default function Home() {
  const { authStatus, loading } = useAuthContext();
  const isAuthenticated = authStatus?.authenticated;
  const isSimpleAuth = authStatus?.auth_method === 'simple';
  const [loginError, setLoginError] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;

    setIsSubmitting(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/simple-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username }),
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        window.location.href = data.redirect || '/fg/browse';
      } else {
        const data = await response.json();
        setLoginError(data.detail || 'Login failed');
        setIsSubmitting(false);
      }
    } catch {
      setLoginError('Network error. Please try again.');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-8">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-8">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Welcome to Fileglancer
        </h1>
        <p className="text-lg text-muted-foreground mb-12">
          {isAuthenticated
            ? 'Browse and manage your files with ease'
            : 'A powerful file browser and management tool'}
        </p>

        {isAuthenticated ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              className="flex items-start p-6 border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors group"
              to="/browse"
            >
              <HiFolderOpen className="w-8 h-8 mr-4 text-primary flex-shrink-0" />
              <div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-accent-foreground">
                  Browse Files
                </h2>
                <p className="text-muted-foreground">
                  Navigate through your file shares and directories
                </p>
              </div>
            </Link>

            <Link
              className="flex items-start p-6 border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors group"
              to="/links"
            >
              <HiLink className="w-8 h-8 mr-4 text-primary flex-shrink-0" />
              <div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-accent-foreground">
                  Shared Links
                </h2>
                <p className="text-muted-foreground">
                  Manage your shared file links and proxied paths
                </p>
              </div>
            </Link>

            <Link
              className="flex items-start p-6 border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors group"
              to="/jobs"
            >
              <HiBriefcase className="w-8 h-8 mr-4 text-primary flex-shrink-0" />
              <div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-accent-foreground">
                  Jobs & Tickets
                </h2>
                <p className="text-muted-foreground">
                  View and manage your support tickets
                </p>
              </div>
            </Link>

            <Link
              className="flex items-start p-6 border rounded-lg hover:bg-accent hover:border-accent-foreground transition-colors group"
              to="/preferences"
            >
              <HiCog className="w-8 h-8 mr-4 text-primary flex-shrink-0" />
              <div>
                <h2 className="text-xl font-semibold mb-2 group-hover:text-accent-foreground">
                  Preferences
                </h2>
                <p className="text-muted-foreground">
                  Customize your Fileglancer settings
                </p>
              </div>
            </Link>
          </div>
        ) : (
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
                <h2 className="text-xl font-semibold mb-4 text-primary">
                  Log In
                </h2>
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
                      disabled={isSubmitting}
                      id="username"
                      name="username"
                      required
                      type="text"
                    />
                  </div>
                  {loginError ? (
                    <div className="text-sm text-error">{loginError}</div>
                  ) : null}
                  <button
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? 'Logging in...' : 'Log In'}
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
                  href="/api/auth/login"
                >
                  Log In
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
