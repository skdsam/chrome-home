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

        // Desktop widget controls
        if (/\b(tidy\s*(up|screen)?|clean\s*(screen|desktop|workspace)?|close\s*all\s*widgets?|hide\s*all\s*widgets?)\b/i.test(text)) {
            return { type: 'widget', action: 'closeAll' };
        }
        if (/\b(minimize\s*all\s*widgets?|collapse\s*all\s*widgets?)\b/i.test(text)) {
            return { type: 'widget', action: 'minimizeAll' };
        }
        if (/\b(reset\s*(layout|widgets?|screen)|arrange\s*widgets?|realign\s*widgets?)\b/i.test(text)) {
            return { type: 'widget', action: 'resetLayout' };
        }
        if (/\b(what\s*widgets\s*(are\s*open|do\s*i\s*have)|open\s*widgets|list\s*widgets)\b/i.test(text)) {
            return { type: 'widget', action: 'list' };
        }
        const openMatch = text.match(/\b(?:open|show|launch|start|display)\s+(?:the\s+)?(?:my\s+)?(spotify|music|player|songs?|todo|tasks?|checklist|todos?|todolist|notes?|quick\s*notes?|notepad|scratchpad|sports?|football|scores?|matches?|tech\s*news|news|github|repos?|repositories|blender|blender\s*dev|movies?|cinema|films?)\b/i);
        if (openMatch) {
            return { type: 'widget', action: 'open', target: openMatch[1].trim() };
        }
        const closeMatch = text.match(/\b(?:close|hide|dismiss)\s+(?:the\s+)?(?:my\s+)?(spotify|music|player|songs?|todo|tasks?|checklist|todos?|todolist|notes?|quick\s*notes?|notepad|scratchpad|sports?|football|scores?|matches?|tech\s*news|news|github|repos?|repositories|blender|blender\s*dev|movies?|cinema|films?)\b/i);
        if (closeMatch) {
            return { type: 'widget', action: 'close', target: closeMatch[1].trim() };
        }
        const minMatch = text.match(/\b(?:minimize|collapse)\s+(?:the\s+)?(?:my\s+)?(spotify|music|player|songs?|todo|tasks?|checklist|todos?|todolist|notes?|quick\s*notes?|notepad|scratchpad|sports?|football|scores?|matches?|tech\s*news|news|github|repos?|repositories|blender|blender\s*dev|movies?|cinema|films?)\b/i);
        if (minMatch) {
            return { type: 'widget', action: 'minimize', target: minMatch[1].trim() };
        }

        return { type: 'unknown' };
    }

    function parseExpression(text) {
        const match = text.match(/^\s*\[(wave|nod|dance|curious)\]\s*/i);
        return { mood: match ? match[1].toLowerCase() : 'nod', text: match ? text.slice(match[0].length) : text };
    }

    function handleWidgetRequest(request) {
        const mgr = window.chromeHomeWidgets;
        if (!mgr) return { mood: 'curious', text: 'Widget controller is not available right now.' };

        if (request.action === 'closeAll') {
            const count = mgr.closeAll();
            return {
                mood: 'dance',
                text: count > 0 ? `All tidy! Closed ${count} open widget${count === 1 ? '' : 's'}.` : 'All tidy! No widgets were open.'
            };
        }
        if (request.action === 'minimizeAll') {
            const count = mgr.minimizeAll();
            return {
                mood: 'nod',
                text: count > 0 ? `Minimized ${count} widget${count === 1 ? '' : 's'} to their headers.` : 'No open widgets to minimize.'
            };
        }
        if (request.action === 'resetLayout') {
            mgr.resetLayout();
            return {
                mood: 'nod',
                text: 'Widgets have been reset to their default positions.'
            };
        }
        if (request.action === 'list') {
            const open = mgr.getOpenWidgets();
            if (!open.length) {
                return { mood: 'wave', text: 'No widgets are currently open on your screen.' };
            }
            const names = open.map(w => `${w.name}${w.isMinimized ? ' (minimized)' : ''}`).join(', ');
            return { mood: 'nod', text: `Currently open widgets: ${names}.` };
        }
        if (request.action === 'open') {
            const res = mgr.open(request.target);
            if (res) {
                window.pageCompanion?.targetWidget?.(res.id);
                return { mood: 'dance', text: `Opened ${res.name} for you!` };
            }
            return { mood: 'curious', text: `I couldn't find a widget matching "${request.target}". Try Spotify, Tasks, Notes, Sports, News, GitHub, Blender, or Movies.` };
        }
        if (request.action === 'close') {
            const res = mgr.close(request.target);
            if (res) {
                return { mood: 'nod', text: `Closed ${res.name}.` };
            }
            return { mood: 'curious', text: `I couldn't find a widget matching "${request.target}".` };
        }
        if (request.action === 'minimize') {
            const res = mgr.minimize(request.target, true);
            if (res) {
                return { mood: 'nod', text: `Minimized ${res.name}.` };
            }
            return { mood: 'curious', text: `I couldn't find a widget matching "${request.target}".` };
        }
        return { mood: 'curious', text: 'Unknown widget command.' };
    }

    function renderSources(container, sources) {
        if (!container || !sources || !sources.length) return;
        const sec = document.createElement('div');
        sec.className = 'pip-sources-container';
        const title = document.createElement('div');
        title.className = 'pip-sources-title';
        title.textContent = 'Sources';
        sec.append(title);
        const list = document.createElement('ul');
        list.className = 'pip-sources-list';
        sources.forEach(s => {
            const item = document.createElement('li');
            item.className = 'pip-source-item';
            const link = document.createElement('a');
            link.href = s.url;
            link.textContent = s.title || s.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            item.append(link);
            if (s.snippet) {
                const snippet = document.createElement('span');
                snippet.className = 'pip-source-snippet';
                snippet.textContent = s.snippet.length > 120 ? s.snippet.slice(0, 117) + '...' : s.snippet;
                item.append(snippet);
            }
            list.append(item);
        });
        sec.append(list);
        container.append(sec);
    }

    if (typeof module !== 'undefined') module.exports = { parseRequest, parseExpression, renderSources, handleWidgetRequest };
    if (typeof document === 'undefined') return;

    const dialog = document.getElementById('ask-pip');
    const input = document.getElementById('ask-pip-input');
    const answer = document.getElementById('ask-pip-answer');
    let requestId = 0;
    let awaitingFocus = false;
    const localAI = window.PipLocalAI ? new window.PipLocalAI() : null;
    const webSearch = window.PipWebSearch ? new window.PipWebSearch() : null;
    const aiToggle = document.getElementById('pip-local-ai');
    const webSearchToggle = document.getElementById('pip-web-search');
    const aiStatus = document.getElementById('pip-ai-status');
    const stopButton = document.getElementById('pip-ai-stop');
    let statusVersion = 0;
    let ambientVersion = 0;
    const ambientAI = window.PipLocalAI ? new window.PipLocalAI() : null;
    const chatter = document.getElementById('pip-ai-chatter');
    let nextComment = Date.now() + 90000;
    const mood = name => window.pageCompanion?.setChatMood(name);
    if (webSearchToggle) {
        try { webSearchToggle.checked = localStorage.getItem('pipWebSearch') !== 'false'; } catch (_) {}
        webSearchToggle.addEventListener('change', () => {
            try { localStorage.setItem('pipWebSearch', String(webSearchToggle.checked)); } catch (_) {}
        });
    }
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
        stopButton?.classList?.add('hidden');
    }
    async function checkAI() {
        const version = ++statusVersion;
        if (!aiToggle?.checked) {
            setStatus('Local AI is off. Widget control, web lookup, bookmark search, and simple planning are available.');
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
        if (request.type === 'widget') {
            awaitingFocus = false;
            const res = handleWidgetRequest(request);
            answer.textContent = res.text;
            mood(res.mood);
            setStatus('Pip adjusted your desktop widgets.');
            return;
        }
        const useWeb = Boolean(webSearchToggle?.checked && webSearch && request.type !== 'bookmarks');
        if (aiToggle?.checked && localAI && request.type !== 'bookmarks') {
            awaitingFocus = false;
            answer.textContent = useWeb ? 'Searching the web and preparing your reply...' : 'Preparing your local reply...';
            mood('thinking');
            stopButton?.classList?.remove('hidden');
            try {
                let webContext = '';
                let sources = [];
                if (useWeb) {
                    setStatus('Searching DuckDuckGo & Wikipedia...');
                    const searchResult = await webSearch.search(text);
                    if (token !== requestId || !dialog.open) return;
                    webContext = searchResult.contextText;
                    sources = searchResult.sources;
                }
                const response = await localAI.ask(text, document.getElementById('daily-intention')?.value,
                    message => { if (token === requestId) setStatus(message); }, webContext);
                if (token !== requestId || !dialog.open) return;
                const expression = parseExpression(response);
                answer.textContent = expression.text;
                renderSources(answer, sources);
                mood(expression.mood);
                setStatus(sources.length ? 'Pip replied using local AI with web search.' : 'Pip replied using local AI.');
                stopButton?.classList?.add('hidden');
                return;
            } catch (_) {
                if (token !== requestId || !dialog.open) return;
                mood('curious');
                setStatus('Gemini Nano could not complete this request. Using the basic helper; try again to retry local AI.');
                stopButton?.classList?.add('hidden');
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
            if (useWeb) {
                answer.textContent = 'Searching the web for you...';
                mood('thinking');
                setStatus('Searching DuckDuckGo & Wikipedia...');
                try {
                    const searchResult = await webSearch.search(text);
                    if (token !== requestId || !dialog.open) return;
                    if (searchResult.sources && searchResult.sources.length) {
                        answer.textContent = `Here is what I found for "${text}":`;
                        renderSources(answer, searchResult.sources);
                        mood('nod');
                        setStatus('Found web results via DuckDuckGo & Wikipedia.');
                        return;
                    }
                } catch (_) { /* fallback below */ }
            }
            answer.textContent = 'I can control your widgets, search the web, find bookmarks, and make a simple daily plan. Try “open tasks”, “tidy screen”, or ask a question.';
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
