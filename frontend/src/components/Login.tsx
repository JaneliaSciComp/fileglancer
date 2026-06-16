import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { HiQuestionMarkCircle, HiLogin } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSimpleLoginMutation } from '@/queries/authQueries';
import { useEffect } from 'react';
import FgInput from './designSystem/atoms/formElements/FgInput';

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
          const destination =
            data.redirect || `/?next=${encodeURIComponent(nextUrl)}`;
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
          className="flex items-start p-6 border rounded-lg dark:border-surface-light hover:bg-accent hover:border-accent-foreground transition-colors group"
          to="/help"
        >
          <FgIcon
            className="mr-4 text-primary flex-shrink-0"
            icon={HiQuestionMarkCircle}
            size="lg"
          />
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
              <FgFormField
                error={simpleLoginMutation.error?.message}
                label="Username"
              >
                <FgInput name="username" />
              </FgFormField>
              <FgButton
                className="w-full"
                loading={simpleLoginMutation.isPending}
                loadingText="Logging in..."
                type="submit"
              >
                Log In
              </FgButton>
            </form>
          </div>
        ) : (
          <div className="p-6 border-2 border-primary rounded-lg">
            <div className="flex items-start mb-4">
              <FgIcon
                className="mr-4 text-primary flex-shrink-0 scale-x-[-1]"
                icon={HiLogin}
                size="lg"
              />
              <div>
                <h2 className="text-xl font-semibold mb-2 text-primary">
                  Log In with OKTA
                </h2>
                <p className="text-muted-foreground">
                  Sign in to access your files and manage settings
                </p>
              </div>
            </div>
            <FgButton
              className="w-full"
              href={`/api/auth/login?next=${encodeURIComponent(nextUrl)}`}
            >
              Log In
            </FgButton>
          </div>
        )}
      </div>
    </div>
  );
}
