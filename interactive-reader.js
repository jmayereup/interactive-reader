class InteractiveReader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        try {
            // Construct a URL to the template relative to the script's location.
            // This makes the component more portable, as it doesn't rely on
            // absolute paths or hardcoded domains.
            const templateUrl = new URL('reader-template.html', import.meta.url);
            const response = await fetch(templateUrl);
            if (!response.ok) throw new Error(`Failed to fetch template: ${response.statusText}`);

            const templateString = await response.text();
            const template = document.createElement('template');
            template.innerHTML = templateString;
            
            this.shadowRoot.appendChild(template.content.cloneNode(true));
            this.initialize();
        } catch (error) {
            console.error('Error loading interactive reader component:', error);
            this.shadowRoot.innerHTML = `<p style="color: red;">Error: Could not load reader component template.</p>`;
        }
    }
    
    initialize() {
        const qs = (selector) => this.shadowRoot.querySelector(selector);
        const qsa = (selector) => this.shadowRoot.querySelectorAll(selector);
        
        const mainTitle = qs('.main-title');
        const readingPane = qs('#reading-pane');
        const wordListContainer = qs('#word-list');
        const wordListPlaceholder = qs('#word-list-placeholder');
        const popup = qs('#translation-popup');
        const activityModal = qs('#activity-modal');
        const activityTitle = qs('#activity-title');
        const activityContent = qs('#activity-content');
        const closeActivityBtn = qs('#close-activity-btn');
        const quizBtn = qs('#quiz-btn');
        const matchingGameBtn = qs('#matching-game-btn');
        const exportBtn = qs('#export-btn');
        const activitiesHelper = qs('#activities-helper');
        const wordCountSelector = qs('#word-count-selector');
        const wordCountSelect = qs('#word-count');
        const listenBtn = qs('#listen-btn');
        const listenIconPlay = qs('#listen-icon-play');
        const listenIconStop = qs('#listen-icon-stop');
        const pauseBtn = qs('#pause-btn');
        const slowBtn = qs('#slow-btn');

        const WORD_LIST_STORAGE_KEY = 'thai_reading_tool_word_list';
        
        let offlineDictionary = {};
        let originalTexts = [];
        let wordSpansForHighlighting = [];
        let lastHighlightedWord = null;

        const synth = window.speechSynthesis;
        let voices = [];
        function populateVoiceList() { 
            voices = synth.getVoices().filter(voice => voice.lang.startsWith('en')); 
            if (synth.onvoiceschanged !== undefined) {
                synth.onvoiceschanged = () => {
                     voices = synth.getVoices().filter(voice => voice.lang.startsWith('en'));
                };
            }
        }
        
        let isPaused = false;
        let currentUtterance = null;
        let currentOnEnd = null;
        let lastPlaybackRate = 1.0;
        function speak(text, onBoundary, onEnd, rate = 1.0) {
            lastPlaybackRate = rate;
            if (synth.speaking || synth.paused) { synth.cancel(); }
            if (text) {
                const utterThis = new SpeechSynthesisUtterance(text);
                utterThis.rate = rate;
                utterThis.onboundary = onBoundary;
                utterThis.onend = function(event) {
                    if (onEnd) onEnd();
                    currentUtterance = null;
                    currentOnEnd = null;
                };
                utterThis.onerror = (event) => {
                    console.error('SpeechSynthesisUtterance.onerror', event);
                    if (onEnd) onEnd();
                    currentUtterance = null;
                    currentOnEnd = null;
                };
                const selectedVoice = voices.find(voice => voice.name === 'Google US English') || voices.find(voice => voice.default) || voices[0];
                if (selectedVoice) utterThis.voice = selectedVoice;
                currentUtterance = utterThis;
                currentOnEnd = onEnd;
                synth.speak(utterThis);
            }
        }

        function getWordList() { return JSON.parse(localStorage.getItem(WORD_LIST_STORAGE_KEY) || '[]'); }
        function saveWordList(list) { localStorage.setItem(WORD_LIST_STORAGE_KEY, JSON.stringify(list)); }
        
        function updateReadingPaneHighlights() {
            const wordSpans = qsa('#reading-pane .clickable-word');
            const wordsInList = new Set(getWordList().map(item => item.english.toLowerCase()));

            wordSpans.forEach(span => {
                const word = span.dataset.english.toLowerCase();
                if (wordsInList.has(word)) {
                    span.classList.add('word-in-list');
                } else {
                    span.classList.remove('word-in-list');
                }
            });
        }

        function renderWordList() {
            const words = getWordList();
            wordListContainer.innerHTML = '';
            if (words.length === 0) {
                wordListContainer.appendChild(wordListPlaceholder.cloneNode(true));
            } else {
                words.forEach(wordData => {
                    const div = document.createElement('div');
                    div.className = 'word-list-item';
                    div.dataset.english = wordData.english;
                    div.innerHTML = `<div><p>${wordData.english}</p><p>${wordData.thai}</p></div><button data-english="${wordData.english}" class="remove-word-btn">&times;</button>`;
                    wordListContainer.appendChild(div);
                });
            }
            updateActivityButtonsState(words.length);
            updateReadingPaneHighlights();
        }

        function addWordToList(wordData) {
            const list = getWordList();
            if (!list.some(item => item.english.toLowerCase() === wordData.english.toLowerCase())) {
            list.unshift(wordData); // Add new word at the beginning
            saveWordList(list);
            renderWordList();
            }
        }

        function removeWordFromList(englishWord) {
            let list = getWordList();
            list = list.filter(item => item.english.toLowerCase() !== englishWord.toLowerCase());
            saveWordList(list);
            renderWordList();
        }

        function updateActivityButtonsState(wordCount) {
            const requiredForActivities = 4;
            const requiredForExport = 1;
            const activitiesEnabled = wordCount >= requiredForActivities;
            quizBtn.disabled = !activitiesEnabled;
            matchingGameBtn.disabled = !activitiesEnabled;
            activitiesHelper.classList.toggle('hidden', activitiesEnabled);
            wordCountSelector.classList.toggle('hidden', !activitiesEnabled);
            if (activitiesEnabled) {
                wordCountSelect.innerHTML = '';
                const options = [4, 8, 12].filter(n => n <= wordCount && n % 2 === 0);
                options.forEach(opt => {
                    wordCountSelect.innerHTML += `<option value="${opt}">${opt} words</option>`;
                });
                const allCount = wordCount % 2 === 0 ? wordCount : wordCount -1;
                if (allCount >= 4) {
                   wordCountSelect.innerHTML += `<option value="${allCount}">All (${allCount} words)</option>`;
                }
            }
            exportBtn.disabled = wordCount < requiredForExport;
        }

        function renderReadingPane() {
            readingPane.innerHTML = ''; 
            wordSpansForHighlighting = [];
            let charCounter = 0;

            originalTexts.forEach(text => {
                const p = document.createElement('p');
                const parts = text.split(/([^\w'-]+)/);
                parts.forEach(part => {
                    const cleanWord = part.trim().toLowerCase();
                    const span = document.createElement('span');
                    span.textContent = part;
                    if (offlineDictionary[cleanWord]) {
                        span.className = 'clickable-word';
                        span.dataset.english = cleanWord;
                    }
                    wordSpansForHighlighting.push({ element: span, start: charCounter, end: charCounter + part.length });
                    p.appendChild(span);
                    charCounter += part.length;
                });
                readingPane.appendChild(p);
                charCounter += 1; 
            });
        }

        readingPane.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('clickable-word')) {
                const englishWord = target.dataset.english;
                const thaiWord = offlineDictionary[englishWord];
                speak(englishWord);
                displayPopup(target, englishWord, thaiWord, target);
            }
        });
        
        wordListContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-word-btn');
            if (removeBtn) {
                removeWordFromList(removeBtn.dataset.english);
                return; 
            }
            const listItem = e.target.closest('.word-list-item');
            if (listItem) {
                speak(listItem.dataset.english);
            }
        });

        function displayPopup(targetElement, englishWord, thaiWord, wordSpanEl = null) {
            const isInList = getWordList().some(item => item.english.toLowerCase() === englishWord.toLowerCase());
            popup.innerHTML = `<div id="popup-content">
            <p>${englishWord}</p>
            <input id="thai-word-input" type="text" value="${thaiWord}" style="font-family: 'Sarabun', sans-serif; width: 100%; margin-bottom: 0.5rem;" />
            <button id="add-to-list-btn" class="button button-secondary">บันทึกคำ</button>
            <button id="remove-from-list-btn" class="button button-red"${isInList ? '' : ' style="display:none;"'}>ลบคำ</button>
            <button id="play-from-here-btn" class="button button-primary">ฟังจากที่นี่</button>
            <button id="close-popup">&times;</button>
            </div>`;
            popup.classList.remove('hidden');
            positionPopup(targetElement);

            const thaiInput = popup.querySelector('#thai-word-input');

            popup.querySelector('#add-to-list-btn').addEventListener('click', () => {
            addWordToList({ english: englishWord, thai: thaiInput.value });
            hidePopup();
            });
            popup.querySelector('#remove-from-list-btn').addEventListener('click', () => {
            removeWordFromList(englishWord);
            hidePopup();
            });
            popup.querySelector('#close-popup').addEventListener('click', hidePopup);
            popup.querySelector('#play-from-here-btn').addEventListener('click', () => {
            playFromHere(englishWord, wordSpanEl);
            hidePopup();
            });
        }

        function playFromHere(englishWord, wordSpanEl) {
            // Find the wordSpanForHighlighting entry for the clicked span
            const spanEntry = wordSpansForHighlighting.find(span => span.element === wordSpanEl);
            if (!spanEntry) return;
            const charOffset = spanEntry.start;

            // Reconstruct the text to speak from the clicked span onward
            let found = false;
            let textToSpeak = '';
            for (let p of readingPane.querySelectorAll('p')) {
                for (let node of p.childNodes) {
                    if (!found && node === wordSpanEl) {
                        found = true;
                    }
                    if (found) {
                        textToSpeak += node.textContent;
                    }
                }
                if (found) textToSpeak += '\n';
            }
            if (textToSpeak.trim()) {
                // Use the last used playback rate
                const onBoundary = (event) => {
                    if (event.name !== 'word') return;
                    if (lastHighlightedWord) lastHighlightedWord.classList.remove('speaking-highlight');
                    const globalCharIndex = event.charIndex + charOffset;
                    // Only highlight clickable-word spans (not spaces/punctuation)
                    let word = wordSpansForHighlighting.find(span =>
                        globalCharIndex >= span.start && globalCharIndex < span.end && span.element.classList.contains('clickable-word')
                    );
                    if (!word) {
                        // If boundary lands on non-word, highlight the next clickable word span after the charIndex
                        word = wordSpansForHighlighting.find(span =>
                            span.start >= globalCharIndex && span.element.classList.contains('clickable-word')
                        );
                    }
                    if (!word) {
                        // fallback: highlight the last clickable word
                        const clickable = [...wordSpansForHighlighting].reverse().find(span => span.element.classList.contains('clickable-word'));
                        if (clickable) word = clickable;
                    }
                    if (word) {
                        word.element.classList.add('speaking-highlight');
                        lastHighlightedWord = word.element;
                    }
                };
                const onEnd = () => {
                    if (lastHighlightedWord) lastHighlightedWord.classList.remove('speaking-highlight');
                    lastHighlightedWord = null;
                    listenIconPlay.classList.remove('hidden');
                    listenIconStop.classList.add('hidden');
                    pauseBtn.classList.remove('active');
                    isPaused = false;
                };
                listenIconPlay.classList.add('hidden');
                listenIconStop.classList.remove('hidden');
                pauseBtn.classList.remove('active');
                isPaused = false;
                speak(textToSpeak, onBoundary, onEnd, lastPlaybackRate);
            }
        }
        
        function positionPopup(targetElement) {
            const rect = targetElement.getBoundingClientRect();
            const popupWidth = 200;
            const padding = 40;
            let left = rect.left;
            // Center popup above word if possible
            left = rect.left + (rect.width / 2) - (popupWidth / 2);
            // Clamp to viewport
            left = Math.max(padding, Math.min(left, window.innerWidth - popupWidth - padding));
            popup.style.left = `${left}px`;
            popup.style.top = `${rect.bottom + 10}px`;
            popup.style.width = `${popupWidth}px`;
        }

        function hidePopup() { popup.classList.add('hidden'); }
        this.shadowRoot.addEventListener('click', (e) => {
            if (popup && !popup.contains(e.target) && !e.target.closest('.clickable-word')) {
                hidePopup();
            }
        });
        window.addEventListener('resize', hidePopup);


        function handleListen(rate = 1.0) {
            if (synth.speaking || synth.paused) {
                synth.cancel();
                listenIconPlay.classList.remove('hidden');
                listenIconStop.classList.add('hidden');
                pauseBtn.classList.remove('active');
                isPaused = false;
                return;
            }
            const fullText = originalTexts.join('\n');
            const onBoundary = (event) => {
                if (event.name !== 'word') return;
                if (lastHighlightedWord) lastHighlightedWord.classList.remove('speaking-highlight');
                const word = wordSpansForHighlighting.find(span => event.charIndex >= span.start && event.charIndex < span.end);
                if (word) {
                    word.element.classList.add('speaking-highlight');
                    lastHighlightedWord = word.element;
                }
            };
            const onEnd = () => {
                if (lastHighlightedWord) lastHighlightedWord.classList.remove('speaking-highlight');
                lastHighlightedWord = null;
                listenIconPlay.classList.remove('hidden');
                listenIconStop.classList.add('hidden');
                pauseBtn.classList.remove('active');
                isPaused = false;
            };
            listenIconPlay.classList.add('hidden');
            listenIconStop.classList.remove('hidden');
            pauseBtn.classList.remove('active');
            isPaused = false;
            speak(fullText, onBoundary, onEnd, rate);
        }

        listenBtn.addEventListener('click', () => handleListen(1.0));

        // Pause button logic
        pauseBtn.addEventListener('click', () => {
            if (!synth.speaking && !synth.paused) return;
            if (!isPaused) {
                synth.pause();
                pauseBtn.classList.add('active');
                isPaused = true;
            } else {
                synth.resume();
                pauseBtn.classList.remove('active');
                isPaused = false;
            }
        });

        // Slow playback button logic
        slowBtn.addEventListener('click', () => handleListen(0.6));

        function showActivityView(title) {
            activityTitle.textContent = title;
            qs('#main-content').classList.add('hidden');
            activityModal.classList.remove('hidden');
        }

        function hideActivityView() {
            qs('#main-content').classList.remove('hidden');
            activityModal.classList.add('hidden');
            activityContent.innerHTML = '';
        }

        closeActivityBtn.addEventListener('click', hideActivityView);
        quizBtn.addEventListener('click', () => { showActivityView('Multiple Choice Quiz'); generateQuiz(); });
        matchingGameBtn.addEventListener('click', () => { showActivityView('Matching Game'); generateMatchingGame(); });
        exportBtn.addEventListener('click', () => {
            const words = getWordList();
            if (words.length === 0) return;
            const csvContent = words.map(w => `${w.english},${w.thai}`).join('\n');
            const textarea = document.createElement('textarea');
            textarea.value = csvContent;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                exportBtn.querySelector('span').textContent = 'Copied!';
            } catch (err) {
                exportBtn.querySelector('span').textContent = 'Error';
            }
            document.body.removeChild(textarea);
            setTimeout(() => { exportBtn.querySelector('span').textContent = 'Copy Vocab'; }, 2000);
        });

        function generateQuiz(wordsToUse = null) {
            const allWords = getWordList();
            let words = wordsToUse ? [...wordsToUse].sort(() => 0.5 - Math.random()) : allWords.sort(() => 0.5 - Math.random()).slice(0, parseInt(wordCountSelect.value));
            let currentIndex = 0, score = 0;
            function showQuestion() {
                if (currentIndex >= words.length) { showResults(); return; }
                const correctWord = words[currentIndex];
                let options = [correctWord, ...allWords.filter(w => w.english !== correctWord.english).sort(() => 0.5 - Math.random()).slice(0, 3)];
                options.sort(() => 0.5 - Math.random());
                activityContent.innerHTML = `<div style="text-align: center;"><p>Question ${currentIndex + 1} of ${words.length}</p><p style="font-size: 2.25rem; font-weight: 700; margin: 1.5rem 0;">${correctWord.english}</p><div id="quiz-options" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">${options.map(opt => `<button data-correct="${opt.english === correctWord.english}" class="quiz-option">${opt.thai}</button>`).join('')}</div><div id="quiz-feedback" style="margin-top: 1.5rem; height: 3rem;"></div></div>`;
                qs('#quiz-options').addEventListener('click', (e) => {
                    if (e.target.tagName !== 'BUTTON' || e.target.disabled) return;
                    const selectedButton = e.target;
                    const isCorrect = selectedButton.dataset.correct === 'true';
                    qsa('.quiz-option').forEach(btn => {
                        btn.disabled = true;
                        if (btn.dataset.correct === 'true') btn.classList.add('correct');
                    });
                    if (isCorrect) { score++; selectedButton.classList.add('correct'); } else { selectedButton.classList.add('incorrect'); }
                    const nextButton = document.createElement('button');
                    nextButton.textContent = 'Next →';
                    nextButton.className = 'button button-primary';
                    nextButton.onclick = () => { currentIndex++; showQuestion(); };
                    qs('#quiz-feedback').appendChild(nextButton);
                });
            }
            function showResults() {
                 activityContent.innerHTML = `<div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;"><h3 style="font-size: 2.25rem; font-weight: 700;">Quiz Complete!</h3><p style="font-size: 1.5rem; margin-top: 1rem;">You scored ${score} out of ${words.length}</p><div id="replay-buttons" style="margin-top: 2rem; display: flex; gap: 1rem;"></div></div>`;
                 const replayContainer = qs('#replay-buttons');
                 if (allWords.length > words.length) {
                     replayContainer.innerHTML += `<button id="play-again-same" class="button button-primary">Play Again (Same Words)</button><button id="play-again-new" class="button button-secondary">Play Again (New Words)</button>`;
                     qs('#play-again-same').addEventListener('click', () => generateQuiz(words));
                     qs('#play-again-new').addEventListener('click', () => generateQuiz());
                 } else {
                     replayContainer.innerHTML += `<button id="play-again" class="button button-primary">Play Again</button>`;
                     qs('#play-again').addEventListener('click', () => generateQuiz());
                 }
            }
            showQuestion();
        }

        function generateMatchingGame(wordsToUse = null) {
            const allWords = getWordList();
            let words = wordsToUse ? [...wordsToUse] : allWords.sort(() => 0.5 - Math.random()).slice(0, parseInt(wordCountSelect.value));
            
            let englishWords = words.map(w => ({...w}));
            let thaiWords = words.map(w => ({...w})).sort(() => 0.5 - Math.random());

            activityContent.innerHTML = `<div id="match-container">
                <div id="en-column" class="match-column"></div>
                <div id="th-column" class="match-column"></div>
            </div>`;
            
            const enCol = qs('#en-column');
            const thCol = qs('#th-column');

            englishWords.forEach(word => {
                enCol.innerHTML += `<button class="match-item" data-id="${word.english}">${word.english}</button>`;
            });
            thaiWords.forEach(word => {
                thCol.innerHTML += `<button class="match-item" data-id="${word.english}" style="font-family: 'Sarabun', sans-serif;">${word.thai}</button>`;
            });

            let selectedEn = null;
            let lockBoard = false;
            let matchedCount = 0;

            activityContent.addEventListener('click', (e) => {
                if (lockBoard || !e.target.classList.contains('match-item') || e.target.classList.contains('matched')) return;

                const clickedItem = e.target;

                if (enCol.contains(clickedItem)) {
                    if (selectedEn) selectedEn.classList.remove('selected');
                    selectedEn = clickedItem;
                    selectedEn.classList.add('selected');
                } else if (thCol.contains(clickedItem) && selectedEn) {
                    lockBoard = true;
                    if (selectedEn.dataset.id === clickedItem.dataset.id) {
                        selectedEn.classList.add('matched');
                        clickedItem.classList.add('matched');
                        selectedEn.classList.remove('selected');
                        selectedEn = null;
                        lockBoard = false;
                        matchedCount++;
                        if (matchedCount === words.length) {
                            showGameResults();
                        }
                    } else {
                        selectedEn.classList.add('incorrect');
                        clickedItem.classList.add('incorrect');
                        setTimeout(() => {
                            selectedEn.classList.remove('incorrect', 'selected');
                            clickedItem.classList.remove('incorrect');
                            selectedEn = null;
                            lockBoard = false;
                        }, 800);
                    }
                }
            });

            function showGameResults() {
                activityContent.innerHTML = `<div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;"><h3 style="font-size: 2.25rem; font-weight: 700; color: var(--secondary-color);">You Win!</h3><div id="replay-buttons" style="margin-top: 2rem; display: flex; justify-content: center; gap: 1rem;"></div></div>`;
                const replayContainer = qs('#replay-buttons');
                if (allWords.length > words.length) {
                     replayContainer.innerHTML += `<button id="play-again-same" class="button button-primary">Play Again (Same Words)</button><button id="play-again-new" class="button button-secondary">Play Again (New Words)</button>`;
                     qs('#play-again-same').addEventListener('click', () => generateMatchingGame(words));
                     qs('#play-again-new').addEventListener('click', () => generateMatchingGame());
                } else {
                     replayContainer.innerHTML += `<button id="play-again" class="button button-primary">Play Again</button>`;
                     qs('#play-again').addEventListener('click', () => generateMatchingGame());
                }
            }
        }
        
        // --- Initial Load ---
        const init = () => {
            // Parse content from innerHTML
            const rawContent = this.innerHTML;
            const parts = rawContent.split('---').map(p => p.trim());
            
            if (parts.length < 3) {
                console.error("Interactive Reader: Not enough content parts. Use '---' to separate title, text, and word bank.");
                return;
            }

            mainTitle.textContent = parts[0];
            
            // Parse word bank
            try {
                const pairs = parts[2].split(',').map(p => p.split(':').map(s => s.trim()));
                offlineDictionary = Object.fromEntries(pairs);
            } catch (e) {
                console.error("Could not parse word bank.", e);
            }

            // Parse text content
            originalTexts = parts[1].split('\n').filter(p => p.trim() !== '');

            renderReadingPane();
            renderWordList();
            populateVoiceList();
        };

        init();
    }
}
customElements.define('interactive-reader', InteractiveReader);
