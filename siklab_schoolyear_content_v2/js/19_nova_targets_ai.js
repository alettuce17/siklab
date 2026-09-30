/* =========================================================
 * SCIENCE CARNIVAL SHOOTER — AI TARGET CATEGORY BUILDER V1
 * Sources: selected topic, saved SikLab lesson, PDF or PPTX (<=5 MB)
 * Output: 2–4 shooter categories with emoji + label targets.
 * AI only fills an editable draft. Teacher must click Save Targets.
 * ========================================================= */

let novaTargetAiDraft = [];
let novaTargetAiRequestVersion = 0;

const novaTargetAiEl = id => document.getElementById(id);
const novaTargetAiYear = () => Number(window.currentSchoolYearId || 0);

function novaTargetAiStatus(message, tone = 'normal') {
    const el = novaTargetAiEl('nova-target-ai-status');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('text-slate-600', 'text-red-700', 'text-emerald-700', 'text-violet-700');
    el.classList.add(
        tone === 'error' ? 'text-red-700'
            : tone === 'success' ? 'text-emerald-700'
                : tone === 'busy' ? 'text-violet-700'
                    : 'text-slate-600'
    );
}

function novaTargetsAiSyncTopic() {
    const topic = typeof getSelectedNovaTopic === 'function' ? getSelectedNovaTopic() : null;
    const hint = novaTargetAiEl('nova-target-ai-selected-topic');
    if (hint) hint.textContent = topic
        ? `AI will build targets for: ${topic.topic_name}`
        : 'Select or create a Science Carnival topic first.';

    const input = novaTargetAiEl('nova-target-ai-topic');
    if (topic && input && !input.dataset.teacherEdited) input.value = topic.topic_name || '';
}

function novaTargetAiMarkTopicEdited() {
    const input = novaTargetAiEl('nova-target-ai-topic');
    if (input) input.dataset.teacherEdited = '1';
}

function novaTargetAiChangeSource() {
    const source = novaTargetAiEl('nova-target-ai-source')?.value || 'topic';
    novaTargetAiEl('nova-target-ai-topic-wrap')?.classList.toggle('hidden', source !== 'topic');
    novaTargetAiEl('nova-target-ai-lesson-wrap')?.classList.toggle('hidden', source !== 'lesson');
    novaTargetAiEl('nova-target-ai-pdf-wrap')?.classList.toggle('hidden', source !== 'pdf' && source !== 'pptx');
    const picker = novaTargetAiEl('nova-target-ai-pdf');
    if (picker) picker.accept = source === 'pptx' ? '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation' : '.pdf,application/pdf';
    const labels = { topic: 'selected/typed topic', lesson: 'saved SikLab lesson', pdf: 'uploaded PDF', pptx: 'uploaded PowerPoint' };
    novaTargetAiStatus(`Source: ${labels[source] || source}. AI fills a draft only; review it, then click Save Targets.`);
    if (source === 'lesson') novaTargetAiRefreshLessons();
}

async function novaTargetAiRefreshLessons() {
    const select = novaTargetAiEl('nova-target-ai-lesson');
    const yearId = novaTargetAiYear();
    if (!select) return;
    if (!yearId) {
        select.replaceChildren(new Option('Select a school year first', ''));
        return;
    }

    const previous = select.value;
    select.replaceChildren(new Option('Loading lessons…', ''));
    try {
        const { data, error } = await requireSupabase()
            .from('lesson_modules')
            .select('module_id,title,week_id,is_published')
            .eq('school_year_id', yearId)
            .order('week_id', { ascending: true });
        if (error) throw error;

        select.replaceChildren(
            new Option('Select an existing lesson', ''),
            ...(data || []).map(row => new Option(
                `${row.title || `Lesson ${row.week_id}`}${row.is_published === false ? ' (Draft)' : ''}`,
                String(row.module_id)
            ))
        );
        if ([...select.options].some(o => o.value === previous)) select.value = previous;
    } catch (error) {
        console.error('[Nova target AI lessons]', error);
        select.replaceChildren(new Option('Lessons unavailable', ''));
        novaTargetAiStatus(error.message || 'Could not load saved lessons.', 'error');
    }
}

async function novaTargetAiPdfBase64(file, source = 'pdf') { return siklabReferenceBase64(file, source); }

function novaTargetAiNormalizeCategory(raw) {
    const name = String(raw?.name || raw?.category || raw?.category_name || '').trim().replace(/\s+/g, ' ').slice(0, 32);
    const sourceTargets = Array.isArray(raw?.targets) ? raw.targets
        : Array.isArray(raw?.items) ? raw.items
            : Array.isArray(raw?.examples) ? raw.examples
                : [];

    const seen = new Set();
    const targets = sourceTargets.map(item => {
        if (typeof item === 'string') {
            const value = item.trim();
            const match = value.match(/^(\S+)\s+(.+)$/);
            return match
                ? { emoji: match[1].slice(0, 8), label: match[2].trim().slice(0, 24) }
                : { emoji: '🔹', label: value.slice(0, 24) };
        }
        return {
            emoji: String(item?.emoji || '🔹').trim().slice(0, 8),
            label: String(item?.label || item?.name || '').trim().replace(/\s+/g, ' ').slice(0, 24)
        };
    }).filter(item => {
        if (!item.label) return false;
        const key = `${item.emoji}|${item.label}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 6);

    return { name, targets };
}

function novaTargetAiApplyDraft(categories) {
    const normalized = (Array.isArray(categories) ? categories : [])
        .map(novaTargetAiNormalizeCategory)
        .filter(cat => cat.name && cat.targets.length >= 2)
        .slice(0, 4);

    if (normalized.length < 2) {
        throw new Error('AI returned target categories, but fewer than two were usable. Try a clearer topic or PDF.');
    }

    novaTargetAiDraft = normalized;
    for (let i = 0; i < 4; i++) {
        const category = normalized[i] || null;
        const nameEl = document.getElementById(`nova-cat-name-${i}`);
        const targetEl = document.getElementById(`nova-cat-targets-${i}`);
        if (nameEl) nameEl.value = category?.name || '';
        if (targetEl) {
            targetEl.value = category
                ? category.targets.map(item => `${item.emoji || '🔹'} ${item.label}`.trim()).join(', ')
                : '';
        }
    }

    const preview = novaTargetAiEl('nova-target-ai-preview');
    if (preview) {
        preview.innerHTML = normalized.map(cat => `
            <div class="rounded-lg border border-violet-100 bg-white p-2">
                <div class="text-xs font-black text-violet-700">${typeof escapeHtml === 'function' ? escapeHtml(cat.name) : cat.name}</div>
                <div class="text-xs text-slate-600 mt-1">${cat.targets.map(t => `${t.emoji} ${typeof escapeHtml === 'function' ? escapeHtml(t.label) : t.label}`).join(' • ')}</div>
            </div>
        `).join('');
        preview.classList.remove('hidden');
    }

    const status = document.getElementById('nova-target-config-status');
    if (status) status.textContent = `${normalized.length} AI-generated categories loaded as a draft. Review and click Save Targets.`;
}

async function novaTargetAiGenerate() {
    const button = novaTargetAiEl('nova-target-ai-generate-btn');
    const yearId = novaTargetAiYear();
    const bankTopic = typeof getSelectedNovaTopic === 'function' ? getSelectedNovaTopic() : null;
    if (!yearId) return showErrorToast('Choose a school year first.');
    if (!bankTopic) return showErrorToast('Create or select a Science Carnival topic before generating targets.');

    const source = novaTargetAiEl('nova-target-ai-source')?.value || 'topic';
    const focus = novaTargetAiEl('nova-target-ai-focus')?.value.trim().slice(0, 160) || '';
    const body = {
        game_module: 'NOVA',
        generation_type: 'targets',
        source_type: source,
        school_year_id: yearId,
        focus
    };

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generating targets…';
        }
        novaTargetAiStatus('Gemini is building clear shooter categories and emoji targets…', 'busy');

        if (source === 'pdf' || source === 'pptx') {
            const file = novaTargetAiEl('nova-target-ai-pdf')?.files?.[0];
            body[source === 'pptx' ? 'pptx_base64' : 'pdf_base64'] = await novaTargetAiPdfBase64(file, source);
            body.filename = file.name.slice(0, 140);
        } else if (source === 'lesson') {
            body.lesson_module_id = Number(novaTargetAiEl('nova-target-ai-lesson')?.value || 0);
            if (!body.lesson_module_id) throw new Error('Select a saved lesson first.');
        } else {
            const typed = novaTargetAiEl('nova-target-ai-topic')?.value.trim().slice(0, 160) || '';
            body.topic = typed || bankTopic.topic_name || '';
            if (body.topic.length < 3) throw new Error('Enter a science topic first.');
        }

        const { data, error } = await requireSupabase().functions.invoke('ai-game-questions', { body });
        if (error || data?.error) throw new Error(data?.error || error?.message || 'AI request failed.');
        if (!Array.isArray(data?.categories)) throw new Error('AI returned no target categories.');

        ++novaTargetAiRequestVersion;
        novaTargetAiApplyDraft(data.categories);
        novaTargetAiStatus(`Generated ${novaTargetAiDraft.length} target categories. Review the editable fields, then click Save Targets.`, 'success');
        console.info('[Science Carnival target AI]', data.version || 'unversioned', data.source_summary || '');
    } catch (error) {
        console.error('[Nova target AI generate]', error);
        novaTargetAiStatus(error.message || 'Could not generate target categories.', 'error');
        showErrorToast(error.message || 'Could not generate target categories.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Targets with AI';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    novaTargetAiChangeSource();
    novaTargetAiRefreshLessons().catch(error => console.warn('[Nova target AI lesson boot]', error));
    novaTargetsAiSyncTopic();
});
