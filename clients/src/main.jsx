import React, { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUpRight, GitMerge, ShieldCheck, Terminal, Users } from 'lucide-react';
import { completeOnboarding, createIntention, loadIntentions, loadProjects, loadSession, logout, updateIntention } from './api';
import './style.css';
import './intents.css';

const DevDemoApp = import.meta.env.DEV
  ? React.lazy(() => import('./demo.jsx').then((module) => ({ default: module.DemoApp })))
  : null;

const authErrorMessages = {
  provider_denied: '42 sign-in was cancelled. You can try again whenever you’re ready.',
  provider_rejected: '42 could not verify this sign-in. Please try again.',
  provider_unavailable: 'Peer could not complete 42 sign-in. Please try again later.',
  account_unavailable: 'This 42 account is not currently eligible to use Peer.',
};

function consumeAuthError() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('auth_error');
  if (!code) return '';
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  return authErrorMessages[code] || 'Sign-in could not be completed. Please try again.';
}

function AuthFrame({ children }) {
  return <>
    <header className="auth-header">
      <a className="brand" href="/">peer<span>✳</span></a>
      <span className="auth-network">42 student network</span>
    </header>
    <div className="announcement">
      <Terminal size={13}/><span>git checkout -b better-teammates</span>
      <span className="announcement-end">Good code. Better company.</span>
    </div>
    <main className="auth-main">
      {children}
      <footer className="auth-footer">
        <span>peer<span className="footer-star">✳</span> <span>good code. better company.</span></span>
        <span>Built for the peer-to-peer era.</span>
      </footer>
    </main>
  </>;
}

function SignInScreen({ status, message, retry, onRetry, onDemo }) {
  return <AuthFrame>
    <div className="auth-layout">
      <section className="auth-intro">
        <div className="eyebrow">THE CAMPUS IS FULL OF YOUR PEOPLE.</div>
        <h1>Find your next <span>commitment.</span></h1>
        <p>Less “anyone looking for a team?” More actually building together. Start with your 42 account; your profile stays hidden until you choose to join.</p>
        <div className="auth-points">
          <div><ShieldCheck size={18}/><span>42 sign-in. No password stored here.</span></div>
          <div><Users size={18}/><span>Meet peers across the 42 network.</span></div>
          <div><GitMerge size={18}/><span>Choose when your profile becomes visible.</span></div>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-card-icon"><GitMerge size={22}/></div>
        <div className="eyebrow">YOUR NEXT TEAMMATE IS OUT THERE</div>
        <h2>Make something good.</h2>
        <p>Sign in with 42 to create your Peer profile. We’ll ask before making it discoverable.</p>
        {message && <div className="auth-alert" role="alert">{message}</div>}
        {status === 'error' && <button className="text-button auth-retry" onClick={onRetry}>Try connection again</button>}
        <a className="solid auth-signin" href="/api/auth/42?returnTo=%2F">Continue with 42 <ArrowUpRight size={17}/></a>
        <span className="auth-privacy">Your provider password is never shared with Peer.</span>
        {import.meta.env.DEV && <>
          <div className="auth-divider"><span>or</span></div>
          <button className="demo-launch" onClick={onDemo}>Explore the fictional demo <ArrowRight size={15}/></button>
          <span className="auth-privacy">Demo profiles and interactions are fictional and stay in this browser.</span>
        </>}
        {retry > 0 && <span className="sr-only" role="status">Session check retried.</span>}
      </section>
    </div>
  </AuthFrame>;
}

function OnboardingScreen({ session, onComplete }) {
  const [bio, setBio] = useState(session.user.bio || '');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!consent || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await completeOnboarding({ bio, visible: true });
      onComplete({
        ...session,
        user: { ...session.user, ...result, onboarded: true, visible: true },
      });
    } catch (reason) {
      setError(reason.message || 'Could not save your profile. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  const initial = (session.user.displayName || session.user.login).charAt(0).toUpperCase();
  return <AuthFrame>
    <div className="onboarding-wrap">
      <div className="eyebrow">ONE LAST STEP · YOU’RE IN CONTROL</div>
      <h1>Set up your <span>profile.</span></h1>
      <p className="auth-lead">Your 42 identity is connected. Tell peers a little about what you’re looking for. Nothing is shared until you explicitly opt in below.</p>
      <form className="onboarding-card" onSubmit={submit}>
        <div className="onboarding-user">
          <div className="profile-avatar">
            {session.user.avatarUrl ? <img src={session.user.avatarUrl} alt=""/> : initial}
          </div>
          <div><strong>{session.user.displayName}</strong><span>@{session.user.login} · 42 account</span></div>
        </div>
        <label className="auth-label" htmlFor="profile-bio">A LITTLE ABOUT YOU <span>OPTIONAL · MAX 500 CHARACTERS</span></label>
        <textarea
          id="profile-bio"
          value={bio}
          maxLength={500}
          onChange={(event) => setBio(event.target.value)}
          placeholder="What are you building, or hoping to find?"
          rows={4}
        />
        <div className="bio-count" aria-live="polite">{bio.length}/500</div>
        {error && <div className="auth-alert" role="alert">{error}</div>}
        <label className="consent-row">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/>
          <span>
            <strong>Make my profile visible to other opted-in peers.</strong>
            <small>I understand that I can pause visibility later. My profile is private until I choose this.</small>
          </span>
        </label>
        <button className="solid auth-submit" type="submit" disabled={!consent || busy}>
          {busy ? 'Saving…' : 'Finish and join Peer'} {!busy && <ArrowRight size={17}/>}
        </button>
        <p className="auth-privacy">If you’re not ready to be discoverable, sign out and finish setup later.</p>
      </form>
    </div>
  </AuthFrame>;
}

function AccountHome({ session, onSignedOut }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [intentions, setIntentions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [intentsLoading, setIntentsLoading] = useState(true);
  const [intentError, setIntentError] = useState('');
  const [purpose, setPurpose] = useState('JOIN_TEAM');
  const [projectName, setProjectName] = useState('');
  const [schedule, setSchedule] = useState('ANY');
  const [goal, setGoal] = useState('');
  const [savingIntent, setSavingIntent] = useState(false);
  const [updatingIntentId, setUpdatingIntentId] = useState(null);
  const user = session.user;

  useEffect(() => {
    let active = true;
    Promise.all([loadIntentions(), loadProjects()])
      .then(([savedIntentions, availableProjects]) => {
        if (!active) return;
        setIntentions(savedIntentions);
        setProjects(availableProjects);
      })
      .catch((reason) => {
        if (active) setIntentError(reason.message || 'Could not load your intentions. Please retry.');
      })
      .finally(() => {
        if (active) setIntentsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const activeIntentCount = intentions.filter((intent) => (
    intent.active && new Date(intent.expiresAt).getTime() > Date.now()
  )).length;

  async function addIntention(event) {
    event.preventDefault();
    if (savingIntent || activeIntentCount >= 3) return;
    setSavingIntent(true);
    setIntentError('');
    try {
      const result = await createIntention({
        purpose,
        projectName: projectName.trim() || null,
        schedule,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        goal,
      });
      setIntentions((current) => [result.intent, ...current.filter((item) => item.id !== result.intent.id)]);
      setProjects((current) => result.intent.project && !current.some((item) => item.id === result.intent.project.id)
        ? [...current, result.intent.project].sort((left, right) => left.name.localeCompare(right.name))
        : current);
      setProjectName('');
      setGoal('');
    } catch (reason) {
      setIntentError(reason.message || 'Could not save this intention. Please retry.');
    } finally {
      setSavingIntent(false);
    }
  }

  async function changeIntention(intent) {
    const expired = new Date(intent.expiresAt).getTime() <= Date.now();
    const isActive = intent.active && !expired;
    setUpdatingIntentId(intent.id);
    setIntentError('');
    try {
      const result = await updateIntention(intent.id, isActive ? { active: false } : { renew: true });
      setIntentions((current) => current.map((item) => item.id === result.intent.id ? result.intent : item));
    } catch (reason) {
      setIntentError(reason.message || 'Could not update this intention. Please retry.');
    } finally {
      setUpdatingIntentId(null);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      onSignedOut();
    } catch (reason) {
      setError(reason.message || 'Could not sign out. Please retry.');
    } finally {
      setBusy(false);
    }
  }

  const initial = (user.displayName || user.login).charAt(0).toUpperCase();
  return <>
    <header className="account-header">
      <a className="brand" href="/">peer<span>✳</span></a>
      <div className="header-right">
        <span className="auth-network">42 authenticated</span>
        <button className="demo-exit" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </header>
    <div className="announcement">
      <Terminal size={13}/><span>git checkout -b better-teammates</span>
      <span className="announcement-end">A very unserious app. A very real problem.</span>
    </div>
    <main className="account-main">
      <div className="eyebrow">YOUR PEER PROFILE</div>
      <h1>You’re in, <span>{user.displayName}.</span></h1>
      <p className="auth-lead">Your 42 identity is connected. This is your real account space; fictional demo profiles are kept separate.</p>
      {error && <div className="auth-alert" role="alert">{error}</div>}
      <section className="account-card">
        <div className="onboarding-user">
          <div className="profile-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : initial}</div>
          <div><strong>{user.displayName}</strong><span>@{user.login} · 42 account</span></div>
          <span className="visibility-pill"><i className="live-dot"/>{user.visible ? 'Visible to opted-in peers' : 'Hidden'}</span>
        </div>
        {user.bio && <p className="account-bio">{user.bio}</p>}
        <div className="account-empty">
          <GitMerge size={27}/>
          <div><strong>Your account is ready.</strong><p>Intentions are saved to your account. Peer discovery is coming next; no sample people are shown here.</p></div>
        </div>
      </section>
      <section className="account-card intentions-card" aria-labelledby="intentions-title">
        <div className="intentions-heading">
          <div><div className="eyebrow">MAKE YOUR NEXT MOVE</div><h2 id="intentions-title">What are you looking for?</h2></div>
          <span className="intent-count">{activeIntentCount} / 3 active</span>
        </div>
        <p className="intent-description">Set a short-lived intention for the kind of peer you hope to meet. You can pause it or renew it later.</p>
        {intentError && <div className="auth-alert" role="alert">{intentError}</div>}
        <form className="intent-form" onSubmit={addIntention}>
          <label className="intent-field">
            <span>INTENTION</span>
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
              <option value="JOIN_TEAM">I’m looking to join a team</option>
              <option value="RECRUIT_TEAM">I’m looking for a teammate</option>
              <option value="DISCUSS">I’d like to talk</option>
            </select>
          </label>
          <label className="intent-field">
            <span>PROJECT {purpose === 'DISCUSS' ? '· OPTIONAL' : ''}</span>
            <input
              list="peer-project-options"
              value={projectName}
              maxLength={100}
              required={purpose !== 'DISCUSS'}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder={purpose === 'DISCUSS' ? 'Leave blank for a general conversation' : 'e.g. minishell'}
            />
            <datalist id="peer-project-options">{projects.map((project) => <option key={project.id} value={project.name}/>)}</datalist>
          </label>
          <label className="intent-field">
            <span>WHEN WORKS FOR YOU</span>
            <select value={schedule} onChange={(event) => setSchedule(event.target.value)}>
              <option value="ANY">Any time</option>
              <option value="MORNING">Mornings</option>
              <option value="EVENING">Evenings</option>
            </select>
          </label>
          <label className="intent-field intent-goal">
            <span>ONE-LINE GOAL · OPTIONAL</span>
            <input value={goal} maxLength={240} onChange={(event) => setGoal(event.target.value)} placeholder="What would you like to work on together?"/>
          </label>
          <button className="solid intent-submit" type="submit" disabled={savingIntent || activeIntentCount >= 3 || intentsLoading}>
            {savingIntent ? 'Saving…' : 'Save intention'} {!savingIntent && <ArrowRight size={16}/>}
          </button>
        </form>
        {intentsLoading ? <div className="intent-list-state" role="status">Loading your intentions…</div> : intentions.length === 0
          ? <div className="intent-list-state">No intentions yet. Your first one will be visible here.</div>
          : <div className="intent-list">{intentions.map((intent) => {
            const expired = new Date(intent.expiresAt).getTime() <= Date.now();
            const activeIntent = intent.active && !expired;
            const purposeLabel = intent.purpose === 'JOIN_TEAM' ? 'Looking to join a team' : intent.purpose === 'RECRUIT_TEAM' ? 'Looking for a teammate' : 'Open to conversation';
            return <article className="intent-item" key={intent.id}>
              <div className="intent-item-main">
                <div className="intent-item-top"><span className="intent-purpose">{purposeLabel}</span><span className={`intent-status ${activeIntent ? 'is-active' : ''}`}>{activeIntent ? 'Active' : expired ? 'Expired' : 'Paused'}</span></div>
                <h3>{intent.project?.name || 'General conversation'}</h3>
                <p>{intent.schedule === 'ANY' ? 'Any time' : intent.schedule === 'MORNING' ? 'Mornings' : 'Evenings'} · {intent.timeZone} · expires {new Date(intent.expiresAt).toLocaleDateString()}</p>
                {intent.goal && <p className="intent-goal-copy">{intent.goal}</p>}
                {intent.project?.source === 'self-reported' && <small className="intent-source">Project name is self-reported.</small>}
              </div>
              <button className="text-button intent-action" disabled={updatingIntentId === intent.id} onClick={() => changeIntention(intent)}>
                {updatingIntentId === intent.id ? 'Saving…' : activeIntent ? 'Pause' : 'Renew for 14 days'}
              </button>
            </article>;
          })}</div>}
        <p className="intent-footnote">Intentions expire after 14 days unless you explicitly renew them. Project names are self-reported.</p>
      </section>
      <footer className="auth-footer">
        <span>peer<span className="footer-star">✳</span> <span>good code. better company.</span></span>
        <span>People, not a leaderboard.</span>
      </footer>
    </main>
  </>;
}

function AuthGate() {
  const [status, setStatus] = useState('loading');
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState(consumeAuthError);
  const [demo, setDemo] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    loadSession()
      .then((value) => {
        if (!active) return;
        setSession(value);
        setStatus(value ? 'ready' : 'anonymous');
      })
      .catch(() => {
        if (!active) return;
        setMessage('Peer could not reach the sign-in service. Check your connection and try again.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [retry]);

  if (import.meta.env.DEV && demo && DevDemoApp) {
    return <Suspense fallback={<AuthFrame><section className="auth-card auth-state" role="status">Opening the fictional demo…</section></AuthFrame>}>
      <DevDemoApp onExitDemo={() => setDemo(false)}/>
    </Suspense>;
  }
  if (status === 'loading') {
    return <AuthFrame><section className="auth-card auth-state" role="status"><span className="auth-spinner"/><h1>Checking your session…</h1><p>Your account stays private while Peer checks your sign-in.</p></section></AuthFrame>;
  }
  if (status === 'ready' && session) {
    if (!session.user.onboarded) return <OnboardingScreen session={session} onComplete={setSession}/>;
    return <AccountHome session={session} onSignedOut={() => { setSession(null); setStatus('anonymous'); }}/>;
  }
  return <SignInScreen
    status={status}
    message={message}
    retry={retry}
    onRetry={() => { setMessage(''); setRetry((value) => value + 1); }}
    onDemo={() => setDemo(true)}
  />;
}

createRoot(document.getElementById('root')).render(<AuthGate/>);
