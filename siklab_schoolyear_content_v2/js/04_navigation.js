/* =========================================================
 * NAVIGATION & TOASTS
 * ========================================================= */

function switchTab(tabId) {
    applyMiddleware('SWITCH_TAB', { targetTab: tabId }, () => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.nav-btn').forEach(el => {
            el.classList.remove('bg-orange-600', 'text-white', 'shadow-md');
            el.classList.add('text-orange-200', 'hover:bg-stone-800', 'hover:text-white');
        });

        const viewEl = document.getElementById(`view-${tabId}`);
        if (viewEl) viewEl.classList.remove('hidden');

        const activeBtn = document.getElementById(`nav-${tabId}`);
        if (activeBtn) {
            activeBtn.classList.remove('text-orange-200', 'hover:bg-stone-800');
            activeBtn.classList.add('bg-orange-600', 'text-white', 'shadow-md');
        }

        if (tabId === 'lesson-builder') {
            const frame = document.getElementById('lesson-builder-frame');
            if (frame && !frame.src.includes('lesson_builder.html')) {
                frame.src = `lesson_builder.html?year=${encodeURIComponent(window.currentSchoolYearId || '')}`;
            }
        }

        const titles = {
            overview: { t: 'Dashboard Overview', s: 'Welcome back to SikLab.' },
            students: { t: 'Student Management', s: 'Add, remove, and manage your class roster.' },
            wheel: { t: 'Selection & Grouping', s: 'Randomize student selection and create teams.' },
            content: { t: 'Question Bank', s: 'Customize game questions and assets.' },
            'lesson-builder': { t: 'LMS Lesson Builder', s: 'Design interactive science lessons for the selected school year.' },
            curriculum: { t: 'Curriculum Manager', s: 'Create school years, copy curriculum, and manage content.' },
            'student-preview': { t: 'Student Portal Preview', s: 'Preview the lessons students will see.' },
            history: { t: 'Match History', s: 'Review game results and scores.' },
            settings: { t: 'System Settings', s: 'Configure game modules and scoring.' },
            'device-setup': { t: 'ESP Player Setup', s: 'Pair and monitor internet-connected controllers.' },
            admin: { t: 'Admin & Analytics', s: 'Manage school years and student progress.' }
        };

        if (titles[tabId]) {
            const titleEl = document.getElementById('header-title');
            const subEl = document.getElementById('header-subtitle');
            if (titleEl) titleEl.innerText = titles[tabId].t;
            if (subEl) subEl.innerText = titles[tabId].s;
        }

        if (tabId === 'wheel') {
            initWheel();
            renderGroupSetDropdown();
        }
        if (tabId === 'content' && typeof loadCustomQuestions === 'function') loadCustomQuestions();
        if (tabId === 'curriculum' && typeof loadContentManagement === 'function') loadContentManagement();
        if (tabId === 'student-preview' && typeof refreshStudentPreview === 'function') refreshStudentPreview();
        if (tabId === 'history') loadHistory();
        if (tabId === 'device-setup' && typeof initializeDeviceSetup === 'function') initializeDeviceSetup();
        if (tabId === 'admin') {
            fetchSchoolYears().then(() => {
                renderAdminYearList();
                loadProgressReport();
            });
        }
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-msg');
    if (!toast || !text) return;
    text.innerText = message;
    toast.classList.remove('translate-x-full', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-x-full', 'opacity-0'), 3000);
}

function showErrorToast(message) {
    const toast = document.getElementById('error-toast');
    const text = document.getElementById('error-toast-msg');
    if (!toast || !text) return;
    text.innerText = message;
    toast.classList.remove('translate-x-full', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-x-full', 'opacity-0'), 4000);
}


window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'siklab_lesson_saved') {
        if (typeof loadContentManagement === 'function') loadContentManagement();
        const preview = document.getElementById('view-student-preview');
        if (preview && !preview.classList.contains('hidden') && typeof refreshStudentPreview === 'function') {
            refreshStudentPreview();
        }
    }
});
