/* =========================================================
 * SIKLAB SUPABASE CLIENT
 * Cloud Configuration
 * ========================================================= */

// ============================================================
// SUPABASE CLOUD CONFIGURATION
// ============================================================

const SIKLAB_SUPABASE_URL =
    'https://xdnfldzjkzcpzxnclysr.supabase.co';

const SIKLAB_SUPABASE_PUBLISHABLE_KEY =
    'sb_publishable_qGXt-lD4Pwp8mSc1AbxRKw_yvICCoO9';


// ============================================================
// GLOBAL STATE
// ============================================================

window.SIKLAB_CLOUD_READY = false;
window.supabaseClient = null;
window.siklabCurrentUser = null;


// ============================================================
// CONFIGURATION CHECK
// ============================================================

function siklabSupabaseConfigured() {

    const validUrl =
        typeof SIKLAB_SUPABASE_URL === 'string' &&
        SIKLAB_SUPABASE_URL.length > 0 &&
        (
            SIKLAB_SUPABASE_URL.startsWith('https://') ||
            SIKLAB_SUPABASE_URL.startsWith('http://127.0.0.1') ||
            SIKLAB_SUPABASE_URL.startsWith('http://localhost')
        );

    const validKey =
        typeof SIKLAB_SUPABASE_PUBLISHABLE_KEY === 'string' &&
        SIKLAB_SUPABASE_PUBLISHABLE_KEY.length > 20 &&
        !SIKLAB_SUPABASE_PUBLISHABLE_KEY.includes('YOUR_SUPABASE') &&
        !SIKLAB_SUPABASE_PUBLISHABLE_KEY.includes('PASTE_');

    return validUrl && validKey;
}


// ============================================================
// CLOUD STATUS DISPLAY
// ============================================================

function setCloudStatus(text, ok = false) {

    const status = document.getElementById('stat-cloud-status');

    if (status) {

        status.innerText = text;

        status.className = ok
            ? 'text-2xl font-black text-emerald-500 mt-1'
            : 'text-2xl font-black text-amber-500 mt-1';
    }


    const deviceStatus =
        document.getElementById('device-cloud-status');

    if (deviceStatus) {

        deviceStatus.className = ok
            ? 'inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-black text-xs self-start md:self-auto'
            : 'inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-black text-xs self-start md:self-auto';

        deviceStatus.innerHTML = ok
            ? '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> CLOUD READY'
            : '<span class="w-2 h-2 rounded-full bg-amber-500"></span> CLOUD NOT CONFIGURED';
    }
}


// ============================================================
// SAFE STATUS UPDATE
// ============================================================

function updateCloudStatusWhenReady(text, ok) {

    if (document.readyState === 'loading') {

        document.addEventListener(
            'DOMContentLoaded',
            () => setCloudStatus(text, ok),
            { once: true }
        );

    } else {

        setCloudStatus(text, ok);
    }
}


// ============================================================
// INITIALIZE SUPABASE
// ============================================================

(function initializeSupabaseClient() {

    console.log('[SikLab] Initializing Supabase...');

    // --------------------------------------------------------
    // Check configuration
    // --------------------------------------------------------

    if (!siklabSupabaseConfigured()) {

        console.error(
            '[SikLab] Supabase configuration is invalid.'
        );

        updateCloudStatusWhenReady(
            'Not Configured',
            false
        );

        return;
    }


    // --------------------------------------------------------
    // Check Supabase JavaScript library
    // --------------------------------------------------------

    if (
        !window.supabase ||
        typeof window.supabase.createClient !== 'function'
    ) {

        console.error(
            '[SikLab] Supabase JS library did not load.'
        );

        updateCloudStatusWhenReady(
            'Library Error',
            false
        );

        return;
    }


    // --------------------------------------------------------
    // Create Supabase client
    // --------------------------------------------------------

    try {

        window.supabaseClient =
            window.supabase.createClient(
                SIKLAB_SUPABASE_URL,
                SIKLAB_SUPABASE_PUBLISHABLE_KEY,
                {
                    auth: {

                        persistSession: true,

                        autoRefreshToken: true,

                        detectSessionInUrl: true

                    }
                }
            );


        window.SIKLAB_CLOUD_READY = true;


        console.log(
            '[SikLab] Supabase client created successfully.'
        );

        console.log(
            '[SikLab] Project URL:',
            SIKLAB_SUPABASE_URL
        );


        updateCloudStatusWhenReady(
            'Online',
            true
        );


        // ----------------------------------------------------
        // Initial authentication session
        // ----------------------------------------------------

        window.supabaseClient.auth
            .getSession()
            .then(({ data, error }) => {

                if (error) {

                    console.warn(
                        '[SikLab] Unable to read auth session:',
                        error.message
                    );

                    return;
                }


                const session = data?.session || null;

                window.siklabCurrentUser =
                    session?.user || null;


                if (session?.user) {

                    const teacherName =
                        session.user.user_metadata?.full_name ||
                        session.user.email ||
                        'Teacher';


                    sessionStorage.setItem(
                        'siklab_teacher_session',
                        teacherName
                    );

                } else {

                    sessionStorage.removeItem(
                        'siklab_teacher_session'
                    );
                }
            });


        // ----------------------------------------------------
        // Listen for authentication changes
        // ----------------------------------------------------

        window.supabaseClient.auth
            .onAuthStateChange(
                (_event, session) => {

                    window.siklabCurrentUser =
                        session?.user || null;


                    if (session?.user) {

                        const teacherName =
                            session.user.user_metadata?.full_name ||
                            session.user.email ||
                            'Teacher';


                        sessionStorage.setItem(
                            'siklab_teacher_session',
                            teacherName
                        );


                        console.log(
                            '[SikLab] Teacher authenticated:',
                            teacherName
                        );

                    } else {

                        sessionStorage.removeItem(
                            'siklab_teacher_session'
                        );


                        console.log(
                            '[SikLab] No teacher session.'
                        );
                    }
                }
            );


    } catch (error) {

        console.error(
            '[SikLab] Supabase initialization failed:',
            error
        );


        window.SIKLAB_CLOUD_READY = false;

        window.supabaseClient = null;


        updateCloudStatusWhenReady(
            'Connection Error',
            false
        );
    }

})();


// ============================================================
// REQUIRE SUPABASE HELPER
// ============================================================

function requireSupabase() {

    if (!window.supabaseClient) {

        throw new Error(
            'Supabase is not configured or failed to initialize.'
        );
    }

    return window.supabaseClient;
}


// ============================================================
// TEST CONNECTION HELPER
// You can run: testSikLabSupabase()
// in Chrome DevTools Console.
// ============================================================

async function testSikLabSupabase() {

    console.log(
        '[SikLab Test] Testing Supabase connection...'
    );


    if (!window.supabaseClient) {

        console.error(
            '[SikLab Test] Supabase client is NULL.'
        );

        return false;
    }


    try {

        const {
            data,
            error
        } =
            await window.supabaseClient.auth.getSession();


        if (error) {

            console.error(
                '[SikLab Test] Connection failed:',
                error.message
            );

            return false;
        }


        console.log(
            '[SikLab Test] Supabase connection successful.'
        );


        console.log(
            '[SikLab Test] Cloud URL:',
            SIKLAB_SUPABASE_URL
        );


        console.log(
            '[SikLab Test] Session:',
            data?.session || 'No active login'
        );


        return true;


    } catch (error) {

        console.error(
            '[SikLab Test] Unexpected error:',
            error
        );


        return false;
    }
}