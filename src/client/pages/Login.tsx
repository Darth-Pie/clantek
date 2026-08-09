import { Navigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../lib/session';

const ERRORS: Record<string, string> = {
  state: 'That sign-in attempt expired or didn’t match. Please try again.',
  not_in_guild: 'You need to be a member of the clan’s Discord server to sign in.',
  banned: 'This account has been banned.',
  discord: 'Discord declined the sign-in.',
};

export default function Login() {
  const { viewer, siteName } = useSession();
  const [params] = useSearchParams();
  const error = params.get('error');
  const detail = params.get('detail');

  if (viewer) return <Navigate to="/" replace />;

  const message = error
    ? (ERRORS[error] ?? 'Sign-in failed. Please try again.') +
      (error === 'discord' && detail ? ` (${detail})` : '')
    : null;

  return (
    <div className="login">
      <h1>
        <span className="brand-lead">{(siteName || '').slice(0, 1)}</span>
        {(siteName || '').slice(1)}
      </h1>
      <p className="muted">Sign in with the Discord account you use in the server — no separate password to forget.</p>

      {message && <div className="alert">{message}</div>}

      <a className="discord-btn large" href="/api/auth/login">
        Sign in with Discord
      </a>
    </div>
  );
}
