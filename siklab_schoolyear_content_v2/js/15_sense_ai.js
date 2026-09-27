/* SikLab Sense Detectives AI: teacher-side draft review; existing P1/P2 5-button mapping unchanged. */
const senseLabels = ['Sight • Button 1', 'Touch • Button 2', 'Hearing • Button 3', 'Smell • Button 4', 'Taste • Button 5'];
let senseDrafts = [];
let senseSourceInfo = {};
let senseRequestVersion = 0;
let senseRequireImages = true;
const senseEl = id => document.getElementById(id);
const senseEsc = value => typeof escapeHtml === 'function' ? escapeHtml(String(value ?? '')) : String(value ?? '');
const senseYear = () => Number(window.currentSchoolYearId || 0);
const senseStatus = message => { if (senseEl('sense-status')) senseEl('sense-status').textContent = message; };
function senseChangeSource() {
    const source = senseEl('sense-source')?.value;
    for (const [name, id] of [['lesson','sense-lesson-wrap'], ['pdf','sense-pdf-wrap'], ['topic','sense-topic-wrap']])
        senseEl(id)?.classList.toggle('hidden', name !== source);
}
function openSenseQuestions() {
    switchTab('content');
    if (senseEl('cq-module')) senseEl('cq-module').value = 'W1';
    loadCustomQuestions();
    senseRefreshLessons();
}
function openSenseSettings() {
    switchTab('settings');
    const path = allGames.find(game => getModuleFromPath(game.path) === 'W1')?.path;
    if (path && senseEl('setting-game')) { senseEl('setting-game').value = path; renderSettingsForm(path); }
}
function showSenseQuickLaunch(path) {
    senseEl('sense-quick-launch')?.classList.toggle('hidden', getModuleFromPath(path) !== 'W1');
}
function saveSenseQuestionSet() {
    const yearId = senseYear();
    if (yearId) localStorage.setItem(`siklab_sense_question_set_${yearId}`, senseEl('launch-question-set')?.value || '');
}
async function loadSenseQuestionSets() {
    const select = senseEl('launch-question-set'); const yearId = senseYear();
    if (!select || !yearId) return;
    const last = localStorage.getItem(`siklab_sense_question_set_${yearId}`) || '';
    try {
        const { data, error } = await requireSupabase().from('custom_question')
            .select('question_set').eq('school_year_id', yearId).eq('game_module','W1')
            .eq('review_status','approved');
        if (error) throw error;
        const sets = [...new Set((data || []).map(row => row.question_set || 'General Questions'))].sort();
        select.replaceChildren(new Option('All approved questions', ''), ...sets.map(set => new Option(set,set)));
        select.value = sets.includes(last) ? last : '';
    } catch (error) { console.warn('[Sense sets]', error); select.replaceChildren(new Option('All approved questions','')); }
    showSenseQuickLaunch(senseEl('launch-game')?.value || '');
}
async function senseRefreshLessons() {
    const select = senseEl('sense-lesson'); const yearId = senseYear();
    if (!select || !yearId) return;
    const oldValue = select.value;
    select.replaceChildren(new Option('Loading lessons…',''));
    try {
        const { data, error } = await requireSupabase().from('lesson_modules')
            .select('module_id,title,week_id,is_published').eq('school_year_id',yearId)
            .order('week_id',{ascending:true});
        if (error) throw error;
        select.replaceChildren(new Option('Select an existing lesson',''),...(data || []).map(row =>
            new Option(`${row.title} ${row.is_published === false ? '(Draft)' : ''}`, String(row.module_id))));
        if ([...select.options].some(opt=>opt.value === oldValue)) select.value = oldValue;
    } catch (error) { select.replaceChildren(new Option('Lessons unavailable','')); senseStatus(error.message); }
}
async function sensePdfBase64(file) {
    if (!file || file.size > 5 * 1024 * 1024) throw new Error('Choose a PDF no larger than 5 MB.');
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Please choose a PDF file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0,5)) !== '%PDF-') throw new Error('This file is not a valid PDF.');
    let binary = ''; const slice = 0x8000;
    for(let i=0; i<bytes.length; i += slice) binary += String.fromCharCode(...bytes.subarray(i,i+slice));
    return btoa(binary);
}
async function senseGenerateQuestions() {
    const button = senseEl('sense-generate-btn'); const yearId = senseYear();
    if (!yearId) return showErrorToast('Choose a school year first.');
    const count = Number(senseEl('sense-count')?.value || 5);
    const source = senseEl('sense-source')?.value || 'lesson';
    const body = { source_type: source, school_year_id: yearId, question_count: count,
        focus: senseEl('sense-focus')?.value.trim().slice(0,160) || '' };
    try {
        button.disabled = true; button.textContent = 'Generating…'; senseStatus('Preparing your question draft…');
        if (source === 'pdf') {
            const file = senseEl('sense-pdf')?.files?.[0];
            body.pdf_base64 = await sensePdfBase64(file);
            body.filename = file.name.slice(0,140);
        } else if (source === 'lesson') {
            body.lesson_module_id = Number(senseEl('sense-lesson')?.value || 0);
            if (!body.lesson_module_id) throw new Error('Select a saved lesson first.');
        } else {
            body.topic = senseEl('sense-topic')?.value.trim().slice(0,160) || '';
            if (body.topic.length < 3) throw new Error('Enter a science topic first.');
        }
        const { data, error } = await requireSupabase().functions.invoke('ai-game-questions',{body});
        if (error || data?.error) throw new Error(data?.error || error?.message || 'AI request failed.');
        if (!Array.isArray(data?.questions) || !data.questions.length) throw new Error('Gemini returned no usable five-senses questions.');
        const version = ++senseRequestVersion;
        senseDrafts = data.questions.map(q => ({...q, image_url:'',image_candidates:[],image_attribution:'',image_license:'',image_source:'',busy:false}));
        senseSourceInfo = { source_type:source, source_label:source === 'pdf' ? body.filename : source === 'topic' ? body.topic : senseEl('sense-lesson').selectedOptions[0]?.textContent || '',
            lesson_module_id:source === 'lesson' ? body.lesson_module_id : null, school_year_id:yearId };
        senseRenderDrafts();
        senseStatus(`Generated ${senseDrafts.length} drafts. Searching for image suggestions—please review before saving.`);
        // Small batches avoid opening 15 parallel Wikimedia search requests.
        for (let start=0; start<senseDrafts.length; start+=3) {
            if (version !== senseRequestVersion) return;
            await Promise.all(senseDrafts.slice(start,start+3).map((q,index)=>senseFindImages(start+index,false,version)));
        }
        if(version === senseRequestVersion) senseStatus('Image suggestions ready. Choose an image or upload your own for each question.');
    } catch(error) {console.error('[Sense AI]',error); senseStatus(error.message);showErrorToast(error.message);}
    finally {button.disabled=false;button.textContent='✦ Generate editable draft';}
}
function senseUpdate(index, key, value) {
    if (!senseDrafts[index]) return;
    if (key === 'correct_ans') senseDrafts[index][key] = Number(value);
    else senseDrafts[index][key] = String(value).slice(0, key === 'prompt' ? 350 : key === 'explanation' ? 500 : 160);
}
function senseRenderDrafts() {
    const target=senseEl('sense-drafts'); if(!target)return;
    if (!senseDrafts.length) {target.innerHTML='';return;}
    const safe = senseEsc;
    target.innerHTML = `<div class="flex flex-wrap gap-2 items-center justify-between border-b pb-3"><h4 class="font-black text-slate-800">Review ${senseDrafts.length} questions</h4><label class="text-sm text-slate-700 flex items-center gap-2"><input type="checkbox" id="sense-require-images" ${senseRequireImages ? 'checked' : ''} onchange="senseRequireImages=this.checked"> Require approved picture for every question</label><button type="button" id="sense-save-btn" onclick="senseSaveDrafts()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black">Save approved questions</button></div>` + senseDrafts.map((q,i)=>`
    <article class="sense-draft" id="sense-draft-${i}">
        <div class="flex items-center justify-between mb-2"><strong>Question ${i+1}</strong><span class="text-xs font-bold text-orange-700">${safe(q.source_page ? 'PDF page '+q.source_page : senseSourceInfo.source_type || 'Draft')}</span></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="space-y-3"><label class="sense-field"><span>Question</span><textarea rows="3" maxlength="350" oninput="senseUpdate(${i},'prompt',this.value)">${safe(q.prompt)}</textarea></label>
            <label class="sense-field"><span>Correct sense / ESP32 button</span><select onchange="senseUpdate(${i},'correct_ans',this.value)">${senseLabels.map((label,n)=>`<option value="${n}" ${n===Number(q.correct_ans)?'selected':''}>${safe(label)}</option>`).join('')}</select></label>
            <label class="sense-field"><span>Explanation (teacher review)</span><textarea rows="2" maxlength="500" oninput="senseUpdate(${i},'explanation',this.value)">${safe(q.explanation||'')}</textarea></label>
            <label class="sense-field"><span>Picture search words</span><input maxlength="160" value="${safe(q.image_query||'')}" onchange="senseUpdate(${i},'image_query',this.value)"></label></div>
            <div class="space-y-3">
                ${q.image_url?`<img class="sense-preview" src="${safe(q.image_url)}" alt="Selected game illustration"><div class="text-xs text-emerald-700 font-bold">Picture selected ✓ ${safe(q.image_attribution||'')}</div>`:'<div class="flex min-h-[150px] items-center justify-center text-sm font-bold text-slate-500 border border-dashed border-slate-300 rounded-xl">Choose a picture for this question</div>'}
                <div class="flex flex-wrap gap-2"><button class="sense-action" type="button" onclick="senseFindImages(${i},true)">⌕ Find picture</button><label class="sense-action cursor-pointer">↑ Upload image<input class="hidden" type="file" accept="image/png,image/jpeg,image/webp" onchange="senseUploadImage(${i},this)"></label><button class="sense-action" type="button" onclick="senseGenerateImage(${i})">✦ AI illustration</button><button class="sense-action" type="button" onclick="senseClearImage(${i})">Remove</button></div>
                <div id="sense-images-${i}" class="sense-img-grid">${(q.image_candidates||[]).map((c,n)=>`<button type="button" onclick="sensePickImage(${i},${n})" title="Use this Commons image: ${safe(c.title)}"><img src="${safe(c.thumb)}" alt="${safe(c.title)}" loading="lazy"><span>${safe(c.title)}</span><small>${safe(c.license)}</small></button>`).join('')}</div>
                <p class="text-xs text-slate-500">Wikimedia images are suggestions, not automatically approved. Check relevance and licensing.</p>
            </div>
        </div>
    </article>`).join('');
}
function senseRenderCandidates(index) {
    const q=senseDrafts[index], target=senseEl(`sense-images-${index}`);
    if (!q || !target) return;
    target.innerHTML = (q.image_candidates || []).map((c,n)=>`<button type="button" onclick="sensePickImage(${index},${n})" title="Use this Commons image: ${senseEsc(c.title)}"><img src="${senseEsc(c.thumb)}" alt="${senseEsc(c.title)}" loading="lazy"><span>${senseEsc(c.title)}</span><small>${senseEsc(c.license)}</small></button>`).join('');
}
async function senseFindImages(index,notify=true,version=senseRequestVersion) {
    const q=senseDrafts[index]; if(!q || q.busy)return;
    q.busy=true;const query = q.image_query || q.prompt;
    try {
        if(notify)senseStatus(`Searching pictures for Question ${index+1}…`);
        const {data,error}=await requireSupabase().functions.invoke('lesson-media',{body:{action:'search',query}});
        if(error || data?.error) throw new Error(data?.error || error?.message || 'Image search failed.');
        if(version !== senseRequestVersion)return;
        q.image_candidates=Array.isArray(data.images)?data.images:[];
        senseRenderCandidates(index);
        if(notify)senseStatus(q.image_candidates.length? 'Choose a picture to import it into SikLab.':'No matching pictures; try new keywords or upload your own.');
    } catch(error) {console.warn('[Sense pictures]',error);if(notify)senseStatus(error.message);}
    finally {q.busy=false;}
}
async function sensePickImage(index,candidateIndex) {
    const q=senseDrafts[index], image=q?.image_candidates?.[candidateIndex];if(!q||!image)return;
    try {
        senseStatus(`Importing picture for Question ${index+1}…`);
        const {data,error}=await requireSupabase().functions.invoke('lesson-media',{body:{action:'import',url:image.url,year_id:senseYear(),attribution:image.artist,license:image.license,source:image.page}});
        if(error || data?.error || !data?.publicUrl)throw new Error(data?.error || error?.message || 'Picture could not be saved.');
        Object.assign(q,{image_url:data.publicUrl,image_attribution:data.attribution||image.artist,image_license:data.license||image.license,image_source:data.source||image.page});
        senseRenderDrafts();senseStatus(`Question ${index+1}: picture imported. Verify the image and answer before saving.`);
    } catch(error){senseStatus(error.message);showErrorToast(error.message);}
}
async function senseUploadImage(index,input){
    const q=senseDrafts[index], file=input.files?.[0];if(!q||!file)return;
    try {
        if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>5*1024*1024)throw new Error('Choose PNG, JPG or WebP under 5 MB.');
        const compressed=await compressSikLabImage(file,1200,0.82);
        const uploaded=await uploadSikLabImage('question-images',compressed,`school-year-${senseYear()}/W1`);
        q.image_url=uploaded.publicUrl;q.image_attribution='Teacher provided';q.image_license='Teacher supplied';q.image_source='';
        senseRenderDrafts();senseStatus(`Question ${index+1}: custom picture saved.`);
    } catch(error){senseStatus(error.message);showErrorToast(error.message);}
}
async function senseGenerateImage(index) {
    const q=senseDrafts[index];if(!q)return;
    try {
        senseStatus(`Generating illustration for Question ${index+1}…`);
        const {data,error}=await requireSupabase().functions.invoke('lesson-media',{body:{action:'generate',year_id:senseYear(),prompt:q.image_query||q.prompt}});
        if(error || data?.error || !data?.publicUrl)throw new Error(data?.error || error?.message || 'AI illustration unavailable.');
        q.image_url=data.publicUrl;q.image_attribution='AI-generated illustration';q.image_license='AI generated';q.image_source='';
        senseRenderDrafts();senseStatus(`Question ${index+1}: check the AI illustration for scientific accuracy.`);
    } catch(error){senseStatus(error.message);showErrorToast(error.message);}
}
function senseClearImage(index){if(!senseDrafts[index])return;Object.assign(senseDrafts[index],{image_url:'',image_attribution:'',image_license:'',image_source:''});senseRenderDrafts();}
async function senseSaveDrafts() {
    const button=senseEl('sense-save-btn'), requireImages=senseRequireImages;
    const yearId=senseYear(), setName=senseEl('sense-set-name')?.value.trim().slice(0,90)||'Sense Detectives AI Set';
    if(!yearId || yearId!==senseSourceInfo.school_year_id)return showErrorToast('Your school year changed. Generate new drafts for the selected year.');
    if(!senseDrafts.length)return;
    const rows=[];
    for (const [index,q] of senseDrafts.entries()) {
        if(!q.prompt?.trim() || !Number.isInteger(Number(q.correct_ans)) || Number(q.correct_ans)<0 || Number(q.correct_ans)>4) return showErrorToast(`Check question ${index+1} and its correct sense.`);
        if(requireImages && !q.image_url)return showErrorToast(`Choose or upload a picture for Question ${index+1}.`);
        rows.push({school_year_id:yearId,game_module:'W1',question_set:setName,prompt:q.prompt.trim().slice(0,350),correct_ans:Number(q.correct_ans),image_url:q.image_url||null,
            time_limit:10,explanation:q.explanation?.trim().slice(0,500)||null,topic:q.topic||null,source_type:senseSourceInfo.source_type,
            source_label:senseSourceInfo.source_label?.slice(0,150)||null,lesson_module_id:senseSourceInfo.lesson_module_id,
            image_query:q.image_query?.slice(0,160)||null,image_attribution:q.image_attribution||null,image_license:q.image_license||null,image_source:q.image_source||null,
            ai_generated:true,review_status:'approved'});
    }
    if(!confirm(`Save ${rows.length} teacher-reviewed questions to set "${setName}"?`))return;
    try {
        button.disabled=true;button.textContent='Saving…';
        const {error}=await requireSupabase().from('custom_question').insert(rows);
        if(error)throw error;
        senseDrafts=[];senseRequestVersion++;senseRenderDrafts();await loadCustomQuestions();await loadSenseQuestionSets();
        if(senseEl('launch-question-set')) {senseEl('launch-question-set').value=setName;saveSenseQuestionSet();}
        senseStatus(`Saved ${rows.length} approved questions to "${setName}". Select this set on the Game Dashboard.`);
        if(typeof loadContentManagement==='function')loadContentManagement();
        showToast(`${rows.length} Sense Detectives questions saved!`);
    } catch(error){senseStatus(error.message);showErrorToast(error.message);}
    finally {if(button){button.disabled=false;button.textContent='Save approved questions';}}
}
