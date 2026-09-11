// ============================================================================
// --- SIKLAB DRAG & DROP ENGINE ---
// ============================================================================

let activeImage = null;
let imageToolbar = null;
let loadedLessonContext = null;
const newlyUploadedLessonImages = new Set();
const pendingLessonImageDeletes = new Set();

document.addEventListener('DOMContentLoaded', () => {
    new Sortable(document.getElementById('block-palette'), {
        group: { name: 'shared', pull: 'clone', put: false },
        sort: false,
        animation: 150
    });

    new Sortable(document.getElementById('lesson-canvas'), {
        group: 'shared',
        animation: 150,
        handle: '.drag-handle',
        onAdd: function (evt) {
            const item = evt.item;
            const type = item.getAttribute('data-type');
            
            item.className = "bg-white p-1 rounded-2xl shadow-sm border border-slate-200 relative group";
            item.innerHTML = generateFormHTML(type);
        }
    });

    // --- CREATE THE FLOATING IMAGE TOOLBAR ---
    imageToolbar = document.createElement('div');
    imageToolbar.id = 'image-toolbar';
    imageToolbar.className = 'absolute z-50 bg-slate-800 text-white rounded-xl shadow-2xl flex items-center gap-1 p-1.5 hidden transition-opacity border border-slate-700';
    imageToolbar.innerHTML = `
        <button class="w-10 h-10 hover:bg-slate-600 rounded-lg flex items-center justify-center text-blue-400 transition-colors" onclick="alignActiveImage('left')" title="Align Left"><i class="fa-solid fa-align-left"></i></button>
        <button class="w-10 h-10 hover:bg-slate-600 rounded-lg flex items-center justify-center text-blue-400 transition-colors" onclick="alignActiveImage('center')" title="Align Center"><i class="fa-solid fa-align-center"></i></button>
        <button class="w-10 h-10 hover:bg-slate-600 rounded-lg flex items-center justify-center text-blue-400 transition-colors" onclick="alignActiveImage('right')" title="Align Right"><i class="fa-solid fa-align-right"></i></button>
        <div class="w-px h-8 bg-slate-600 mx-1"></div>
        <button class="w-10 h-10 hover:bg-red-500 rounded-lg flex items-center justify-center text-red-400 hover:text-white transition-colors" onclick="deleteActiveImage()" title="Delete Image"><i class="fa-solid fa-trash"></i></button>
    `;
    document.body.appendChild(imageToolbar);

    // Hide toolbar when scrolling the canvas to prevent it from floating away
    document.getElementById('canvas-scroll-area').addEventListener('scroll', hideImageToolbar);
    updateBuilderYearBadge();
});

async function updateBuilderYearBadge() {
    const badge = document.getElementById('builder-year-badge');
    if (!badge) return;
    try {
        if (window.parent && window.parent !== window && window.parent.currentSchoolYearLabel) {
            badge.textContent = window.parent.currentSchoolYearLabel;
            return;
        }
        const yearId = await getActiveYearId();
        if (!yearId) {
            badge.textContent = 'No school year';
            return;
        }
        const db = requireSupabase();
        const { data } = await db.from('school_years').select('label').eq('year_id', yearId).maybeSingle();
        badge.textContent = data?.label || `School Year ${yearId}`;
    } catch (_) {
        badge.textContent = 'School year';
    }
}

// ============================================================================
// --- DYNAMIC SCHOOL YEAR INTEGRATION (FIXED) ---
// ============================================================================

async function getActiveYearId() {
    if (window.parent && window.parent !== window && window.parent.currentSchoolYearId) {
        return Number(window.parent.currentSchoolYearId);
    }
    if (window.currentSchoolYearId) return Number(window.currentSchoolYearId);

    try {
        const db = requireSupabase();
        const { data, error } = await db.from('school_years')
            .select('year_id,is_active')
            .order('year_id', { ascending: true });
        if (error) throw error;

        const active = (data || []).find(row => row.is_active === true) || data?.[0];
        return active ? Number(active.year_id) : null;
    } catch (error) {
        console.error('[lesson builder active year]', error);
        return null;
    }
}

// ============================================================================
// --- HTML GENERATOR FOR BLOCKS ---
// ============================================================================
function generateFormHTML(type) {
    const controls = `
        <div class="absolute -top-3 -right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button class="w-8 h-8 bg-slate-800 text-white rounded-full flex items-center justify-center cursor-grab drag-handle shadow-md"><i class="fa-solid fa-grip-vertical"></i></button>
            <button class="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-red-600" onclick="removeLessonBlock(this)"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;

    if (type === 'rich_text') {
        const uid = 'editor_' + Date.now() + Math.floor(Math.random() * 1000);
        return controls + `
            <input type="hidden" class="block-type" value="rich_text">
            <div class="p-4 border-b border-slate-100 flex items-center gap-2">
                <i class="fa-solid fa-file-pen text-blue-500 text-xl"></i>
                <h4 class="font-black text-slate-700">Rich Text Area</h4>
            </div>
            
            <!-- Formatting Toolbar -->
            <div class="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap gap-2 items-center">
                <button type="button" onclick="formatText('bold')" class="w-8 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 font-bold text-slate-700 shadow-sm" title="Bold">B</button>
                <button type="button" onclick="formatText('italic')" class="w-8 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 italic text-slate-700 shadow-sm" title="Italic">I</button>
                <button type="button" onclick="formatText('underline')" class="w-8 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 underline text-slate-700 shadow-sm" title="Underline">U</button>
                
                <div class="w-px h-6 bg-slate-300 mx-1"></div>
                
                <button type="button" onclick="formatText('formatBlock', 'H3')" class="px-3 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 font-bold text-slate-700 shadow-sm" title="Large Heading">H1</button>
                <button type="button" onclick="formatText('formatBlock', 'H4')" class="px-3 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 font-bold text-slate-700 shadow-sm" title="Small Heading">H2</button>
                <button type="button" onclick="formatText('removeFormat')" class="px-3 h-8 rounded bg-white border border-slate-300 hover:bg-slate-200 text-slate-500 shadow-sm" title="Clear Formatting"><i class="fa-solid fa-eraser"></i></button>

                <div class="w-px h-6 bg-slate-300 mx-1"></div>

                <button type="button" onclick="triggerImageUpload('${uid}')" class="px-4 h-8 rounded bg-blue-100 border border-blue-300 text-blue-700 hover:bg-blue-200 font-bold shadow-sm flex items-center gap-2" title="Insert Image">
                    <i class="fa-solid fa-image"></i> Add Image
                </button>
                <input type="file" id="file_${uid}" accept="image/*" class="hidden" onchange="insertImage(this, '${uid}')">
            </div>

            <div id="${uid}" contenteditable="true" class="rich-editor-content min-h-[150px] max-h-[500px] overflow-y-auto p-6 outline-none text-slate-700 text-lg leading-relaxed focus:bg-blue-50/30 transition-colors" data-placeholder="Type your story, lesson, or instructions here..."></div>
        `;
    }

    if (type === 'interactive_fact') {
        return controls + `
            <input type="hidden" class="block-type" value="interactive_fact">
            <div class="p-6">
                <h4 class="font-black text-slate-700 mb-4"><i class="fa-solid fa-hand-pointer text-orange-500"></i> Clickable Reveal Card</h4>
                <div class="space-y-4">
                    <div>
                        <label class="text-xs font-bold text-slate-400 uppercase">Question (Visible first)</label>
                        <input type="text" class="fact-question w-full p-3 border-2 border-slate-200 rounded-lg focus:border-orange-500 outline-none font-bold" placeholder="e.g. Can you guess what makes the sky blue?">
                    </div>
                    <div class="flex gap-4">
                        <div class="w-1/4">
                            <label class="text-xs font-bold text-slate-400 uppercase">Icon</label>
                            <input type="text" class="fact-icon w-full p-3 border-2 border-slate-200 rounded-lg outline-none font-mono text-sm" value="fa-star" placeholder="fa-star">
                        </div>
                        <div class="w-3/4">
                            <label class="text-xs font-bold text-slate-400 uppercase">Revealed Answer</label>
                            <input type="text" class="fact-reveal w-full p-3 border-2 border-slate-200 rounded-lg focus:border-orange-500 outline-none font-bold text-orange-600" placeholder="e.g. It is because of scattered sunlight!">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (type === 'quiz') {
        const uid = Date.now() + Math.floor(Math.random() * 1000);
        return controls + `
            <input type="hidden" class="block-type" value="quiz">
            <div class="p-6">
                <h4 class="font-black text-slate-700 mb-4"><i class="fa-solid fa-circle-question text-emerald-500"></i> Brain Check Question</h4>
                <input type="text" class="quiz-question w-full p-4 border-2 border-slate-200 rounded-xl mb-4 focus:border-emerald-500 outline-none font-black text-lg" placeholder="Type the question here...">
                
                <div class="space-y-3 quiz-options-container">
                    <div class="flex items-center gap-3">
                        <input type="radio" name="correct_${uid}" checked class="quiz-correct w-6 h-6 accent-emerald-500 cursor-pointer" title="Mark as Correct Answer">
                        <input type="text" class="quiz-option w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-bold" placeholder="Option 1 (Correct)">
                    </div>
                    <div class="flex items-center gap-3">
                        <input type="radio" name="correct_${uid}" class="quiz-correct w-6 h-6 accent-emerald-500 cursor-pointer" title="Mark as Correct Answer">
                        <input type="text" class="quiz-option w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-bold" placeholder="Option 2">
                    </div>
                </div>
                <button type="button" onclick="addOption(this)" class="mt-4 text-sm font-bold text-emerald-600 bg-emerald-100 hover:bg-emerald-200 px-4 py-2 rounded-lg transition-colors">+ Add Option</button>
            </div>
        `;
    }
}

// ============================================================================
// --- RICH TEXT EDITOR LOGIC & IMAGE COMPRESSION ---
// ============================================================================
function formatText(command, value = null) {
    document.execCommand(command, false, value);
}

function triggerImageUpload(editorId) {
    document.getElementById('file_' + editorId).click();
}

async function insertImage(input, editorId) {
    if (!input.files || !input.files[0]) return;

    const original = input.files[0];
    const editor = document.getElementById(editorId);

    try {
        const yearId = await getActiveYearId();
        const compressed = await compressSikLabImage(original, 1200, 0.82);
        const uploaded = await uploadSikLabImage(
            'lesson-images',
            compressed,
            yearId ? `school-year-${yearId}` : 'unassigned'
        );
        newlyUploadedLessonImages.add(uploaded.publicUrl);

        editor.focus();
        document.execCommand('insertImage', false, uploaded.publicUrl);

        setTimeout(() => {
            const imgs = editor.getElementsByTagName('img');
            for (let i = 0; i < imgs.length; i++) {
                if (!imgs[i].hasAttribute('data-processed')) {
                    imgs[i].setAttribute('data-processed', 'true');
                    imgs[i].style.width = '60%';
                    imgs[i].style.minWidth = '200px';
                    imgs[i].style.display = 'block';
                    imgs[i].style.margin = '1rem auto';
                    imgs[i].style.borderRadius = '1rem';
                    imgs[i].style.boxShadow = '0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -2px rgba(0,0,0,.05)';
                    imgs[i].style.transition = 'outline 0.2s ease';
                }
            }
        }, 50);
    } catch (error) {
        console.error('[lesson image upload]', error);
        alert(error.message || 'Could not upload image.');
    } finally {
        input.value = '';
    }
}

// ============================================================================
// --- LESSON DRAFT / STORAGE CLEANUP HELPERS ---
// ============================================================================
function getImageUrlsFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    return [...template.content.querySelectorAll('img[src]')]
        .map(img => img.getAttribute('src'))
        .filter(Boolean);
}

function getImageUrlsFromElement(root) {
    if (!root) return [];
    return [...root.querySelectorAll('img[src]')]
        .map(img => img.getAttribute('src'))
        .filter(Boolean);
}

function getLessonImageUrls(lesson) {
    const urls = new Set();
    for (const block of lesson?.blocks || []) {
        if (block?.type === 'rich_text' || block?.type === 'text') {
            for (const url of getImageUrlsFromHtml(block.content || '')) urls.add(url);
        }
    }
    return [...urls];
}

async function scheduleOrDeleteImageUrl(url) {
    if (!url) return;
    if (newlyUploadedLessonImages.has(url)) {
        newlyUploadedLessonImages.delete(url);
        await deleteSikLabStorageUrl('lesson-images', url);
        return;
    }
    // Existing saved assets may be shared by copied school-year content.
    // Remove the reference from this lesson, but retain the Storage object.
}

async function removeLessonBlock(button) {
    const block = button?.closest('.group');
    if (!block) return;
    const urls = getImageUrlsFromElement(block);
    block.remove();
    for (const url of urls) await scheduleOrDeleteImageUrl(url);
}

async function cleanupNewDraftUploads() {
    const urls = [...newlyUploadedLessonImages];
    newlyUploadedLessonImages.clear();
    for (const url of urls) {
        await deleteSikLabStorageUrl('lesson-images', url);
    }
}

async function applyPendingImageDeletes(currentBlocks) {
    const stillUsed = new Set();
    for (const block of currentBlocks || []) {
        if (block?.type === 'rich_text') {
            for (const url of getImageUrlsFromHtml(block.content || '')) stillUsed.add(url);
        }
    }

    // Persisted lesson assets may be shared by another copied school year.
    // We only clean newly uploaded, unsaved draft files automatically.
    pendingLessonImageDeletes.clear();
}

// Prevent clipboard images/base64 blobs from being embedded directly into lesson_json.
document.addEventListener('paste', (event) => {
    const editor = event.target?.closest?.('.rich-editor-content');
    if (!editor || !event.clipboardData) return;

    const hasImageFile = [...event.clipboardData.items].some(item => item.type?.startsWith('image/'));
    const html = event.clipboardData.getData('text/html') || '';
    const hasDataImage = /<img[^>]+src=["']data:image\//i.test(html);

    if (hasImageFile || hasDataImage) {
        event.preventDefault();
        alert('Please use the Add Image button so the image is compressed and stored in Supabase Storage.');
    }
});

// ============================================================================
// --- SMART IMAGE SELECTION, ALIGNMENT & RESIZE LOGIC ---
// ============================================================================
let resizingImage = null;
let startCursorX = 0;
let startImageWidth = 0;

function hideImageToolbar() {
    if(imageToolbar) imageToolbar.classList.add('hidden');
    if(activeImage) {
        activeImage.style.outline = 'none';
        activeImage.style.outlineOffset = '0px';
    }
    activeImage = null;
}

function alignActiveImage(alignment) {
    if (!activeImage) return;
    if (alignment === 'left') {
        activeImage.style.display = 'inline';
        activeImage.style.float = 'left';
        activeImage.style.margin = '0 1.5rem 1rem 0';
    } else if (alignment === 'center') {
        activeImage.style.display = 'block';
        activeImage.style.float = 'none';
        activeImage.style.margin = '1.5rem auto';
    } else if (alignment === 'right') {
        activeImage.style.display = 'inline';
        activeImage.style.float = 'right';
        activeImage.style.margin = '0 0 1rem 1.5rem';
    }
    hideImageToolbar();
}

async function deleteActiveImage() {
    if (!activeImage) return;

    const image = activeImage;
    const src = image.getAttribute('src') || '';
    image.remove();
    hideImageToolbar();

    if (!src) return;

    if (newlyUploadedLessonImages.has(src)) {
        newlyUploadedLessonImages.delete(src);
        await deleteSikLabStorageUrl('lesson-images', src);
    }
    // Existing saved images are intentionally kept in Storage because copied
    // lessons in another school year can share this same public URL.
}

// Global Click Listener for Images
document.addEventListener('click', function(e) {
    if (e.target.tagName === 'IMG' && e.target.closest('.rich-editor-content')) {
        // Un-select previous
        if (activeImage && activeImage !== e.target) {
            activeImage.style.outline = 'none';
        }
        
        activeImage = e.target;
        activeImage.style.outline = '4px solid #3b82f6'; // Blue selection ring
        activeImage.style.outlineOffset = '4px';
        
        // Position toolbar accurately above the image
        const rect = activeImage.getBoundingClientRect();
        imageToolbar.style.top = (rect.top + window.scrollY - 65) + 'px';
        imageToolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - 100) + 'px'; // Center it horizontally
        imageToolbar.classList.remove('hidden');
    } 
    else if (!e.target.closest('#image-toolbar')) {
        hideImageToolbar();
    }
});

// Cursor changes based on where you hover on the image
document.addEventListener('mousemove', function(e) {
    if (resizingImage) {
        const deltaX = e.clientX - startCursorX;
        // Multiply by 2 so it scales symmetrically if centered
        const newWidth = startImageWidth + (deltaX * 2); 
        if (newWidth > 150) { 
            resizingImage.style.width = newWidth + 'px'; 
            
            // Keep toolbar attached while dragging
            if(imageToolbar && !imageToolbar.classList.contains('hidden')) {
                const rect = resizingImage.getBoundingClientRect();
                imageToolbar.style.top = (rect.top + window.scrollY - 65) + 'px';
                imageToolbar.style.left = (rect.left + window.scrollX + (rect.width / 2) - 100) + 'px';
            }
        }
        return; 
    }

    if (e.target.tagName === 'IMG' && e.target.closest('.rich-editor-content')) {
        const rect = e.target.getBoundingClientRect();
        const hoverX = e.clientX - rect.left;
        
        // Edges = Resize, Center = Grab/Move natively
        if (hoverX <= 30 || hoverX >= rect.width - 30) {
            e.target.style.cursor = 'ew-resize';
        } else {
            e.target.style.cursor = 'grab';
        }
    }
});

document.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'IMG' && e.target.closest('.rich-editor-content')) {
        const rect = e.target.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        // If clicking the edge, intercept and trigger our manual resize
        if (clickX <= 30 || clickX >= rect.width - 30) {
            resizingImage = e.target; 
            startCursorX = e.clientX; 
            startImageWidth = resizingImage.clientWidth;
            e.preventDefault(); 
        }
        // If clicking the center, we do NOT preventDefault, allowing native HTML5 text dragging!
    }
});

document.addEventListener('mouseup', function() { resizingImage = null; });


// ============================================================================
// --- QUIZ LOGIC ---
// ============================================================================
function addOption(btn) {
    const container = btn.previousElementSibling;
    if (container.children.length >= 4) { alert("Maximum 4 options allowed per question."); return; }
    
    const radioName = container.children[0].querySelector('input[type="radio"]').name;
    const newOption = document.createElement('div');
    newOption.className = "flex items-center gap-3 mt-3";
    newOption.innerHTML = `
        <input type="radio" name="${radioName}" class="quiz-correct w-6 h-6 accent-emerald-500 cursor-pointer" title="Mark as Correct Answer">
        <input type="text" class="quiz-option w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-bold" placeholder="Option ${container.children.length + 1}">
        <button type="button" class="w-10 h-10 bg-red-100 hover:bg-red-500 text-red-500 hover:text-white rounded-lg flex items-center justify-center transition-colors" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
    `;
    container.appendChild(newOption);
}

// ============================================================================
// --- PUBLISH TO DATABASE (COMPILER) ---
// ============================================================================
async function saveLesson() {
    hideImageToolbar();

    let orderId = document.getElementById('lms-order').value;
    const customLabel = document.getElementById('lms-label').value.trim();
    const title = document.getElementById('lms-title').value.trim();
    const completionType = document.getElementById('lms-completion').value || 'quiz';
    const isPublished = (document.getElementById('lms-visibility')?.value || 'published') === 'published';

    if (!customLabel || !title) {
        return alert('Please fill out the Custom Label and Title in the top bar.');
    }

    const activeYearId = await getActiveYearId();
    if (!activeYearId) return alert('No active school year is selected.');

    // An existing lesson must stay attached to the school year it was loaded from.
    if (loadedLessonContext && Number(loadedLessonContext.schoolYearId) !== Number(activeYearId)) {
        return alert('The dashboard school year changed while this lesson was open. Please reload the lesson from the Lesson Library before publishing.');
    }

    const yearId = loadedLessonContext
        ? Number(loadedLessonContext.schoolYearId)
        : Number(activeYearId);

    const blocks = [];
    let validationError = '';
    let quizCount = 0;

    for (const el of document.querySelectorAll('#lesson-canvas > .group')) {
        const type = el.querySelector('.block-type')?.value;
        if (!type) continue;

        if (type === 'rich_text') {
            const htmlContent = sanitizeRichHtml(el.querySelector('.rich-editor-content')?.innerHTML || '');
            if (htmlContent.trim()) blocks.push({ type: 'rich_text', content: htmlContent });
            continue;
        }

        if (type === 'interactive_fact') {
            const question = el.querySelector('.fact-question')?.value.trim() || '';
            const revealText = el.querySelector('.fact-reveal')?.value.trim() || '';
            const revealIcon = el.querySelector('.fact-icon')?.value.trim() || 'fa-star';

            if (!question || !revealText) {
                validationError = 'Every Interactive Fact needs both a visible question and a revealed answer.';
                break;
            }

            blocks.push({
                type: 'interactive_fact',
                question,
                reveal_icon: revealIcon,
                reveal_text: revealText
            });
            continue;
        }

        if (type === 'quiz') {
            const question = el.querySelector('.quiz-question')?.value.trim() || '';
            const rows = [...el.querySelectorAll('.quiz-options-container > div')];
            const validRows = rows.filter(row => row.querySelector('.quiz-option')?.value.trim());

            if (!question) {
                validationError = 'Every Brain Check needs a question.';
                break;
            }
            if (validRows.length < 2 || validRows.length > 4) {
                validationError = 'Every Brain Check must contain 2 to 4 non-empty options.';
                break;
            }

            const selectedRows = rows.filter(row => row.querySelector('.quiz-correct')?.checked);
            if (selectedRows.length !== 1) {
                validationError = 'Every Brain Check must have exactly one correct answer.';
                break;
            }

            const selectedInput = selectedRows[0].querySelector('.quiz-option');
            if (!selectedInput?.value.trim()) {
                validationError = 'The selected correct answer cannot be empty.';
                break;
            }

            const options = validRows.map(row => row.querySelector('.quiz-option').value.trim());
            const correctIndex = validRows.indexOf(selectedRows[0]);
            if (correctIndex < 0) {
                validationError = 'The selected correct answer must be one of the non-empty options.';
                break;
            }

            blocks.push({ type: 'quiz', question, options, correctIndex });
            quizCount += 1;
        }
    }

    if (validationError) return alert(validationError);
    if (!blocks.length) return alert('Please add at least one valid block to the canvas!');
    if (completionType === 'quiz' && quizCount === 0) {
        return alert('This lesson requires a quiz for completion. Add at least one Brain Check or change the completion condition to View Only.');
    }

    try {
        const db = requireSupabase();

        if (!orderId) {
            const { data, error } = await db.from('lesson_modules')
                .select('module_id,week_id,lesson_json,is_published')
                .eq('school_year_id', yearId)
                .order('week_id', { ascending: true });
            if (error) throw error;

            serverLessons = (data || []).map(row => ({
                ...(row.lesson_json || {}),
                module_id: row.module_id,
                week_id: row.week_id,
                is_published: row.is_published !== false
            }));
            serverLessonsYearId = yearId;

            orderId = serverLessons.length
                ? Math.max(...serverLessons.map(l => Number(l.week_id) || 0)) + 1
                : 1;
            document.getElementById('lms-order').value = orderId;
        }

        const lessonData = {
            week_id: Number(orderId),
            year_id: yearId,
            label: customLabel,
            title,
            subtitle: 'Interactive Science Module',
            color: document.getElementById('lms-color').value,
            completion_type: completionType,
            is_published: isPublished,
            blocks
        };

        const { data: savedRows, error } = await db.from('lesson_modules').upsert({
            week_id: Number(orderId),
            school_year_id: yearId,
            label: customLabel,
            title,
            subtitle: lessonData.subtitle,
            icon: 'fa-book-open',
            color: lessonData.color,
            completion_type: completionType,
            lesson_json: lessonData,
            is_published: isPublished,
            updated_at: new Date().toISOString()
        }, { onConflict: 'school_year_id,week_id' })
            .select('module_id,week_id,is_published');

        if (error) throw error;

        await applyPendingImageDeletes(blocks);
        newlyUploadedLessonImages.clear();

        const saved = savedRows?.[0];
        loadedLessonContext = {
            moduleId: saved?.module_id || loadedLessonContext?.moduleId || null,
            weekId: Number(orderId),
            schoolYearId: yearId
        };

        const { data: refreshed, error: refreshError } = await db.from('lesson_modules')
            .select('module_id,week_id,lesson_json,is_published')
            .eq('school_year_id', yearId)
            .order('week_id', { ascending: true });
        if (refreshError) throw refreshError;

        serverLessons = (refreshed || []).map(row => ({
            ...(row.lesson_json || {}),
            module_id: row.module_id,
            week_id: row.week_id,
            is_published: row.is_published !== false
        }));
        serverLessonsYearId = yearId;

        if (!document.getElementById('manage-lessons-modal').classList.contains('hidden')) {
            renderLessonList();
        }

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'siklab_lesson_saved', schoolYearId: yearId }, window.location.origin);
            }
        } catch (_) {}
        alert(isPublished ? 'Lesson published successfully!' : 'Lesson saved as draft.');
    } catch (error) {
        console.error('[lesson save]', error);
        alert('Error saving lesson to Supabase: ' + (error.message || 'Unknown error'));
    }
}

// ============================================================================
// --- MANAGE, LOAD, AND DELETE LOGIC (FULL CRUD) ---
// ============================================================================
let serverLessons = [];
let serverLessonsYearId = null;
let lessonSortableInstance = null;

function resetBuilderFields() {
    hideImageToolbar();
    document.getElementById('lms-order').value = '';
    document.getElementById('lms-label').value = '';
    document.getElementById('lms-title').value = '';
    document.getElementById('lms-color').value = 'emerald';
    document.getElementById('lms-completion').value = 'quiz';
    const visibility = document.getElementById('lms-visibility');
    if (visibility) visibility.value = 'published';
    document.getElementById('lesson-canvas').innerHTML = '';
    loadedLessonContext = null;
    pendingLessonImageDeletes.clear();
}

async function clearBuilder() {
    if (!confirm('Clear the canvas? Any unsaved changes will be lost.')) return;
    await cleanupNewDraftUploads();
    resetBuilderFields();
}

async function openManageModal() {
    const modal = document.getElementById('manage-lessons-modal');
    const box = document.getElementById('manage-modal-box');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);

    const yearId = await getActiveYearId();

    try {
        if (!yearId) throw new Error('No active school year selected.');

        const db = requireSupabase();
        const { data, error } = await db.from('lesson_modules')
            .select('module_id,week_id,lesson_json,is_published')
            .eq('school_year_id', yearId)
            .order('week_id', { ascending: true });

        if (error) throw error;

        serverLessons = (data || []).map(row => ({
            ...(row.lesson_json || {}),
            module_id: row.module_id,
            week_id: row.week_id,
            is_published: row.is_published !== false
        }));
        serverLessonsYearId = Number(yearId);
        renderLessonList();
    } catch (error) {
        console.error('[lesson list]', error);
        document.getElementById('lessons-list-container').innerHTML =
            `<p class="text-red-500 font-bold text-center">${escapeHtml(error.message || 'Failed to load lessons.')}</p>`;
    }
}

function closeManageModal() {
    const modal = document.getElementById('manage-lessons-modal');
    const box = document.getElementById('manage-modal-box');
    modal.classList.add('opacity-0'); box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

function renderLessonList() {
    const container = document.getElementById('lessons-list-container');
    
    if (serverLessons.length === 0) {
        container.innerHTML = `
            <div class="text-center py-16 text-slate-400">
                <i class="fa-solid fa-folder-open text-6xl mb-4 opacity-50"></i>
                <h3 class="text-xl font-black">Your library is empty</h3>
                <p class="font-bold">Build and publish your first lesson to see it here!</p>
            </div>`;
        return;
    }

    container.innerHTML = serverLessons.map(lesson => `
        <div class="lesson-row flex flex-col sm:flex-row justify-between items-center bg-slate-50 border-2 border-slate-200 p-5 rounded-2xl mb-4 hover:border-blue-300 transition-colors" data-id="${lesson.week_id}">
            <div class="flex items-center gap-5 w-full sm:w-auto mb-4 sm:mb-0">
                <i class="fa-solid fa-bars drag-lesson-handle cursor-grab text-slate-300 text-2xl hover:text-blue-500 transition-colors px-2" title="Drag to reorder"></i>
                <div class="w-14 h-14 rounded-full bg-${safeThemeColor(lesson.color || 'blue')}-100 text-${safeThemeColor(lesson.color || 'blue')}-500 flex items-center justify-center text-2xl border-2 border-${safeThemeColor(lesson.color || 'blue')}-200 font-black flex-shrink-0">
                    ${lesson.week_id}
                </div>
                <div>
                    <h4 class="font-black text-slate-800 text-xl">${escapeHtml(lesson.title)}</h4>
                    <p class="text-sm font-bold text-slate-400 uppercase tracking-widest">${escapeHtml(lesson.label || 'Sequence ' + lesson.week_id)} • ${lesson.blocks ? lesson.blocks.length : 0} Blocks • ${lesson.completion_type === 'view' ? 'VIEW ONLY' : 'QUIZ REQUIRED'}</p>
                    <span class="inline-flex mt-2 px-2.5 py-1 rounded-full text-[10px] font-black ${lesson.is_published === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}">${lesson.is_published === false ? 'DRAFT • HIDDEN FROM STUDENTS' : 'PUBLISHED • VISIBLE TO STUDENTS'}</span>
                </div>
            </div>
            <div class="flex gap-3 w-full sm:w-auto">
                <button onclick="loadLessonIntoBuilder(${lesson.week_id})" class="flex-1 sm:flex-none bg-blue-100 hover:bg-blue-500 text-blue-600 hover:text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-sm">
                    <i class="fa-solid fa-pen-to-square mr-2"></i> EDIT
                </button>
                <button onclick="deleteLesson(${lesson.week_id})" class="flex-1 sm:flex-none bg-red-100 hover:bg-red-500 text-red-500 hover:text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-sm">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');

    if (lessonSortableInstance) lessonSortableInstance.destroy();
    lessonSortableInstance = new Sortable(container, {
        animation: 150,
        handle: '.drag-lesson-handle',
        onEnd: function() {
            document.getElementById('save-order-btn').classList.remove('hidden');
        }
    });
}

// ============================================================================
// --- LESSON SEQUENCE REORDERING ENGINE ---
// ============================================================================
async function saveLessonOrder() {
    const rows = document.querySelectorAll('#lessons-list-container .lesson-row');
    const btn = document.getElementById('save-order-btn');
    const yearId = serverLessonsYearId || await getActiveYearId();

    const orderedModuleIds = Array.from(rows).map(row => {
        const oldWeekId = Number(row.getAttribute('data-id'));
        const lesson = serverLessons.find(l => Number(l.week_id) === oldWeekId);
        return Number(lesson?.module_id);
    }).filter(Number.isFinite);

    if (!yearId || !orderedModuleIds.length) return;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Saving...';
    btn.disabled = true;

    try {
        const db = requireSupabase();
        const { error } = await db.rpc('reorder_lessons', {
            p_school_year_id: yearId,
            p_module_ids: orderedModuleIds
        });
        if (error) throw error;

        const { data, error: loadError } = await db.from('lesson_modules')
            .select('module_id,week_id,lesson_json,is_published')
            .eq('school_year_id', yearId)
            .order('week_id', { ascending: true });

        if (loadError) throw loadError;

        serverLessons = (data || []).map(row => ({
            ...(row.lesson_json || {}),
            module_id: row.module_id,
            week_id: row.week_id,
            is_published: row.is_published !== false
        }));

        renderLessonList();
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Save Order';
        btn.classList.add('hidden');
        btn.disabled = false;
        alert('Lesson sequence successfully updated!');
    } catch (error) {
        console.error('[lesson reorder]', error);
        alert('Error saving sequence: ' + (error.message || 'Unknown error'));
        btn.innerHTML = '<i class="fa-solid fa-save mr-2"></i> Save Order';
        btn.disabled = false;
    }
}

async function deleteLesson(weekId) {
    if (!confirm(`Are you sure you want to permanently delete Sequence ${weekId}?`)) return;

    const yearId = serverLessonsYearId || await getActiveYearId();
    if (!yearId) return alert('No school year is selected.');

    try {
        const db = requireSupabase();
        const lesson = serverLessons.find(l => Number(l.week_id) === Number(weekId));
        let result;

        if (lesson?.module_id) {
            result = await db.from('lesson_modules').delete().eq('module_id', Number(lesson.module_id));
        } else {
            result = await db.from('lesson_modules').delete()
                .eq('week_id', Number(weekId))
                .eq('school_year_id', Number(yearId));
        }
        if (result.error) throw result.error;

        // Do not delete persisted Storage images here. A copied lesson in another
        // school year may still reference the same asset URL.

        serverLessons = serverLessons.filter(l => Number(l.week_id) !== Number(weekId));
        renderLessonList();

        if (Number(document.getElementById('lms-order').value) === Number(weekId)
            && Number(loadedLessonContext?.schoolYearId) === Number(yearId)) {
            await cleanupNewDraftUploads();
            resetBuilderFields();
        }
    } catch (error) {
        console.error('[lesson delete]', error);
        alert('Failed to delete lesson: ' + (error.message || 'Unknown error'));
    }
}

async function loadLessonIntoBuilder(weekId) {
    const lesson = serverLessons.find(l => Number(l.week_id) === Number(weekId));
    if (!lesson) return;

    await cleanupNewDraftUploads();
    pendingLessonImageDeletes.clear();
    loadedLessonContext = {
        moduleId: lesson.module_id || null,
        weekId: Number(lesson.week_id),
        schoolYearId: Number(serverLessonsYearId || await getActiveYearId())
    };

    document.getElementById('lms-order').value = lesson.week_id;
    document.getElementById('lms-label').value = lesson.label || '';
    document.getElementById('lms-title').value = lesson.title || '';
    document.getElementById('lms-color').value = lesson.color || 'blue';
    document.getElementById('lms-completion').value = lesson.completion_type || 'quiz';
    const visibility = document.getElementById('lms-visibility');
    if (visibility) visibility.value = lesson.is_published === false ? 'draft' : 'published';

    const canvas = document.getElementById('lesson-canvas');
    canvas.innerHTML = '';

    if (lesson.blocks) {
        lesson.blocks.forEach(block => {
            const el = document.createElement('div');
            el.className = "bg-white p-1 rounded-2xl shadow-sm border border-slate-200 relative group";
            el.innerHTML = generateFormHTML(block.type);

            if (block.type === 'rich_text' || block.type === 'text') {
                el.querySelector('.rich-editor-content').innerHTML = sanitizeRichHtml(block.content || '');
            } 
            else if (block.type === 'interactive_fact') {
                el.querySelector('.fact-question').value = block.question || '';
                el.querySelector('.fact-icon').value = block.reveal_icon || 'fa-star';
                el.querySelector('.fact-reveal').value = block.reveal_text || '';
            } 
            else if (block.type === 'quiz') {
                el.querySelector('.quiz-question').value = block.question || '';
                const optContainer = el.querySelector('.quiz-options-container');
                optContainer.innerHTML = ''; 
                
                const uid = Date.now() + Math.floor(Math.random() * 1000);
                block.options.forEach((optText, idx) => {
                    const isChecked = idx === block.correctIndex ? 'checked' : '';
                    const newOpt = document.createElement('div');
                    newOpt.className = "flex items-center gap-3 mt-3";
                    newOpt.innerHTML = `
                        <input type="radio" name="correct_${uid}" ${isChecked} class="quiz-correct w-6 h-6 accent-emerald-500 cursor-pointer" title="Mark as Correct Answer">
                        <input type="text" class="quiz-option w-full p-3 border-2 border-slate-200 rounded-lg outline-none focus:border-emerald-500 font-bold" value="${escapeAttr(optText)}">
                        <button type="button" class="w-10 h-10 bg-red-100 hover:bg-red-500 text-red-500 hover:text-white rounded-lg flex items-center justify-center transition-colors" onclick="this.parentElement.remove()"><i class="fa-solid fa-times"></i></button>
                    `;
                    optContainer.appendChild(newOpt);
                });
            }
            canvas.appendChild(el);
        });
    }

    closeManageModal();
    document.getElementById('canvas-scroll-area').scrollTo({top: 0, behavior: 'smooth'});
}

// ============================================================================
// --- STUDENT PORTAL PREVIEW ---
// ============================================================================
function previewStudentPortal() {
    const yearId = loadedLessonContext?.schoolYearId || (window.parent?.currentSchoolYearId ?? window.currentSchoolYearId);
    if (window.parent && window.parent !== window && typeof window.parent.switchTab === 'function') {
        window.parent.switchTab('student-preview');
        if (typeof window.parent.refreshStudentPreview === 'function') window.parent.refreshStudentPreview();
        return;
    }
    window.open(`student.html?preview=1&year=${encodeURIComponent(yearId || '')}`, '_blank', 'noopener');
}

window.addEventListener('message', event => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'school_year_changed') {
        cleanupNewDraftUploads().finally(() => {
            resetBuilderFields();
            serverLessons = [];
            serverLessonsYearId = Number(event.data.yearId || 0) || null;
        });
    }
});
