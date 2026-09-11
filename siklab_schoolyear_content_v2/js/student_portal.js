/* =========================================================
 * SIKLAB STUDENT PORTAL
 * Dynamically renders published Lesson Builder content.
 * Normal student mode: active school year, published lessons only.
 * Teacher preview mode: selected year, drafts included.
 * ========================================================= */

let studentPortalLessons = [];
let studentPortalYearId = null;
let studentPortalYearLabel = '';
let studentPortalPreview = false;
let studentPortalName = 'Explorer';
let studentPortalStars = 0;
let studentPortalCompleted = new Set();
const lessonQuizProgress = new Map();

window.addEventListener('DOMContentLoaded', initializeStudentPortal);

function studentPortalParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        preview: params.get('preview') === '1',
        yearId: Number(params.get('year') || 0) || null
    };
}

async function canUseTeacherPreview() {
    try {
        const db = requireSupabase();
        const { data: sessionData } = await db.auth.getSession();
        const user = sessionData?.session?.user;
        if (!user?.id) return false;
        const { data, error } = await db.from('teacher_profiles')
            .select('is_approved')
            .eq('user_id', user.id)
            .maybeSingle();
        if (error) return false;
        return data?.is_approved === true;
    } catch (_) {
        return false;
    }
}

async function initializeStudentPortal() {
    const params = studentPortalParams();
    studentPortalPreview = params.preview && await canUseTeacherPreview();

    if (studentPortalPreview) {
        studentPortalName = 'Teacher Preview';
        document.getElementById('student-login-screen')?.classList.add('hidden');
        document.getElementById('student-logout-button')?.classList.add('hidden');
        document.getElementById('preview-mode-note')?.classList.remove('hidden');
        showStudentShell();
        await loadStudentCurriculum(params.yearId, true);
        return;
    }

    const savedName = localStorage.getItem('siklab_student_name');
    if (savedName) {
        studentPortalName = savedName;
        document.getElementById('student-login-screen')?.classList.add('hidden');
        showStudentShell();
        await loadStudentCurriculum(null, false);
    } else {
        document.getElementById('student-login-screen')?.classList.remove('hidden');
    }
}

async function handleStudentPortalLogin(event) {
    event.preventDefault();
    const input = document.getElementById('student-portal-name');
    const name = String(input?.value || '').trim();
    if (!name) return;
    studentPortalName = name.slice(0, 80);
    localStorage.setItem('siklab_student_name', studentPortalName);
    document.getElementById('student-login-screen')?.classList.add('hidden');
    showStudentShell();
    await loadStudentCurriculum(null, false);
}

function logoutStudentPortal() {
    localStorage.removeItem('siklab_student_name');
    location.reload();
}

function showStudentShell() {
    document.getElementById('student-app')?.classList.remove('hidden');
    document.getElementById('student-header-name').textContent = studentPortalName;
    document.getElementById('student-welcome-name').textContent = studentPortalName;
}

function studentProgressKey() {
    return `siklab_student_portal_progress:${studentPortalYearId || 'active'}:${studentPortalName.toLowerCase()}`;
}

function loadLocalStudentProgress() {
    if (studentPortalPreview) {
        studentPortalStars = 0;
        studentPortalCompleted = new Set();
        updateStudentStarDisplay();
        return;
    }
    try {
        const parsed = JSON.parse(localStorage.getItem(studentProgressKey()) || '{}');
        studentPortalStars = Number(parsed.stars || 0);
        studentPortalCompleted = new Set(Array.isArray(parsed.completed) ? parsed.completed.map(Number) : []);
    } catch (_) {
        studentPortalStars = 0;
        studentPortalCompleted = new Set();
    }
    updateStudentStarDisplay();
}

function saveLocalStudentProgress() {
    if (studentPortalPreview) return;
    localStorage.setItem(studentProgressKey(), JSON.stringify({
        stars: studentPortalStars,
        completed: [...studentPortalCompleted]
    }));
}

function updateStudentStarDisplay() {
    const el = document.getElementById('student-star-count');
    if (el) el.textContent = String(studentPortalStars);
}

async function loadStudentCurriculum(requestedYearId = null, includeDrafts = false) {
    const loading = document.getElementById('student-loading');
    loading?.classList.remove('hidden');
    document.getElementById('student-home-view')?.classList.add('hidden');
    document.getElementById('student-lesson-view')?.classList.add('hidden');
    document.getElementById('student-empty-view')?.classList.add('hidden');

    try {
        const db = requireSupabase();
        const { data, error } = await db.rpc('get_student_portal_lessons', {
            p_year_id: requestedYearId,
            p_include_drafts: !!includeDrafts
        });
        if (error) throw error;

        studentPortalLessons = (data || []).map(row => ({
            yearId: Number(row.year_id),
            yearLabel: row.year_label || '',
            moduleId: Number(row.module_id),
            weekId: Number(row.week_id),
            label: row.label || `Lesson ${row.week_id}`,
            title: row.title || 'Science Lesson',
            subtitle: row.subtitle || '',
            icon: row.icon || 'fa-book-open',
            color: safeThemeColor(row.color || 'blue'),
            completionType: row.completion_type || 'view',
            lessonJson: row.lesson_json || {},
            isPublished: row.is_published !== false
        }));

        const first = studentPortalLessons[0];
        if (first) {
            studentPortalYearId = first.yearId;
            studentPortalYearLabel = first.yearLabel;
        } else {
            const { data: yearRows, error: yearError } = await db.rpc('get_student_portal_year', {
                p_year_id: requestedYearId
            });
            if (yearError) throw yearError;
            const year = yearRows?.[0];
            studentPortalYearId = Number(year?.year_id || 0) || requestedYearId || null;
            studentPortalYearLabel = year?.year_label || (studentPortalPreview ? 'Selected School Year' : 'Active School Year');
        }
        window.currentSchoolYearId = studentPortalYearId;
        window.currentSchoolYearLabel = studentPortalYearLabel;

        loadLocalStudentProgress();
        updateStudentPortalYearUI();
        renderStudentLessonNavigation();
        renderStudentMap();

        loading?.classList.add('hidden');
        if (studentPortalLessons.length) showStudentHome();
        else document.getElementById('student-empty-view')?.classList.remove('hidden');
    } catch (error) {
        console.error('[student curriculum]', error);
        loading?.classList.add('hidden');
        const empty = document.getElementById('student-empty-view');
        empty?.classList.remove('hidden');
        if (empty) {
            const p = empty.querySelector('p');
            if (p) p.textContent = (error.message || 'Could not load lessons.') + ' Ask your teacher to check the SikLab Supabase setup.';
        }
    }
}

function updateStudentPortalYearUI() {
    ['student-year-side','student-year-header','student-map-year'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = studentPortalYearLabel || 'School Year';
    });
    const pill = document.getElementById('student-active-year-pill');
    if (pill) pill.textContent = studentPortalPreview ? `Preview • ${studentPortalYearLabel}` : studentPortalYearLabel;
}

function renderStudentLessonNavigation() {
    const nav = document.getElementById('student-lesson-nav');
    if (!nav) return;

    nav.innerHTML = studentPortalLessons.map(lesson => {
        const draft = !lesson.isPublished;
        return `<button onclick="openStudentLesson(${lesson.moduleId})" id="student-nav-lesson-${lesson.moduleId}" class="student-lesson-nav-btn w-full flex items-center p-3 lg:px-5 lg:py-4 rounded-2xl hover:bg-sky-900 text-sky-200 font-black transition-all text-left">
            <i class="fa-solid ${escapeAttr(lesson.icon)} text-lg w-8 text-center"></i>
            <span class="hidden lg:block ml-2 truncate">${escapeHtml(lesson.label)}</span>
            ${draft ? '<span class="hidden lg:inline ml-auto text-[9px] bg-slate-700 text-slate-200 px-2 py-1 rounded-full">DRAFT</span>' : ''}
        </button>`;
    }).join('');
}

function renderStudentMap() {
    const grid = document.getElementById('student-map-grid');
    const count = document.getElementById('student-lesson-count');
    if (count) count.textContent = `${studentPortalLessons.length} Lesson${studentPortalLessons.length === 1 ? '' : 's'}`;
    if (!grid) return;

    grid.innerHTML = studentPortalLessons.map(lesson => {
        const completed = studentPortalCompleted.has(lesson.moduleId);
        const draft = !lesson.isPublished;
        return `<button onclick="openStudentLesson(${lesson.moduleId})" class="text-left bg-white rounded-[2rem] p-6 border-4 ${completed ? 'border-emerald-400' : 'border-sky-200'} hover:border-orange-400 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all relative overflow-hidden group">
            <div class="flex items-start justify-between gap-3">
                <div class="w-16 h-16 rounded-2xl bg-${lesson.color}-100 text-${lesson.color}-600 flex items-center justify-center text-3xl"><i class="fa-solid ${escapeAttr(lesson.icon)}"></i></div>
                <div class="flex flex-col items-end gap-2">
                    ${completed ? '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-black"><i class="fa-solid fa-check mr-1"></i>DONE</span>' : ''}
                    ${draft ? '<span class="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black">DRAFT PREVIEW</span>' : ''}
                </div>
            </div>
            <p class="text-xs font-black uppercase tracking-wider text-orange-500 mt-5">${escapeHtml(lesson.label)}</p>
            <h3 class="text-2xl font-black text-sky-950 mt-1 fun-font">${escapeHtml(lesson.title)}</h3>
            <p class="text-sm font-bold text-slate-500 mt-2">${escapeHtml(lesson.subtitle || (lesson.completionType === 'quiz' ? 'Includes a Brain Check' : 'Reading lesson'))}</p>
            <div class="mt-5 text-sky-600 font-black">Open Lesson <i class="fa-solid fa-arrow-right ml-1 group-hover:translate-x-1 transition-transform"></i></div>
        </button>`;
    }).join('');
}

function showStudentHome() {
    document.getElementById('student-home-view')?.classList.remove('hidden');
    document.getElementById('student-lesson-view')?.classList.add('hidden');
    document.getElementById('student-empty-view')?.classList.add('hidden');
    setStudentActiveNav('home');
}

function setStudentActiveNav(target) {
    const home = document.getElementById('student-nav-home');
    const buttons = document.querySelectorAll('.student-lesson-nav-btn');
    home?.classList.remove('bg-orange-500','shadow-[0_4px_0_#c2410c]');
    home?.classList.add('hover:bg-sky-900','text-sky-200');
    buttons.forEach(btn => {
        btn.classList.remove('bg-orange-500','text-white','shadow-[0_4px_0_#c2410c]');
        btn.classList.add('hover:bg-sky-900','text-sky-200');
    });
    if (target === 'home') {
        home?.classList.add('bg-orange-500','shadow-[0_4px_0_#c2410c]');
        home?.classList.remove('hover:bg-sky-900','text-sky-200');
    } else {
        const btn = document.getElementById(`student-nav-lesson-${target}`);
        btn?.classList.add('bg-orange-500','text-white','shadow-[0_4px_0_#c2410c]');
        btn?.classList.remove('hover:bg-sky-900','text-sky-200');
    }
}

function openStudentLesson(moduleId) {
    const lesson = studentPortalLessons.find(item => item.moduleId === Number(moduleId));
    if (!lesson) return;

    document.getElementById('student-home-view')?.classList.add('hidden');
    document.getElementById('student-empty-view')?.classList.add('hidden');
    document.getElementById('student-lesson-view')?.classList.remove('hidden');
    setStudentActiveNav(lesson.moduleId);
    renderStudentLesson(lesson);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderStudentLesson(lesson) {
    const container = document.getElementById('student-lesson-container');
    if (!container) return;

    const blocks = Array.isArray(lesson.lessonJson?.blocks) ? lesson.lessonJson.blocks : [];
    lessonQuizProgress.set(lesson.moduleId, { total: blocks.filter(b => b.type === 'quiz').length, correct: new Set() });

    container.innerHTML = `
        <div class="bg-white rounded-[2.5rem] shadow-xl border-4 border-sky-100 overflow-hidden">
            <div class="bg-gradient-to-r from-sky-700 to-blue-600 p-8 text-white relative overflow-hidden">
                <div class="relative z-10">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="bg-white/15 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">${escapeHtml(lesson.label)}</span>
                        ${!lesson.isPublished ? '<span class="bg-slate-900/60 px-3 py-1 rounded-full text-xs font-black uppercase">Draft Preview</span>' : ''}
                    </div>
                    <h1 class="text-4xl md:text-5xl font-black fun-font mt-4">${escapeHtml(lesson.title)}</h1>
                    <p class="text-sky-100 font-bold text-lg mt-2">${escapeHtml(lesson.subtitle || 'Interactive Science Module')}</p>
                </div>
                <i class="fa-solid ${escapeAttr(lesson.icon)} absolute right-8 bottom-0 text-[140px] text-white/10"></i>
            </div>
            <div class="p-6 md:p-10 space-y-7" id="lesson-blocks-${lesson.moduleId}">
                ${blocks.length ? blocks.map((block, index) => renderStudentBlock(block, lesson, index)).join('') : '<div class="text-center text-slate-400 font-bold py-10">This lesson has no content blocks yet.</div>'}
                <div class="pt-4 border-t-2 border-dashed border-sky-100">
                    <button onclick="completeStudentLesson(${lesson.moduleId})" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl py-4 rounded-2xl shadow-[0_5px_0_#047857] active:shadow-none active:translate-y-[5px] transition-all"><i class="fa-solid fa-flag-checkered mr-2"></i>FINISH LESSON</button>
                    <p class="text-center text-xs font-bold text-slate-400 mt-3">${lesson.completionType === 'quiz' ? 'Answer all Brain Checks correctly before finishing.' : 'This is a view-only lesson.'}</p>
                </div>
            </div>
        </div>`;
}

function renderStudentBlock(block, lesson, index) {
    if (!block || typeof block !== 'object') return '';

    if (block.type === 'rich_text' || block.type === 'text') {
        return `<article class="lesson-rich text-lg md:text-xl leading-relaxed font-semibold text-slate-700 bg-sky-50/50 border border-sky-100 rounded-3xl p-6 md:p-8">${sanitizeRichHtml(block.content || '')}</article>`;
    }

    if (block.type === 'interactive_fact') {
        return `<div class="rounded-3xl border-4 border-orange-200 bg-orange-50 p-6 text-center">
            <div class="w-16 h-16 mx-auto rounded-2xl bg-orange-500 text-white flex items-center justify-center text-2xl shadow-md"><i class="fa-solid ${escapeAttr(block.reveal_icon || 'fa-star')}"></i></div>
            <h3 class="text-2xl font-black text-orange-900 mt-4">${escapeHtml(block.question || 'Tap to discover!')}</h3>
            <button onclick="revealStudentFact(this)" data-answer="${escapeAttr(block.reveal_text || '')}" class="mt-5 bg-white border-2 border-orange-300 text-orange-700 font-black px-6 py-3 rounded-2xl hover:bg-orange-100">Tap to Reveal</button>
            <div class="student-fact-answer hidden mt-5 bg-white rounded-2xl p-5 text-lg font-black text-slate-700 border border-orange-200"></div>
        </div>`;
    }

    if (block.type === 'quiz') {
        const options = Array.isArray(block.options) ? block.options.slice(0,4) : [];
        return `<div class="rounded-3xl border-4 border-emerald-200 bg-emerald-50 p-6 md:p-8" data-quiz-module="${lesson.moduleId}" data-quiz-index="${index}" data-correct="${Number(block.correctIndex || 0)}">
            <div class="flex items-center gap-3"><div class="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xl"><i class="fa-solid fa-circle-question"></i></div><div><p class="text-xs font-black uppercase tracking-wider text-emerald-600">Brain Check</p><h3 class="text-2xl font-black text-emerald-950">${escapeHtml(block.question || 'Choose the correct answer')}</h3></div></div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                ${options.map((option, optionIndex) => `<button onclick="answerStudentQuiz(this, ${optionIndex})" class="student-quiz-option bg-white hover:bg-emerald-100 border-2 border-emerald-200 text-slate-700 font-black px-5 py-4 rounded-2xl transition-colors">${escapeHtml(option)}</button>`).join('')}
            </div>
            <div class="student-quiz-feedback hidden mt-4 rounded-xl p-4 font-black text-center"></div>
        </div>`;
    }

    return '';
}

function revealStudentFact(button) {
    const card = button.closest('div.rounded-3xl');
    const answer = card?.querySelector('.student-fact-answer');
    if (!answer) return;
    answer.textContent = button.dataset.answer || '';
    answer.classList.remove('hidden');
    button.classList.add('hidden');
}

function answerStudentQuiz(button, chosenIndex) {
    const card = button.closest('[data-quiz-module]');
    if (!card) return;
    const moduleId = Number(card.dataset.quizModule);
    const quizIndex = Number(card.dataset.quizIndex);
    const correctIndex = Number(card.dataset.correct);
    const feedback = card.querySelector('.student-quiz-feedback');
    const buttons = card.querySelectorAll('.student-quiz-option');

    buttons.forEach(btn => btn.classList.remove('bg-red-100','border-red-400','bg-emerald-200','border-emerald-500'));
    if (chosenIndex === correctIndex) {
        button.classList.add('bg-emerald-200','border-emerald-500');
        if (feedback) {
            feedback.textContent = 'Correct! Great job!';
            feedback.className = 'student-quiz-feedback mt-4 rounded-xl p-4 font-black text-center bg-emerald-100 text-emerald-700';
        }
        const state = lessonQuizProgress.get(moduleId);
        if (state && !state.correct.has(quizIndex)) {
            state.correct.add(quizIndex);
            if (!studentPortalPreview) {
                studentPortalStars += 5;
                updateStudentStarDisplay();
                saveLocalStudentProgress();
            }
        }
    } else {
        button.classList.add('bg-red-100','border-red-400');
        if (feedback) {
            feedback.textContent = 'Not yet. Try another answer!';
            feedback.className = 'student-quiz-feedback mt-4 rounded-xl p-4 font-black text-center bg-red-100 text-red-600';
        }
    }
}

function completeStudentLesson(moduleId) {
    const lesson = studentPortalLessons.find(item => item.moduleId === Number(moduleId));
    if (!lesson) return;

    const state = lessonQuizProgress.get(Number(moduleId));
    if (lesson.completionType === 'quiz' && state && state.total > 0 && state.correct.size < state.total) {
        alert(`Complete all ${state.total} Brain Check${state.total === 1 ? '' : 's'} correctly first.`);
        return;
    }

    if (!studentPortalPreview && !studentPortalCompleted.has(Number(moduleId))) {
        studentPortalCompleted.add(Number(moduleId));
        studentPortalStars += 10;
        saveLocalStudentProgress();
        updateStudentStarDisplay();
    }
    alert(studentPortalPreview ? 'Preview: lesson completion is not saved.' : 'Lesson complete! +10 stars');
    renderStudentMap();
    showStudentHome();
}
