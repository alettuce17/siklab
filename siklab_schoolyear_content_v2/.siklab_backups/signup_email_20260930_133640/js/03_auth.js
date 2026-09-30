/* =========================================================
 * SIKLAB TEACHER AUTHENTICATION
 * Email + Password + One-Time Email Confirmation
 *
 * Flow:
 *   REGISTER
 *   1) Teacher enters full name, email, and password.
 *   2) Supabase creates the Auth account.
 *   3) Supabase sends the Confirm Signup email.
 *   4) Teacher clicks the confirmation link once.
 *   5) Teacher signs in with email + password.
 *
 * There is NO manual teacher approval requirement.
 * ========================================================= */

const SIKLAB_PENDING_CONFIRM_EMAIL = 'siklab_pending_confirm_email';

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getSikLabAuthRedirectUrl() {
    // Confirmation links return to whichever SikLab deployment is being used.
    // Make sure that URL is also allowed in:
    // Supabase -> Authentication -> URL Configuration -> Redirect URLs.
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
}

function setAuthHeading(headingText, subtitleText) {
    const heading = document.getElementById('auth-main-heading');
    const title = document.getElementById('auth-title');

    if (heading) heading.innerText = headingText;
    if (title) title.innerText = subtitleText;
}

function hideAllAuthPanels() {
    document.getElementById('login-form')?.classList.add('hidden');
    document.getElementById('register-form')?.classList.add('hidden');
    document.getElementById('confirmation-panel')?.classList.add('hidden');
}

function showLoginForm() {
    hideAllAuthPanels();
    document.getElementById('login-form')?.classList.remove('hidden');

    setAuthHeading(
        'Welcome Back',
        'Sign in with your SikLab teacher email and password.'
    );

    const pendingEmail = sessionStorage.getItem(SIKLAB_PENDING_CONFIRM_EMAIL);
    const emailInput = document.getElementById('login-email');

    if (emailInput && pendingEmail && !emailInput.value) {
        emailInput.value = pendingEmail;
    }

    if (emailInput) {
        setTimeout(() => emailInput.focus(), 100);
    }
}

function showRegisterForm() {
    hideAllAuthPanels();
    document.getElementById('register-form')?.classList.remove('hidden');

    setAuthHeading(
        'Create Teacher Account',
        'Create your account, confirm your email once, then sign in using your password.'
    );

    const nameInput = document.getElementById('register-name');
    if (nameInput) {
        setTimeout(() => nameInput.focus(), 100);
    }
}

function showConfirmationPanel(email) {
    hideAllAuthPanels();
    document.getElementById('confirmation-panel')?.classList.remove('hidden');

    const cleanEmail = normalizeEmail(email);
    if (cleanEmail) {
        sessionStorage.setItem(SIKLAB_PENDING_CONFIRM_EMAIL, cleanEmail);
    }

    const display = document.getElementById('confirmation-email-display');
    if (display) display.textContent = cleanEmail || 'your email';

    setAuthHeading(
        'Confirm Your Email',
        'Open the email from SikLab and confirm your account before signing in.'
    );
}

function showAuthScreen() {
    const auth = document.getElementById('auth-screen');
    if (auth) {
        auth.classList.remove('hidden');
        setTimeout(() => { auth.style.opacity = '1'; }, 50);
    }

    const dash = document.getElementById('dashboard-layout');
    if (dash) {
        dash.classList.add('hidden');
        dash.style.opacity = '0';
    }

    showLoginForm();
}

function setAuthButtonBusy(button, busy, busyHtml, normalHtml) {
    if (!button) return;
    button.disabled = busy;
    button.innerHTML = busy ? busyHtml : normalHtml;
}

function togglePasswordVisibility(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';

    const icon = button?.querySelector('i');
    if (icon) {
        icon.className = showing
            ? 'fa-solid fa-eye'
            : 'fa-solid fa-eye-slash';
    }
}

function getFriendlyPasswordAuthError(error, fallback = 'Authentication failed.') {
    const message = String(error?.message || '').trim();
    const lower = message.toLowerCase();
    const status = Number(error?.status || error?.statusCode || 0);

    if (
        status === 429 ||
        lower.includes('rate limit') ||
        lower.includes('too many requests')
    ) {
        return 'Too many authentication emails or requests were made. Please wait a little before trying again.';
    }

    if (
        lower.includes('invalid login credentials') ||
        lower.includes('invalid credentials')
    ) {
        return 'Incorrect email or password.';
    }

    if (
        lower.includes('email not confirmed') ||
        lower.includes('email_not_confirmed')
    ) {
        return 'Your email is not confirmed yet. Open your SikLab confirmation email first, or resend the confirmation email.';
    }

    if (
        lower.includes('user already registered') ||
        lower.includes('already been registered')
    ) {
        return 'That email already has a SikLab account. Sign in instead.';
    }

    if (lower.includes('password') && lower.includes('least')) {
        return 'Your password does not meet the required minimum length.';
    }

    if (lower.includes('email') && lower.includes('invalid')) {
        return 'Enter a valid email address.';
    }

    if (lower.includes('signup') && lower.includes('disabled')) {
        return 'New account registration is currently disabled in Supabase Authentication settings.';
    }

    return message || fallback;
}

async function handleLogin(event) {
    event.preventDefault();

    const email = normalizeEmail(
        document.getElementById('login-email')?.value
    );
    const password = String(
        document.getElementById('login-password')?.value || ''
    );

    if (!email || !password) {
        showErrorToast('Enter your email and password.');
        return;
    }

    const button = document.getElementById('login-btn');

    try {
        setAuthButtonBusy(
            button,
            true,
            '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...',
            '<i class="fa-solid fa-right-to-bracket"></i> Sign In'
        );

        const db = requireSupabase();
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            const lower = String(error?.message || '').toLowerCase();
            if (lower.includes('email not confirmed')) {
                sessionStorage.setItem(SIKLAB_PENDING_CONFIRM_EMAIL, email);
                showConfirmationPanel(email);
            }
            throw error;
        }

        const user = data?.user || data?.session?.user || null;
        if (!user) {
            throw new Error('Sign in succeeded but no user session was returned.');
        }

        window.siklabCurrentUser = user;
        sessionStorage.removeItem(SIKLAB_PENDING_CONFIRM_EMAIL);

        const displayName = getTeacherDisplayName(user);
        sessionStorage.setItem('siklab_teacher_session', displayName);

        proceedToDashboard(
            displayName,
            true,
            `Welcome back, ${displayName}!`
        );
    } catch (error) {
        console.error('[SikLab password login]', error);
        showErrorToast(
            getFriendlyPasswordAuthError(
                error,
                'Unable to sign in.'
            )
        );
    } finally {
        setAuthButtonBusy(
            button,
            false,
            '',
            '<i class="fa-solid fa-right-to-bracket"></i> Sign In'
        );
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const fullName = String(
        document.getElementById('register-name')?.value || ''
    ).trim();
    const email = normalizeEmail(
        document.getElementById('register-email')?.value
    );
    const password = String(
        document.getElementById('register-password')?.value || ''
    );
    const confirmPassword = String(
        document.getElementById('register-confirm-password')?.value || ''
    );

    if (!fullName || !email || !password || !confirmPassword) {
        showErrorToast('Complete all account fields.');
        return;
    }

    if (password.length < 8) {
        showErrorToast('Password must contain at least 8 characters.');
        return;
    }

    if (password !== confirmPassword) {
        showErrorToast('Passwords do not match.');
        return;
    }

    const button = document.getElementById('register-btn');

    try {
        setAuthButtonBusy(
            button,
            true,
            '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...',
            '<i class="fa-solid fa-user-plus"></i> Create Account'
        );

        const db = requireSupabase();
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'teacher'
                },
                emailRedirectTo: getSikLabAuthRedirectUrl()
            }
        });

        if (error) throw error;

        // Depending on Supabase anti-enumeration settings, an already-existing
        // email can return an obfuscated user with no identities instead of an error.
        if (
            data?.user &&
            Array.isArray(data.user.identities) &&
            data.user.identities.length === 0
        ) {
            throw new Error('This email may already have an account. Try signing in instead.');
        }

        // If Confirm Email is OFF, Supabase may return an active session immediately.
        if (data?.session?.user) {
            window.siklabCurrentUser = data.session.user;
            sessionStorage.removeItem(SIKLAB_PENDING_CONFIRM_EMAIL);

            const displayName = getTeacherDisplayName(data.session.user);
            sessionStorage.setItem('siklab_teacher_session', displayName);

            proceedToDashboard(
                displayName,
                true,
                `Welcome to SikLab, ${displayName}!`
            );
            return;
        }

        sessionStorage.setItem(SIKLAB_PENDING_CONFIRM_EMAIL, email);
        showConfirmationPanel(email);
        showToast('Account created. Check your email to confirm it.');
    } catch (error) {
        console.error('[SikLab register]', error);
        showErrorToast(
            getFriendlyPasswordAuthError(
                error,
                'Unable to create the account.'
            )
        );
    } finally {
        setAuthButtonBusy(
            button,
            false,
            '',
            '<i class="fa-solid fa-user-plus"></i> Create Account'
        );
    }
}

async function resendConfirmationEmail() {
    const email = normalizeEmail(
        sessionStorage.getItem(SIKLAB_PENDING_CONFIRM_EMAIL) ||
        document.getElementById('register-email')?.value ||
        document.getElementById('login-email')?.value
    );

    if (!email) {
        showErrorToast('Enter your email first.');
        showRegisterForm();
        return;
    }

    const button = document.getElementById('resend-confirmation-btn');

    try {
        setAuthButtonBusy(
            button,
            true,
            '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Sending...',
            '<i class="fa-solid fa-paper-plane mr-2"></i> Resend Confirmation Email'
        );

        const db = requireSupabase();
        const { error } = await db.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: getSikLabAuthRedirectUrl()
            }
        });

        if (error) throw error;

        sessionStorage.setItem(SIKLAB_PENDING_CONFIRM_EMAIL, email);
        showToast('Confirmation email sent. Check your inbox.');
    } catch (error) {
        console.error('[SikLab resend confirmation]', error);
        showErrorToast(
            getFriendlyPasswordAuthError(
                error,
                'Unable to resend the confirmation email.'
            )
        );
    } finally {
        setAuthButtonBusy(
            button,
            false,
            '',
            '<i class="fa-solid fa-paper-plane mr-2"></i> Resend Confirmation Email'
        );
    }
}

function proceedToDashboard(name, showWelcomeToast = true, customMessage = null) {
    const displayName = name || 'Teacher';
    const nameEl = document.getElementById('teacher-display-name');
    const avatar = document.getElementById('avatar-initial');

    if (nameEl) nameEl.innerText = displayName;
    if (avatar) avatar.innerText = displayName.charAt(0).toUpperCase();

    const auth = document.getElementById('auth-screen');
    if (auth) auth.style.opacity = '0';

    setTimeout(async () => {
        auth?.classList.add('hidden');

        const dash = document.getElementById('dashboard-layout');
        if (dash) {
            dash.classList.remove('hidden');
            setTimeout(() => { dash.style.opacity = '1'; }, 50);
        }

        try {
            await fetchSchoolYears();
            if (window.currentSchoolYearId) await fetchStudentsFromDB();
            await loadGames();
            renderGroupSetDropdown();

            if (typeof initESP32Realtime === 'function') {
                initESP32Realtime();
            }

            if (showWelcomeToast) {
                showToast(customMessage || `Welcome back, ${displayName}!`);
            }
        } catch (error) {
            console.error('[dashboard load]', error);
        }
    }, 350);
}

async function forceLogout() {
    try {
        if (window.supabaseClient) {
            await window.supabaseClient.auth.signOut();
        }
    } catch (error) {
        console.warn('[logout]', error);
    }

    window.siklabCurrentUser = null;
    sessionStorage.removeItem('siklab_teacher_session');

    const dash = document.getElementById('dashboard-layout');
    if (dash) dash.style.opacity = '0';

    setTimeout(() => {
        const loginPassword = document.getElementById('login-password');
        if (loginPassword) loginPassword.value = '';
        showAuthScreen();
    }, 250);
}

async function handleLogout() {
    await forceLogout();
    showToast('Logged out securely.');
}
