/* global chrome */
(function () {
    'use strict';

    function parseRequest(text) {
        if (/\b(bookmarks?|saved (sites?|links?))\b/i.test(text)) {
            return { type: 'bookmarks', query: text.toLowerCase()
                .replace(/\b(find|search|show|look|for|up|my|me|the|all|please|can|you|could|bookmarks?|saved|sites?|links?)\b/g, ' ')
                .replace(/[^\p{L}\p{N}\s.-]/gu, ' ').replace(/\s+/g, ' ').trim() };
        }
        if (/\b(plan|planning|focus|prioriti[sz]e)\b/i.test(text)) return { type: 'plan' };
        return { type: 'unknown' };
    }

    function parseExpression(text) {
        const match = text.match(/^\s*\[(wave|nod|dance|curious)\]\s*/i);
        return { mood: match ? match[1].toLowerCase() : 'nod', text: match ? text.slice(match[0].length) : text };
    }

    if (typeof module !== 'undefined') module.exports = { parseRequest, parseExpression };
    if (typeof document === 'undefined') return;

    const dialog = document.getElementById('ask-pip');
    const input = document.getElementById('ask-pip-input');
    const answer = document.getElementById('ask-pip-answer');
    let requestId = 0;
    let awaitingFocus = false;
    const localAI = window.PipLocalAI ? new window.PipLocalAI() : null;
    const aiToggle = document.getElementById('pip-local-ai');
    const aiStatus = document.getElementById('pip-ai-status');
    const stopButton = document.getElementById('pip-ai-stop');
    let statusVersion = 0;
    let ambientVersion = 0;
    const ambientAI = window.PipLocalAI ? new window.PipLocalAI() : null;
    const chatter = document.getElementById('pip-ai-chatter');
    let nextComment = Date.now() + 90000;
    const mood = name => window.pageCompanion?.setChatMood(name);
    if (chatter) {
        try { chatter.checked = localStorage.getItem('pipAIChatter') !== 'false'; } catch (_) {}
        chatter.addEventListener('change', () => {
            ambientVersion++;
            ambientAI?.cancel();
            try { localStorage.setItem('pipAIChatter', String(chatter.checked)); } catch (_) {}
        });
    }
    function cancelAmbient() { ambientVersion++; ambientAI?.cancel(); }
    async function ambientComment() {
        const pip = window.pageCompanion;
        if (!ambientAI || !aiToggle?.checked || !chatter?.checked || dialog.open || document.hidden ||
            !pip?.settings.enabled || !pip.settings.speech || pip.departure || pip.phase !== 'idle' || Date.now() < nextComment) return;
        nextComment = Date.now() + 240000 + Math.random() * 180000;
        const version = ++ambientVersion;
        try {
            if (await ambientAI.availability() !== 'available' || version !== ambientVersion) return;
            const response = await ambientAI.ask('Offer one fresh, friendly sentence to the person using this new tab. Mention the daily focus only if provided. No news claims. Under 24 words.', document.getElementById('daily-intention')?.value);
            if (version !== ambientVersion || dialog.open || document.hidden || !pip.settings.enabled || pip.departure || pip.phase !== 'idle') return;
            const expression = parseExpression(response);
            pip.speak('idle', expression.text.slice(0, 220));
            pip.setChatMood(expression.mood);
        } catch (_) { /* Autonomous comments are optional and never interrupt the page. */ }
    }
    window.setInterval?.(ambientComment, 15000);
    document.addEventListener?.('visibilitychange', () => { if (document.hidden) { cancelAmbient(); stopAI(); } });
    const setStatus = text => { if (aiStatus) aiStatus.textContent = text; };
    function stopAI() {
        localAI?.cancel();
        mood('listening');
        stopButton?.classList.add('hidden');
    }
    async function checkAI() {
        const version = ++statusVersion;
        if (!aiToggle?.checked) {
            setStatus('Local AI is off. Bookmark search and simple planning are available.');
            return;
        }
        setStatus('Checking Gemini Nano availability...');
        const state = await localAI?.availability();
        if (version !== statusVersion || !aiToggle.checked) return;
        setStatus(state === 'available' ? 'Gemini Nano is ready. Ask Pip a question.' :
            state === 'downloadable' || state === 'downloading' ? 'Gemini Nano needs a download. Submit a request to start or continue it.' :
            'Gemini Nano is unavailable in this Chrome or on this device. The basic helper still works.');
    }
    if (aiToggle) {
        try { aiToggle.checked = localStorage.getItem('pipLocalAI') === 'true'; } catch (_) { /* Optional preference. */ }
        aiToggle.addEventListener('change', () => {
            requestId += 1;
            stopAI();
            if (localAI) localAI.history = [];
            cancelAmbient();
            awaitingFocus = false;
            try { localStorage.setItem('pipLocalAI', String(aiToggle.checked)); } catch (_) { /* Optional preference. */ }
            checkAI();
        });
    }
    stopButton?.addEventListener('click', () => {
        requestId += 1;
        stopAI();
        answer.textContent = 'Stopped. You can ask another question.';
        setStatus('Local AI stopped.');
    });
    window.addEventListener?.('pagehide', () => { stopAI(); cancelAmbient(); });

    window.askPip = { cancelAmbient, close() { if (dialog.open) dialog.close(); stopAI(); cancelAmbient(); }, open() {
        cancelAmbient();
        if (!dialog.open) dialog.show();
        window.pageCompanion?.startConversation();
        input.focus();
        checkAI();
    } };
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') dialog.close(); });
    document.getElementById('ask-pip-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        requestId += 1;
        statusVersion += 1;
        stopAI();
        window.pageCompanion?.endConversation();
        if (localAI) localAI.history = [];
        document.getElementById('avatar-hit-target')?.focus();
    });
    dialog.querySelectorAll('[data-pip-prompt]').forEach(button => {
        button.addEventListener('click', () => {
            input.value = button.dataset.pipPrompt;
            document.getElementById('ask-pip-form').requestSubmit();
        });
    });

    function showPlan(focus) {
        answer.textContent = `Let’s make room for “${focus}”. Here’s a suggested plan:`;
        const list = document.createElement('ol');
        ['Pick one small, concrete outcome you can finish today.',
            `Spend 25 minutes on the first step toward ${focus}.`,
            'Take a five-minute break, then review what remains.'].forEach(text => {
            const item = document.createElement('li');
            item.textContent = text;
            list.append(item);
        });
        answer.append(list);
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Use as today’s focus';
        save.addEventListener('click', () => {
            const intention = document.getElementById('daily-intention');
            intention.value = focus.slice(0, intention.maxLength);
            intention.dispatchEvent(new Event('input', { bubbles: true }));
            save.textContent = 'Daily focus saved';
            save.disabled = true;
        });
        answer.append(save);
    }

    document.getElementById('ask-pip-form').addEventListener('submit', async event => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        const token = ++requestId;
        statusVersion += 1;
        stopAI();
        cancelAmbient();
        const request = parseRequest(text);
        input.value = '';
        if (aiToggle?.checked && localAI && request.type !== 'bookmarks') {
            awaitingFocus = false;
            answer.textContent = 'Preparing your local reply...';
            mood('thinking');
            stopButton?.classList.remove('hidden');
            try {
                const response = await localAI.ask(text, document.getElementById('daily-intention')?.value,
                    message => { if (token === requestId) setStatus(message); });
                if (token !== requestId || !dialog.open) return;
                const expression = parseExpression(response);
                answer.textContent = expression.text;
                mood(expression.mood);
                setStatus('Pip replied using local AI.');
                stopButton?.classList.add('hidden');
                return;
            } catch (_) {
                if (token !== requestId || !dialog.open) return;
                mood('curious');
                setStatus('Gemini Nano could not complete this request. Using the basic helper; try again to retry local AI.');
                stopButton?.classList.add('hidden');
            }
        }
        if (awaitingFocus && request.type === 'unknown') {
            awaitingFocus = false;
            showPlan(text);
            return;
        }
        awaitingFocus = false;
        if (request.type === 'plan') {
            const focus = document.getElementById('daily-intention')?.value.trim();
            if (focus) showPlan(focus);
            else {
                awaitingFocus = true;
                answer.textContent = 'What is the one thing you’d most like to get done today? Type it below and I’ll help break up your time.';
                input.focus();
            }
            return;
        }
        if (request.type !== 'bookmarks') {
            answer.textContent = 'I can currently search your bookmarks and make a simple daily plan. Try “find my design bookmarks” or “help me plan today”. General AI chat isn’t connected yet.';
            return;
        }
        answer.textContent = 'Looking through your bookmarks…';
        try {
            if (typeof chrome === 'undefined' || !chrome.bookmarks) throw new Error('unavailable');
            const tree = await new Promise((resolve, reject) => chrome.bookmarks.getTree(nodes => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve(nodes);
            }));
            if (token !== requestId || !dialog.open) return;
            const matches = [];
            const terms = request.query.split(' ').filter(Boolean);
            const visit = (nodes, folder = '') => nodes.forEach(node => {
                const searchable = `${folder} ${node.title || ''} ${node.url || ''}`.toLowerCase();
                if (node.url && /^https?:\/\//i.test(node.url) && terms.every(term => searchable.includes(term))) matches.push(node);
                if (node.children) visit(node.children, `${folder} ${node.title || ''}`);
            });
            visit(tree);
            answer.textContent = matches.length
                ? `Found ${matches.length} bookmark${matches.length === 1 ? '' : 's'}${matches.length > 20 ? ' — showing the first 20' : ''}:`
                : 'No matching bookmarks yet. Try a shorter keyword or a folder name.';
            const list = document.createElement('ul');
            matches.slice(0, 20).forEach(node => {
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = node.url;
                link.textContent = node.title || node.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                item.append(link);
                list.append(item);
            });
            answer.append(list);
        } catch (_) {
            if (token === requestId) answer.textContent = 'I couldn’t read your bookmarks. Open this page through the Chrome Home extension and try again.';
        }
    });
}());
