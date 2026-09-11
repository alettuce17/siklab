/* =========================================================
 * SIKLAB CORE / AUTH GUARD
 * ========================================================= */

function applyMiddleware(actionName, payload, nextFunction) {
    const publicActions = ['INITIALIZE', 'LOGIN', 'REGISTER'];
    const hasSession = !!window.siklabCurrentUser;

    if (!hasSession && !publicActions.includes(actionName)) {
        showErrorToast('Unauthorized! Please login.');
        forceLogout();
        return;
    }

    if (typeof nextFunction === 'function') nextFunction(payload);
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

async function isApprovedTeacherAccount(user) {
    if (!user?.id) return false;

    const db = requireSupabase();
    const { data, error } = await db
        .from('teacher_profiles')
        .select('is_approved')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('[teacher approval]', error);
        throw new Error('Could not verify teacher account approval.');
    }

    return data?.is_approved === true;
}

async function initializeApp() {
    resetSelections();

    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase is not configured.');
        }

        const { data, error } = await window.supabaseClient.auth.getSession();
        if (error) throw error;

        window.siklabCurrentUser = data.session?.user || null;

        if (window.siklabCurrentUser) {
            const approved = await isApprovedTeacherAccount(window.siklabCurrentUser);
            if (!approved) {
                await window.supabaseClient.auth.signOut();
                window.siklabCurrentUser = null;
                throw new Error('This teacher account is waiting for approval.');
            }
        }

        setTimeout(() => {
            document.getElementById('loader-screen')?.classList.add('hidden');

            if (window.siklabCurrentUser) {
                proceedToDashboard(getTeacherDisplayName(window.siklabCurrentUser), false);
            } else {
                showAuthScreen();
            }
        }, 450);
    } catch (error) {
        console.error('[SikLab initialize]', error);
        document.getElementById('loader-screen')?.classList.add('hidden');
        showAuthScreen();
        setTimeout(() => showErrorToast(error.message), 300);
    }
}
