/* =========================================================
 * SIKLAB CORE / AUTH GUARD
 * Passwordless teacher authentication version.
 *
 * There is NO manual teacher approval check here.
 * Any user with a valid Supabase Auth session can enter the
 * teacher dashboard. Database RLS remains responsible for
 * protecting data.
 * ========================================================= */

function applyMiddleware(actionName, payload, nextFunction) {
    const publicActions = [
        'INITIALIZE',
        'SEND_OTP',
        'VERIFY_OTP',
        // Kept for compatibility with any older SikLab calls.
        'LOGIN',
        'REGISTER'
    ];

    const hasSession = !!window.siklabCurrentUser;

    if (!hasSession && !publicActions.includes(actionName)) {
        showErrorToast('Unauthorized! Please sign in.');
        forceLogout();
        return;
    }

    if (typeof nextFunction === 'function') {
        nextFunction(payload);
    }
}

function siklabSafe(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getTeacherDisplayName(user) {
    return (
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email?.split('@')[0] ||
        'Teacher'
    );
}

async function initializeApp() {
    resetSelections();

    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase is not configured.');
        }

        const { data, error } =
            await window.supabaseClient.auth.getSession();

        if (error) throw error;

        window.siklabCurrentUser = data?.session?.user || null;

        setTimeout(() => {
            document
                .getElementById('loader-screen')
                ?.classList.add('hidden');

            if (window.siklabCurrentUser) {
                proceedToDashboard(
                    getTeacherDisplayName(window.siklabCurrentUser),
                    false
                );
            } else {
                showAuthScreen();
            }
        }, 450);
    } catch (error) {
        console.error('[SikLab initialize]', error);

        document
            .getElementById('loader-screen')
            ?.classList.add('hidden');

        showAuthScreen();

        setTimeout(() => {
            showErrorToast(
                error?.message || 'Unable to initialize SikLab.'
            );
        }, 300);
    }
}
