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
                <button type="button" onclick="openLessonImageSearch('${uid}')" class="px-4 h-8 rounded bg-emerald-100 border border-emerald-300 text-emerald-700 hover:bg-emerald-200 font-bold shadow-sm" title="Find licensed images"><i class="fa-solid fa-magnifying-glass"></i> Find Picture</button>
                <input type="file" id="file_${uid}" accept="image/*" class="hidden" onchange="insertImage(this, '${uid}')">
            </div>

            <div id="${uid}" contenteditable="true" class="rich-editor-content min-h-[150px] max-h-[500px] overflow-y-auto p-6 outline-none text-slate-700 text-lg leading-relaxed focus:bg-blue-50/30 transition-colors" data-placeholder="Type your story, lesson, or instructions here..."></div>
        `;
    }

    if (type === 'pdf_resource') {
        return controls + `
            <input type="hidden" class="block-type" value="pdf_resource">
            <div class="p-6">
                <h4 class="font-black text-slate-700 mb-2"><i class="fa-solid fa-file-pdf text-rose-500"></i> PDF Reading Resource</h4>
                <label class="ai-pdf-label">Display title (e.g. Plant Parts Reference)</label>
                <input class="pdf-title ai-text" maxlength="140" placeholder="Reading material for this topic" type="text">
                <label class="ai-pdf-label">Select PDF (max 12 MB; only files you have permission to share)</label>
                <input type="file" class="pdf-file ai-file" accept="application/pdf,.pdf" onchange="uploadLessonPdf(this)">
                <input type="hidden" class="pdf-url">
                <div class="pdf-upload-status text-xs font-bold text-slate-500 mt-2">Choose a PDF. Students will see it inside this lesson.</div>
                <a class="pdf-preview-link hidden text-blue-700 font-bold underline mt-2 inline-block" target="_blank" rel="noopener noreferrer">Open uploaded PDF</a>
            </div>`;
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
                <label class="ai-pdf-label">Explanation shown after a correct answer (optional)</label>
                <textarea class="quiz-explanation ai-text" maxlength="350" rows="2" placeholder="Explain why the answer is correct in child-friendly language…"></textarea>
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
            if (htmlContent.trim()) blocks.push({ type: 'rich_text', content: htmlContent, image_query: String(el.querySelector('.rich-editor-content')?.dataset.imageQuery || '').slice(0,100) });
            continue;
        }

        if (type === 'pdf_resource') {
            const pdfUrl = el.querySelector('.pdf-url')?.value.trim() || '';
            const pdfTitle = el.querySelector('.pdf-title')?.value.trim() || 'Reading Resource';
            if (!isSikLabLessonPdfUrl(pdfUrl)) {
                validationError = 'Upload a PDF for every PDF Reading Resource block before saving.';
                break;
            }
            blocks.push({ type: 'pdf_resource', title: pdfTitle, url: pdfUrl });
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

            blocks.push({ type: 'quiz', question, options, correctIndex, explanation: el.querySelector('.quiz-explanation')?.value.trim().slice(0,350) || '' });
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
                el.querySelector('.rich-editor-content').dataset.imageQuery = String(block.image_query || '').slice(0,100);
            } 
            else if (block.type === 'pdf_resource') {
                el.querySelector('.pdf-title').value = block.title || 'Reading Resource';
                const pdfUrl = isSikLabLessonPdfUrl(block.url) ? block.url : '';
                el.querySelector('.pdf-url').value = pdfUrl;
                if (pdfUrl) {
                    const link = el.querySelector('.pdf-preview-link');
                    link.href = pdfUrl;
                    link.classList.remove('hidden');
                    el.querySelector('.pdf-upload-status').textContent = 'PDF attached. Upload another file to replace it.';
                }
            }
            else if (block.type === 'interactive_fact') {
                el.querySelector('.fact-question').value = block.question || '';
                el.querySelector('.fact-icon').value = block.reveal_icon || 'fa-star';
                el.querySelector('.fact-reveal').value = block.reveal_text || '';
            } 
            else if (block.type === 'quiz') {
                el.querySelector('.quiz-question').value = block.question || '';
                el.querySelector('.quiz-explanation').value = block.explanation || '';
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

// ============================================================================
// AI-assisted lesson drafts, PDF reading blocks, and licensed image search.
// The AI writes a preview only. Teachers must inspect and press SAVE manually.
// ============================================================================
let siklabAiDraft = null;
let siklabAiSourcePdf = null;
let siklabImageTargetEditorId = null;
let siklabImageSearchResults = [];

function isSikLabLessonPdfUrl(value) {
    try {
        const url = new URL(String(value || ''));
        const cloud = new URL(SIKLAB_SUPABASE_URL);
        return url.protocol === 'https:' && url.host === cloud.host &&
            url.pathname.startsWith('/storage/v1/object/public/lesson-pdfs/');
    } catch (_) { return false; }
}

function lessonAiStatus(message, isError = false) {
    const el = document.getElementById('ai-lesson-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#b91c1c' : '#475569';
}

function lessonImageStatus(message, isError = false) {
    const el = document.getElementById('lesson-image-status');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#b91c1c' : '#475569';
}

async function invokeLessonFunction(name, body) {
    const db = requireSupabase();
    const { data: sessionInfo, error: authError } = await db.auth.getSession();
    if (authError || !sessionInfo?.session?.access_token) throw new Error('Sign in to the teacher dashboard to use this feature.');
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) {
        let detail = error.message || 'Function request failed.';
        try {
            if (error.context && typeof error.context.json === 'function') {
                const body = await error.context.json();
                detail = body.error || detail;
            }
        } catch (_) {}
        throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read PDF.'));
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.readAsDataURL(file);
    });
}

async function generateAiLessonDraft() {
    const file = document.getElementById('ai-lesson-pdf')?.files?.[0];
    if (!file) return lessonAiStatus('Choose the lesson PDF first.', true);
    if (file.size > 5 * 1024 * 1024) return lessonAiStatus('PDF is larger than 5 MB. Use a smaller lesson extract.', true);
    if (!file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf')) {
        return lessonAiStatus('Please choose a PDF file.', true);
    }
    const btn = document.getElementById('ai-generate-btn');
    const review = document.getElementById('ai-lesson-review');
    btn.disabled = true;
    review.classList.add('hidden');
    siklabAiDraft = null;
    try {
        lessonAiStatus('Reading the PDF and preparing an editable Grade 3 draft…');
        const result = await invokeLessonFunction('ai-lesson-draft', {
            pdf_base64: await fileToBase64(file),
            filename: file.name.slice(0, 160),
            focus: document.getElementById('ai-lesson-focus')?.value.trim().slice(0, 140) || '',
            question_count: Number(document.getElementById('ai-lesson-questions')?.value || 5)
        });
        if (!Array.isArray(result?.draft?.sections) || !Array.isArray(result?.draft?.questions)) {
            throw new Error('AI returned an invalid draft. Please try again.');
        }
        siklabAiDraft = result.draft;
        siklabAiSourcePdf = file;
        const sectionCount = siklabAiDraft.sections.length;
        const questionCount = siklabAiDraft.questions.length;
        const sectionMarkup = siklabAiDraft.sections.map((section, i) => `<li><b>${i + 1}. ${escapeHtml(section.heading || 'Learning point')}</b>${section.page ? ` <span class="text-slate-500">(PDF p. ${escapeHtml(String(section.page))})</span>` : ''}<br><span class="text-slate-600">${escapeHtml(String(section.explanation || '').slice(0, 200))}</span>${section.image_query ? `<br><span class="text-blue-700">Picture idea: ${escapeHtml(section.image_query)}</span>` : ''}</li>`).join('');
        review.innerHTML = `<div class="flex items-center justify-between gap-3 flex-wrap"><h3 class="font-black text-emerald-900">Draft ready for teacher review</h3><span class="font-bold">${sectionCount} reading points · ${questionCount} questions</span></div>
            <p class="my-2 text-slate-700"><b>${escapeHtml(siklabAiDraft.title || 'Science lesson')}</b> — ${escapeHtml(siklabAiDraft.summary || '')}</p>
            <details class="my-3"><summary class="cursor-pointer font-bold text-emerald-800">Review the lesson outline and PDF page hints</summary><ol class="list-decimal ml-5 mt-2 space-y-2">${sectionMarkup}</ol></details>
            <p class="text-slate-600 mb-3">Review all wording, scientific accuracy, and answer keys. PDF page hints are AI-generated and may be inaccurate. Applying will replace any current unsaved canvas blocks, but will NOT publish the lesson.</p>
            <button type="button" class="ai-primary" onclick="applyAiLessonDraft()"><i class="fa-solid fa-file-pen mr-1"></i> Put editable draft on canvas</button>`;
        review.classList.remove('hidden');
        lessonAiStatus('Draft generated. Check the outline, then apply it to the canvas.');
    } catch (error) {
        console.error('[AI lesson draft]', error);
        lessonAiStatus(error.message || 'AI generation failed.', true);
    } finally { btn.disabled = false; }
}

function textAsLessonHtml(value) {
    return String(value || '').split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
}

function addLessonFormBlock(block) {
    const el = document.createElement('div');
    el.className = 'bg-white p-1 rounded-2xl shadow-sm border border-slate-200 relative group';
    el.innerHTML = generateFormHTML(block.type);
    if (block.type === 'rich_text') {
        const editor = el.querySelector('.rich-editor-content');
        editor.innerHTML = sanitizeRichHtml(block.content || '');
        if (block.image_query) editor.dataset.imageQuery = block.image_query;
    } else if (block.type === 'interactive_fact') {
        el.querySelector('.fact-question').value = block.question || '';
        el.querySelector('.fact-reveal').value = block.reveal_text || '';
    } else if (block.type === 'quiz') {
        el.querySelector('.quiz-question').value = block.question || '';
        el.querySelector('.quiz-explanation').value = block.explanation || '';
        const list = el.querySelector('.quiz-options-container');
        list.innerHTML = '';
        const name = 'correct_' + crypto.randomUUID().replace(/-/g, '');
        (block.options || []).slice(0, 4).forEach((option, index) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 mt-3';
            row.innerHTML = `<input type="radio" name="${name}" class="quiz-correct w-6 h-6 accent-emerald-500" ${index === block.correctIndex ? 'checked' : ''}>
                <input type="text" class="quiz-option w-full p-3 border-2 border-slate-200 rounded-lg font-bold">
                <button type="button" class="w-10 h-10 bg-red-100 text-red-500 rounded-lg" onclick="this.parentElement.remove()" aria-label="Remove option">✕</button>`;
            row.querySelector('.quiz-option').value = String(option || '');
            list.appendChild(row);
        });
    } else if (block.type === 'pdf_resource') {
        el.querySelector('.pdf-title').value = block.title || 'Reading resource';
        el.querySelector('.pdf-url').value = block.url || '';
        const a = el.querySelector('.pdf-preview-link');
        a.href = block.url || '#';
        a.classList.remove('hidden');
        el.querySelector('.pdf-upload-status').textContent = 'PDF ready for students after you save.';
    }
    document.getElementById('lesson-canvas').appendChild(el);
    return el;
}

async function uploadPdfFileForLesson(file, yearId) {
    if (!file || (file.type && file.type !== 'application/pdf') || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a valid PDF.');
    if (file.size > 12 * 1024 * 1024) throw new Error('PDF must be at most 12 MB.');
    if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') throw new Error('File is not a valid PDF.');
    const db = requireSupabase();
    const path = `school-year-${Number(yearId) || 'unassigned'}/${crypto.randomUUID()}.pdf`;
    const { error } = await db.storage.from('lesson-pdfs').upload(path, file, { upsert: false, contentType: 'application/pdf', cacheControl: '3600' });
    if (error) throw error;
    const { data } = db.storage.from('lesson-pdfs').getPublicUrl(path);
    if (!isSikLabLessonPdfUrl(data?.publicUrl)) throw new Error('Could not create a PDF link.');
    return data.publicUrl;
}

async function uploadLessonPdf(input) {
    const block = input.closest('.group');
    const status = block?.querySelector('.pdf-upload-status');
    const file = input.files?.[0];
    if (!file || !block) return;
    try {
        status.textContent = 'Uploading PDF…';
        const url = await uploadPdfFileForLesson(file, await getActiveYearId());
        block.querySelector('.pdf-url').value = url;
        const a = block.querySelector('.pdf-preview-link');
        a.href = url;
        a.classList.remove('hidden');
        if (!block.querySelector('.pdf-title').value.trim()) block.querySelector('.pdf-title').value = file.name.replace(/\.pdf$/i, '');
        status.textContent = 'PDF uploaded. Press SAVE to attach it to this lesson.';
    } catch (error) {
        status.textContent = error.message || 'PDF upload failed.';
        status.style.color = '#b91c1c';
    } finally { input.value = ''; }
}

async function applyAiLessonDraft() {
    if (!siklabAiDraft) return;
    const canvas = document.getElementById('lesson-canvas');
    if (loadedLessonContext && !confirm('This will replace the lesson currently open in the editor when you press SAVE. To create a NEW lesson instead, Cancel, click New/Clear, then apply the draft. Continue editing the existing lesson?')) return;
    if (canvas.children.length && !confirm('Replace all unsaved blocks on the canvas with the AI draft? Any unsaved changes will be lost.')) return;
    const oldPdf = siklabAiSourcePdf;
    let pdfBlock = null;
    const addPdf = !!document.getElementById('ai-attach-pdf')?.checked && !!oldPdf;
    try {
        lessonAiStatus('Preparing the draft on the editable canvas…');
        if (addPdf) {
            if (oldPdf.size > 12 * 1024 * 1024) throw new Error('PDF too large to attach.');
            pdfBlock = { type: 'pdf_resource', title: oldPdf.name.replace(/\.pdf$/i, '').slice(0,140), url: await uploadPdfFileForLesson(oldPdf, await getActiveYearId()) };
        }
        // Replace draft uploads and block content only AFTER PDF upload succeeds.
        await cleanupNewDraftUploads();
        pendingLessonImageDeletes.clear();
        canvas.innerHTML = '';
        document.getElementById('lms-title').value = siklabAiDraft.title || document.getElementById('lms-title').value || 'Science Lesson';
        if (!document.getElementById('lms-label').value.trim()) document.getElementById('lms-label').value = 'Science Lesson';
        document.getElementById('lms-completion').value = 'quiz';
        const visibility = document.getElementById('lms-visibility');
        if (visibility) visibility.value = 'draft';
        for (const sec of siklabAiDraft.sections) {
            const h = `<h3>${escapeHtml(sec.heading || 'Let us learn')}</h3>`;
            const body = textAsLessonHtml(sec.explanation || '');
            const example = sec.example ? `<p><strong>Example:</strong> ${escapeHtml(sec.example)}</p>` : '';
            addLessonFormBlock({ type: 'rich_text', content: h + body + example, image_query: sec.image_query || '' });
        }
        for (const fact of siklabAiDraft.facts || []) {
            if (fact.question && fact.answer) addLessonFormBlock({ type: 'interactive_fact', question: fact.question, reveal_text: fact.answer });
        }
        if (pdfBlock) addLessonFormBlock(pdfBlock);
        for (const question of siklabAiDraft.questions) {
            if (question.question && question.options?.length >= 2 && Number.isInteger(question.correctIndex)) {
                addLessonFormBlock({ type: 'quiz', ...question });
            }
        }
        document.getElementById('ai-lesson-review').classList.add('hidden');
        lessonAiStatus('Editable draft added! Find pictures in each reading block, check answers, then save as draft or publish.');
        document.getElementById('canvas-scroll-area')?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('[apply AI lesson draft]', error);
        lessonAiStatus(error.message || 'Could not apply lesson draft.', true);
    }
}

function openLessonImageSearch(editorId) {
    const editor = document.getElementById(editorId);
    if (!editor) return;
    siklabImageTargetEditorId = editorId;
    document.getElementById('lesson-image-modal').classList.remove('hidden');
    document.getElementById('lesson-image-results').innerHTML = '';
    document.getElementById('lesson-image-query').value = editor.dataset.imageQuery || document.getElementById('lms-title').value || '';
    lessonImageStatus('Search for a relevant, licensed image.');
    if (editor.dataset.imageQuery) searchLessonImages();
}

function closeLessonImageSearch() {
    document.getElementById('lesson-image-modal').classList.add('hidden');
}

async function searchLessonImages() {
    const query = document.getElementById('lesson-image-query').value.trim();
    if (query.length < 2) return lessonImageStatus('Enter at least two characters.', true);
    const btn = document.getElementById('lesson-image-find');
    btn.disabled = true;
    const results = document.getElementById('lesson-image-results');
    results.innerHTML = '';
    try {
        lessonImageStatus('Searching Wikimedia Commons…');
        const payload = await invokeLessonFunction('lesson-media', { action: 'search', query });
        siklabImageSearchResults = Array.isArray(payload.images) ? payload.images : [];
        if (!siklabImageSearchResults.length) return lessonImageStatus('No reusable images found. Try different keywords or use Add Image.');
        siklabImageSearchResults.forEach((photo, i) => {
            const card = document.createElement('div');
            card.className = 'ai-image-result';
            const thumb = document.createElement('img');
            thumb.src = photo.thumb;
            thumb.alt = photo.title || query;
            thumb.loading = 'lazy';
            const caption = document.createElement('p');
            caption.className = 'text-xs text-slate-700 font-bold mt-2';
            caption.textContent = (photo.title || query).slice(0, 85);
            const credit = document.createElement('p');
            credit.className = 'text-xs text-slate-500 mt-1';
            credit.textContent = `${photo.artist || 'Creator unknown'} · ${photo.license || 'Check license'}`.slice(0, 130);
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Use this picture';
            button.onclick = () => chooseLessonImage(i, button);
            card.append(thumb, caption, credit, button);
            results.appendChild(card);
        });
        lessonImageStatus(`Found ${siklabImageSearchResults.length} results. Teacher: verify image and attribution.`);
    } catch (error) {
        console.error('[lesson image search]', error);
        lessonImageStatus(error.message || 'Image search failed.', true);
    } finally { btn.disabled = false; }
}

async function chooseLessonImage(index, button) {
    const photo = siklabImageSearchResults[index];
    const editor = document.getElementById(siklabImageTargetEditorId);
    if (!photo || !editor) return;
    button.disabled = true;
    button.textContent = 'Adding…';
    try {
        const yearId = await getActiveYearId();
        const response = await invokeLessonFunction('lesson-media', {
            action: 'import', url: photo.url, year_id: yearId, title: photo.title,
            attribution: photo.artist || '', license: photo.license || '', source: photo.page || ''
        });
        const picture = document.createElement('img');
        picture.src = response.publicUrl;
        picture.alt = photo.title || 'Science picture';
        picture.style.cssText = 'width:65%;height:auto;display:block;margin:1rem auto;border-radius:1rem';
        const credit = document.createElement('p');
        credit.textContent = `Image: ${photo.artist || 'Wikimedia Commons contributor'} · ${photo.license || 'license information unavailable'} · Wikimedia Commons (${photo.page || 'source'})`;
        // No direct remote embedding: import to SikLab Storage before adding to lesson.
        editor.append(picture, credit);
        newlyUploadedLessonImages.add(response.publicUrl);
        closeLessonImageSearch();
        lessonAiStatus('Picture inserted! Teacher: check the credit and save your lesson.');
    } catch (error) {
        console.error('[lesson image import]', error);
        lessonImageStatus(error.message || 'Could not copy this image to SikLab.', true);
        button.textContent = 'Try again';
    } finally { button.disabled = false; }
}

async function generateLessonIllustration() {
    const prompt = document.getElementById('lesson-image-query')?.value.trim() || '';
    const editor = document.getElementById(siklabImageTargetEditorId);
    if (!editor) return;
    if (prompt.length < 3) return lessonImageStatus('Enter a topic for the illustration.', true);
    const button = document.getElementById('lesson-image-generate');
    button.disabled = true;
    try {
        lessonImageStatus('Making a child-friendly illustration… Image generation can use paid Gemini quota.');
        const result = await invokeLessonFunction('lesson-media', {
            action: 'generate', prompt: prompt.slice(0, 180), year_id: await getActiveYearId()
        });
        const img = document.createElement('img');
        img.src = result.publicUrl;
        img.alt = `AI illustration: ${prompt}`;
        img.style.cssText = 'width:65%;height:auto;display:block;margin:1rem auto;border-radius:1rem';
        const note = document.createElement('p');
        note.textContent = 'AI-generated illustration. Teacher: verify scientific accuracy before publishing.';
        editor.append(img, note);
        newlyUploadedLessonImages.add(result.publicUrl);
        closeLessonImageSearch();
        lessonAiStatus('Illustration inserted. Inspect scientific accuracy, then SAVE.');
    } catch (error) {
        console.error('[lesson illustration]', error);
        lessonImageStatus(error.message || 'Illustration generation failed.', true);
    } finally { button.disabled = false; }
}
