/* =========================================================
 * SIKLAB TEACHER AUTHENTICATION
 * Passwordless Email OTP via Supabase Auth
 *
 * Flow:
 *   1) Teacher enters email.
 *   2) Supabase emails a 6-digit OTP.
 *   3) Teacher enters OTP.
 *   4) Existing user signs in; new user is created automatically.
 *
 * IMPORTANT:
 * In Supabase Dashboard -> Authentication -> Email Templates,
 * the Magic Link template must contain {{ .Token }} so an OTP
 * code is sent instead of only a magic link.
 * ========================================================= */

const SIKLAB_OTP_EMAIL_KEY = 'siklab_pending_email';
const SIKLAB_OTP_RESEND_SECONDS = 60;

let siklabOtpCooldownTimer = null;
let siklabOtpCooldownRemaining = 0;

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

    const pendingEmail = sessionStorage.getItem(SIKLAB_OTP_EMAIL_KEY);
    if (pendingEmail) {
        showOtpStep(pendingEmail, false);
    } else {
        showEmailStep();
    }
}

function setAuthHeading(headingText, subtitleText) {
    const heading = document.getElementById('auth-main-heading');
    const title = document.getElementById('auth-title');

    if (heading) heading.innerText = headingText;
    if (title) title.innerText = subtitleText;
}

function showEmailStep() {
    const loginForm = document.getElementById('login-form');
    const otpForm = document.getElementById('otp-form');

    loginForm?.classList.remove('hidden');
    otpForm?.classList.add('hidden');

    setAuthHeading(
        'Teacher Sign In',
        'Enter your email and we will send you a secure 6-digit code.'
    );

    const emailInput = document.getElementById('login-email');
    if (emailInput) setTimeout(() => emailInput.focus(), 100);
}

function showOtpStep(email, focusCode = true) {
    const loginForm = document.getElementById('login-form');
    const otpForm = document.getElementById('otp-form');
    const emailDisplay = document.getElementById('otp-email-display');

    loginForm?.classList.add('hidden');
    otpForm?.classList.remove('hidden');

    if (emailDisplay) emailDisplay.textContent = email;

    setAuthHeading(
        'Enter Verification Code',
        'Use the 6-digit code sent to your email to continue.'
    );

    if (focusCode) {
        const otpInput = document.getElementById('login-otp');
        if (otpInput) setTimeout(() => otpInput.focus(), 100);
    }
}

function formatOtpInput(input) {
    if (!input) return;
    input.value = String(input.value || '')
        .replace(/\D/g, '')
        .slice(0, 6);
}

function setAuthButtonBusy(button, busy, busyHtml, normalHtml) {
    if (!button) return;
    button.disabled = busy;
    button.innerHTML = busy ? busyHtml : normalHtml;
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getSikLabAuthRedirectUrl() {
    // Redirect magic-link fallbacks back to the exact SikLab site currently open.
    // Examples:
    //   Local:   http://localhost:3000/
    //   Netlify: https://your-site.netlify.app/
    //
    // The URL must also be allowed in Supabase:
    // Authentication -> URL Configuration -> Redirect URLs.
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
}



/* =========================================================
 * FRIENDLY AUTH ERROR MESSAGES
 * ========================================================= */
function getFriendlyAuthError(error, fallback = 'Authentication failed.') {
    const message = String(error?.message || '').trim();
    const lower = message.toLowerCase();
    const status = Number(error?.status || error?.statusCode || 0);

    if (
        status === 429 ||
        lower.includes('rate limit') ||
        lower.includes('too many requests')
    ) {
        return 'Too many login emails were requested. Please wait before trying again. If Custom SMTP is already enabled, check Supabase Authentication → Rate Limits.';
    }

    if (lower.includes('email address not authorized')) {
        return 'This email cannot receive messages from the Supabase test mailer. Enable Custom SMTP in Supabase Authentication → Emails → SMTP Settings.';
    }

    if (
        lower.includes('expired') ||
        lower.includes('invalid token') ||
        lower.includes('token is invalid') ||
        lower.includes('otp') && lower.includes('invalid')
    ) {
        return 'That verification code is invalid or expired. Request a new code and try again.';
    }

    if (lower.includes('email') && lower.includes('invalid')) {
        return 'Enter a valid email address.';
    }

    return message || fallback;
}

async function requestOtpForEmail(email) {
    const db = requireSupabase();

    const { error } = await db.auth.signInWithOtp({
        email,
        options: {
            // New teachers are created automatically after requesting OTP.
            shouldCreateUser: true,

            // If Supabase sends a clickable link as a fallback, do NOT hard-code
            // localhost. Send the user back to whichever SikLab site they used.
            emailRedirectTo: getSikLabAuthRedirectUrl()
        }
    });

    if (error) throw error;
}

async function handleSendCode(event) {
    event.preventDefault();

    const email = normalizeEmail(
        document.getElementById('login-email')?.value
    );

    if (!email) {
        showErrorToast('Enter your email address.');
        return;
    }

    const button = document.getElementById('send-code-btn');

    try {
        setAuthButtonBusy(
            button,
            true,
            '<i class="fa-solid fa-spinner fa-spin"></i> Sending Code...',
            '<i class="fa-solid fa-paper-plane"></i> Send Login Code'
        );

        await requestOtpForEmail(email);

        sessionStorage.setItem(SIKLAB_OTP_EMAIL_KEY, email);

        const otpInput = document.getElementById('login-otp');
        if (otpInput) otpInput.value = '';

        showOtpStep(email);
        startOtpResendCooldown(SIKLAB_OTP_RESEND_SECONDS);
        showToast('Verification code sent. Check your email.');
    } catch (error) {
        console.error('[SikLab send OTP]', error);
        showErrorToast(
            getFriendlyAuthError(
                error,
                'Unable to send the verification code.'
            )
        );
    } finally {
        setAuthButtonBusy(
            button,
            false,
            '',
            '<i class="fa-solid fa-paper-plane"></i> Send Login Code'
        );
    }
}

async function handleVerifyCode(event) {
    event.preventDefault();

    const email = normalizeEmail(
        sessionStorage.getItem(SIKLAB_OTP_EMAIL_KEY)
    );

    const token = String(
        document.getElementById('login-otp')?.value || ''
    )
        .replace(/\D/g, '')
        .slice(0, 6);

    if (!email) {
        showErrorToast('Email session was lost. Please request a new code.');
        changeLoginEmail();
        return;
    }

    if (token.length !== 6) {
        showErrorToast('Enter the complete 6-digit code.');
        return;
    }

    const button = document.getElementById('verify-code-btn');

    try {
        setAuthButtonBusy(
            button,
            true,
            '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...',
            '<i class="fa-solid fa-circle-check"></i> Verify & Continue'
        );

        const db = requireSupabase();
        const { data, error } = await db.auth.verifyOtp({
            email,
            token,
            type: 'email'
        });

        if (error) throw error;

        const user = data?.user || data?.session?.user || null;
        if (!user) {
            throw new Error('Verification succeeded but no user session was returned.');
        }

        window.siklabCurrentUser = user;
        sessionStorage.removeItem(SIKLAB_OTP_EMAIL_KEY);
        stopOtpResendCooldown();

        const displayName = getTeacherDisplayName(user);
        sessionStorage.setItem('siklab_teacher_session', displayName);

        proceedToDashboard(
            displayName,
            true,
            `Welcome to SikLab, ${displayName}!`
        );
    } catch (error) {
        console.error('[SikLab verify OTP]', error);
        showErrorToast(
            getFriendlyAuthError(
                error,
                'Invalid or expired verification code.'
            )
        );
    } finally {
        setAuthButtonBusy(
            button,
            false,
            '',
            '<i class="fa-solid fa-circle-check"></i> Verify & Continue'
        );
    }
}

async function resendLoginCode() {
    const email = normalizeEmail(
        sessionStorage.getItem(SIKLAB_OTP_EMAIL_KEY)
    );

    if (!email) {
        changeLoginEmail();
        return;
    }

    if (siklabOtpCooldownRemaining > 0) return;

    const button = document.getElementById('resend-code-btn');

    try {
        if (button) button.disabled = true;
        await requestOtpForEmail(email);
        startOtpResendCooldown(SIKLAB_OTP_RESEND_SECONDS);
        showToast('A new verification code was sent.');
    } catch (error) {
        console.error('[SikLab resend OTP]', error);
        showErrorToast(
            getFriendlyAuthError(
                error,
                'Unable to resend the verification code.'
            )
        );
        updateOtpResendButton();
    }
}

function changeLoginEmail() {
    sessionStorage.removeItem(SIKLAB_OTP_EMAIL_KEY);
    stopOtpResendCooldown();

    const otpInput = document.getElementById('login-otp');
    if (otpInput) otpInput.value = '';

    showEmailStep();
}

function startOtpResendCooldown(seconds = SIKLAB_OTP_RESEND_SECONDS) {
    stopOtpResendCooldown();

    siklabOtpCooldownRemaining = Math.max(0, Number(seconds) || 0);
    updateOtpResendButton();

    if (siklabOtpCooldownRemaining <= 0) return;

    siklabOtpCooldownTimer = setInterval(() => {
        siklabOtpCooldownRemaining -= 1;

        if (siklabOtpCooldownRemaining <= 0) {
            stopOtpResendCooldown();
            return;
        }

        updateOtpResendButton();
    }, 1000);
}

function stopOtpResendCooldown() {
    if (siklabOtpCooldownTimer) {
        clearInterval(siklabOtpCooldownTimer);
        siklabOtpCooldownTimer = null;
    }

    siklabOtpCooldownRemaining = 0;
    updateOtpResendButton();
}

function updateOtpResendButton() {
    const button = document.getElementById('resend-code-btn');
    const label = document.getElementById('resend-code-label');

    if (!button || !label) return;

    if (siklabOtpCooldownRemaining > 0) {
        button.disabled = true;
        label.textContent = `Resend in ${siklabOtpCooldownRemaining}s`;
    } else {
        button.disabled = false;
        label.textContent = 'Resend Code';
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
    sessionStorage.removeItem(SIKLAB_OTP_EMAIL_KEY);
    stopOtpResendCooldown();

    const dash = document.getElementById('dashboard-layout');
    if (dash) dash.style.opacity = '0';

    setTimeout(() => {
        showAuthScreen();

        const otpInput = document.getElementById('login-otp');
        if (otpInput) otpInput.value = '';
    }, 250);
}

async function handleLogout() {
    await forceLogout();
    showToast('Logged out securely.');
}
