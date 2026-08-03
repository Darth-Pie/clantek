import { Navigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session';

const ERRORS: Record<string, string> = {
  state: 'That sign-in attempt expired or didn’t match. Please try again.',
  not_in_guild: 'You need to be a member of the clan’s Discord server to sign in.',
  banned: 'This account has been banned.',
};

export default function Login() {
  const { viewer, siteName } = useSession();
  const [params] = useSearchParams();
  const error = params.get('error');

  if (viewer) return <Navigate to="/" replace />;

  return (
    <div className="login">
      <h1>{siteName}</h1>
      <p className="muted">Sign in with the Discord account you use in the clan server.</p>

      {error && <div className="alert">{ERRORS[error] ?? 'Sign-in failed. Please try again.'}</div>}

      <a className="discord-btn large" href="/api/auth/login">
        Sign in with Discord
      </a>
    </div>
  );
}
