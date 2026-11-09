import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { HiLogin } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import { useAuthContext } from '@/contexts/AuthContext';
import { useSimpleLoginMutation } from '@/queries/authQueries';
import { isConnectLoginPopup } from '@/utils';
import { useEffect } from 'react';
import FgInput from './designSystem/atoms/formElements/FgInput';

export default function Login() {
  const { authStatus, loading } = useAuthContext();
  const navigate = useNavigate();
  const isAuthenticated = authStatus?.authenticated;
  // 'single_user' is simple auth where the server already knows who you are
  // (its own OS user), so only the password is asked for.
  const isSingleUser = authStatus?.auth_method === 'single_user';
  const isSimpleAuth = authStatus?.auth_method === 'simple' || isSingleUser;
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
    const username = (formData.get('username') as string | null) ?? undefined;
    const password = formData.get('password') as string;

    simpleLoginMutation.mutate(
      { username, password, next: nextUrl },
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

  // Halve the spacing inside the compact connect popup so text doesn't wrap
  // and overflow the small window.
  const bare = isConnectLoginPopup();

  return (
    <div
      className={`flex flex-col items-center h-full ${bare ? 'p-4' : 'p-8'}`}
    >
      <h1
        className={`text-4xl font-bold text-foreground text-center ${bare ? 'mb-2' : 'mb-4'}`}
      >
        Welcome to Fileglancer
      </h1>
      <p
        className={`text-lg text-muted-foreground text-center ${bare ? 'mb-6' : 'mb-12'}`}
      >
        Work with your data right where it lives.
      </p>

      <div className="w-full max-w-md">
        {isSimpleAuth ? (
          <div className="p-6 border-2 border-primary rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-primary">Log In</h2>
            <p className="text-muted-foreground mb-4">
              {isSingleUser
                ? 'Enter the password printed when the server started'
                : 'Enter your username and the server password to access your files'}
            </p>
            <form className="space-y-4 " onSubmit={handleLogin}>
              {isSingleUser ? null : (
                <FgFormField label="Username">
                  <FgInput name="username" />
                </FgFormField>
              )}
              <FgFormField
                error={simpleLoginMutation.error?.message}
                label="Password"
              >
                <FgInput name="password" type="password" />
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
