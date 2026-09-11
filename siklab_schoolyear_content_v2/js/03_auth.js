/* =========================================================
 * TEACHER AUTHENTICATION - SUPABASE AUTH
 * ========================================================= */

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
}

function toggleAuthMode() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authTitle = document.getElementById('auth-title');
    const heading = document.getElementById('auth-main-heading');

    if (!loginForm || !registerForm) return;

    if (loginForm.classList.contains('hidden')) {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        if (heading) heading.innerText = 'Welcome Back';
        if (authTitle) authTitle.innerText = 'Sign in to continue to your science dashboard.';
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        if (heading) heading.innerText = 'Create Account';
        if (authTitle) authTitle.innerText = 'Register a secure SikLab teacher account.';
    }
}

async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-pass')?.value || '';

    try {
        const db = requireSupabase();
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const approved = await isApprovedTeacherAccount(data.user);
        if (!approved) {
            await db.auth.signOut();
            throw new Error('This teacher account is waiting for approval.');
        }

        window.siklabCurrentUser = data.user;
        const name = getTeacherDisplayName(data.user);
        sessionStorage.setItem('siklab_teacher_session', name);
        proceedToDashboard(name, true);
    } catch (error) {
        console.error('[login]', error);
        showErrorToast(error.message || 'Login failed.');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const fullName = document.getElementById('reg-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const password = document.getElementById('reg-pass')?.value || '';
    const confirm = document.getElementById('reg-confirm')?.value || '';

    if (!fullName || !email) return showErrorToast('Complete all required fields.');
    if (password.length < 6) return showErrorToast('Password must be at least 6 characters.');
    if (password !== confirm) return showErrorToast('Passwords do not match!');

    try {
        const db = requireSupabase();
        const { data, error } = await db.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    role: 'teacher'
                }
            }
        });

        if (error) throw error;

        if (data.session?.user) {
            const approved = await isApprovedTeacherAccount(data.session.user);
            if (!approved) {
                await db.auth.signOut();
                showToast('Account created and is waiting for teacher approval.');
                toggleAuthMode();
                return;
            }

            window.siklabCurrentUser = data.session.user;
            sessionStorage.setItem('siklab_teacher_session', fullName);
            proceedToDashboard(fullName, true, 'Account created successfully!');
        } else {
            showToast('Account created. Check your email to confirm, then sign in.');
            toggleAuthMode();
        }
    } catch (error) {
        console.error('[register]', error);
        showErrorToast(error.message || 'Registration failed.');
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
            if (typeof initESP32Realtime === 'function') initESP32Realtime();
            if (showWelcomeToast) showToast(customMessage || `Welcome back, ${displayName}!`);
        } catch (error) {
            console.error('[dashboard load]', error);
        }
    }, 350);
}

async function forceLogout() {
    try {
        if (typeof stopESP32Realtime === 'function') await stopESP32Realtime();
        if (window.supabaseClient) await window.supabaseClient.auth.signOut();
    } catch (error) {
        console.warn('[logout]', error);
    }

    window.siklabCurrentUser = null;
    sessionStorage.removeItem('siklab_teacher_session');

    const dash = document.getElementById('dashboard-layout');
    if (dash) dash.style.opacity = '0';

    setTimeout(() => {
        showAuthScreen();
        const password = document.getElementById('login-pass');
        if (password) password.value = '';
    }, 250);
}

async function handleLogout() {
    await forceLogout();
    showToast('Logged out securely.');
}
