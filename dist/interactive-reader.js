class InteractiveReader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    loadFonts() {
        // Create font preload links to bypass CSP and ensure fonts load
        const fontUrls = [
            'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
            'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap'
        ];

        fontUrls.forEach(url => {
            // Check if font is already loaded in the document
            const existingLink = document.querySelector(`link[href="${url}"]`);
            if (!existingLink) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
            }
        });

        // Also inject fonts directly into shadow DOM as fallback
        const fontStyle = document.createElement('style');
        fontStyle.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
        `;
        this.shadowRoot.appendChild(fontStyle);
    }

    async connectedCallback() {
        try {
            // Load fonts programmatically to bypass CSP issues
            this.loadFonts();
            
            const templateUrl = new URL('reader-template.html', import.meta.url);
            const stylesUrl = new URL('interactive-reader.css', import.meta.url);
            
            // Fetch both template and styles
            const [templateResponse, stylesResponse] = await Promise.all([
                fetch(templateUrl),
                fetch(stylesUrl)
            ]);
            
            if (!templateResponse.ok) throw new Error(`Failed to fetch template: ${templateResponse.statusText}`);
            if (!stylesResponse.ok) throw new Error(`Failed to fetch styles: ${stylesResponse.statusText}`);

            const templateString = await templateResponse.text();
            const stylesString = await stylesResponse.text();
            
            // Create template and inject styles
            const template = document.createElement('template');
            template.innerHTML = `
                <style>${stylesString}</style>
                ${templateString}
            `;
            
            this.shadowRoot.appendChild(template.content.cloneNode(true));
            this.initialize();
        } catch (error) {
            console.error('Error loading interactive reader component:', error);
            this.shadowRoot.innerHTML = `<p style="color: red;">Error: Could not load reader component template. If you opened this page from a messaging app, please try copying the link into a regular browser like Chrome, Firefox, or Safari. หากคุณเปิดหน้านี้จากแอพส่งข้อความโปรดลองคัดลอกลิงก์ไปยังเบราว์เซอร์ปกติเช่น Chrome, Firefox หรือ Safari</p>`;
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
        const themeToggleBtn = qs('#theme-toggle-btn');
        const themeIconSun = qs('#theme-icon-sun');
        const themeIconMoon = qs('#theme-icon-moon');


        const WORD_LIST_STORAGE_KEY = 'thai_reading_tool_word_list';
        const THEME_STORAGE_KEY = 'thai_reading_tool_theme';
        
        let offlineDictionary = {};
        let originalTexts = [];
        let wordSpansForHighlighting = [];
        let lastHighlightedWord = null;
        let audioUrl = null;
        let audioEl = null;

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
            
            // Populate offlineDictionary with saved words
            words.forEach(wordData => {
                if (wordData.thai && wordData.thai.trim() !== '') {
                    offlineDictionary[wordData.english.toLowerCase()] = wordData.thai;
                }
            });
            
            if (words.length === 0) {
                wordListContainer.appendChild(wordListPlaceholder.cloneNode(true));
            } else {
                words.forEach(wordData => {
                    const div = document.createElement('div');
                    div.className = 'word-list-item';
                    div.dataset.english = wordData.english;
                    div.innerHTML = `
                        <div class="flex justify-between items-center p-3">
                            <div>
                                <p class="font-medium">${wordData.english}</p>
                                <p class="text-sm opacity-80" style="font-family: 'Sarabun', sans-serif;">${wordData.thai}</p>
                            </div>
                            <button data-english="${wordData.english}" class="remove-word-btn ml-3 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    `;
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
                
                // Add the definition to the offline dictionary and re-render reading pane
                if (wordData.thai && wordData.thai.trim() !== '') {
                    offlineDictionary[wordData.english.toLowerCase()] = wordData.thai;
                    renderReadingPane(); // Re-render to apply has-definition class
                }
            }
        }

        function removeWordFromList(englishWord) {
            let list = getWordList();
            list = list.filter(item => item.english.toLowerCase() !== englishWord.toLowerCase());
            saveWordList(list);
            renderWordList();
            
            // Remove the definition from the offline dictionary and re-render reading pane
            delete offlineDictionary[englishWord.toLowerCase()];
            renderReadingPane(); // Re-render to remove has-definition class
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
                const options = [4, 8, 12, 16].filter(n => n <= wordCount && n % 2 === 0);
                options.forEach(opt => {
                    wordCountSelect.innerHTML += `<option value="${opt}">${opt} words</option>`;
                });
                const allCount = wordCount % 2 === 0 ? wordCount : wordCount -1;
                if (allCount >= 4 && !options.includes(allCount)) {
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
                    // Make all words clickable, not just those with definitions
                    if (/\w/.test(cleanWord)) { // Check if part contains actual word characters
                        span.className = 'clickable-word';
                        span.dataset.english = cleanWord;
                        // Add has-definition class only for words with existing definitions
                        if (offlineDictionary[cleanWord]) {
                            span.classList.add('has-definition');
                        }
                    }
                    wordSpansForHighlighting.push({ element: span, start: charCounter, end: charCounter + part.length });
                    p.appendChild(span);
                    charCounter += part.length;
                });
                readingPane.appendChild(p);
                charCounter += 1; 
            });
        }

        function renderQuestions(questions) {
            if (!questions || questions.length === 0) return;
            const questionsDiv = document.createElement('div');
            questionsDiv.className = 'question-section';
            questionsDiv.innerHTML = '<h2 class="section-title">Comprehension Questions</h2>';

            questions.forEach((q, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.innerHTML = `<p style="font-weight: 600;">${index + 1}. ${q.question}</p>`;

                q.answers.forEach(answer => {
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'question-answer';
                    answerDiv.textContent = answer.text;
                    answerDiv.dataset.correct = answer.correct;
                    answerDiv.addEventListener('click', () => {
                        if (answerDiv.dataset.correct === 'true') {
                            answerDiv.style.backgroundColor = '#dcfce7';
                        } else {
                            answerDiv.style.backgroundColor = '#fee2e2';
                        }
                    });
                    questionDiv.appendChild(answerDiv);
                });

                questionsDiv.appendChild(questionDiv);
            });

            readingPane.appendChild(questionsDiv);
        }


        readingPane.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('clickable-word')) {
                const englishWord = target.dataset.english;
                const thaiWord = offlineDictionary[englishWord] || ''; // Use empty string if no definition
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
            const hasDefinition = thaiWord && thaiWord.trim() !== '';
            const placeholderText = hasDefinition ? '' : 'Enter Thai definition...';
            
            // Get the content container (the second div inside the popup)
            const contentContainer = popup.querySelector('div:last-child');
            contentContainer.innerHTML = `
            <div class="snackbar-content">
                <div class="snackbar-header">
                    <div class="snackbar-word">
                        ${englishWord}
                        <button id="play-word-again-btn" title="Play Word" style="background: none; border: none; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; border-radius: 0.25rem;" class="snackbar-close">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path opacity="0.15" d="M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z" fill="currentColor"/>
                                <path d="M16 8.99998C16.5 9.49999 17 10.5 17 12C17 13.5 16.5 14.5 16 15M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M13 3L7 8H5C3.89543 8 3 8.89543 3 10V14C3 15.1046 3.89543 16 5 16H7L13 21V3Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                    <button id="close-popup" class="snackbar-close">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <input id="thai-word-input" type="text" value="${thaiWord || ''}" placeholder="${placeholderText}" class="snackbar-input" />
                <div class="snackbar-buttons">
                    <button id="add-to-list-btn" class="snackbar-btn snackbar-btn-secondary">บันทึก</button>
                    <button id="remove-from-list-btn" class="snackbar-btn snackbar-btn-danger"${isInList ? '' : ' style="display:none;"'}>ลบ</button>
                    <button id="play-from-here-btn" class="snackbar-btn snackbar-btn-primary">ฟังจากที่นี่</button>
                </div>
            </div>`;
            
            // Show the snackbar with slide-up animation
            popup.classList.remove('hidden');
            // Force a reflow to ensure the initial state is applied
            popup.offsetHeight;
            // Remove the translate-y-full class to slide up
            popup.classList.remove('translate-y-full');

            const thaiInput = contentContainer.querySelector('#thai-word-input');

            contentContainer.querySelector('#add-to-list-btn').addEventListener('click', () => {
                addWordToList({ english: englishWord, thai: thaiInput.value });
                hidePopup();
            });
            contentContainer.querySelector('#remove-from-list-btn').addEventListener('click', () => {
                removeWordFromList(englishWord);
                hidePopup();
            });
            contentContainer.querySelector('#close-popup').addEventListener('click', hidePopup);
            contentContainer.querySelector('#play-from-here-btn').addEventListener('click', () => {
                playFromHere(englishWord, wordSpanEl);
                hidePopup();
            });
            contentContainer.querySelector('#play-word-again-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                speak(englishWord);
            });
        }

        function playFromHere(englishWord, wordSpanEl) {
            const spanEntry = wordSpansForHighlighting.find(span => span.element === wordSpanEl);
            if (!spanEntry) return;
            const charOffset = spanEntry.start;

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
                const onBoundary = (event) => {
                    if (event.name !== 'word') return;
                    if (lastHighlightedWord) lastHighlightedWord.classList.remove('speaking-highlight');
                    const globalCharIndex = event.charIndex + charOffset;
                    let word = wordSpansForHighlighting.find(span =>
                        globalCharIndex >= span.start && globalCharIndex < span.end && span.element.classList.contains('clickable-word')
                    );
                    if (!word) {
                        word = wordSpansForHighlighting.find(span =>
                            span.start >= globalCharIndex && span.element.classList.contains('clickable-word')
                        );
                    }
                    if (!word) {
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
        
        function hidePopup() { 
            // Add the translate-y-full class to slide down
            popup.classList.add('translate-y-full');
            // After the animation, hide the element
            setTimeout(() => {
                popup.classList.add('hidden');
            }, 300); // Match the transition duration
        }
        this.shadowRoot.addEventListener('click', (e) => {
            if (popup && !popup.contains(e.target) && !e.target.closest('.clickable-word')) {
                hidePopup();
            }
        });
        window.addEventListener('resize', hidePopup);


        function handleListen(rate = 1.0) {
            if (audioUrl) {
                if (!audioEl) {
                    audioEl = document.createElement('audio');
                    audioEl.src = audioUrl;
                    audioEl.preload = 'auto';
                    audioEl.style.display = 'none';
                    this.shadowRoot.appendChild(audioEl);
                }
                if (!audioEl.paused && !audioEl.ended) {
                    audioEl.pause();
                    audioEl.currentTime = 0;
                    listenIconPlay.classList.remove('hidden');
                    listenIconStop.classList.add('hidden');
                    pauseBtn.classList.remove('active');
                    pauseBtn.disabled = true;
                    slowBtn.disabled = true;
                    isPaused = false;
                    return;
                }
                listenIconPlay.classList.add('hidden');
                listenIconStop.classList.remove('hidden');
                pauseBtn.classList.remove('active');
                pauseBtn.disabled = false; // Enable pause button for audio
                slowBtn.disabled = true;   // Slow doesn't work with audio
                isPaused = false;
                audioEl.currentTime = 0;
                audioEl.play();
                audioEl.onended = () => {
                    listenIconPlay.classList.remove('hidden');
                    listenIconStop.classList.add('hidden');
                    pauseBtn.classList.remove('active');
                    pauseBtn.disabled = true;
                    slowBtn.disabled = true;
                    isPaused = false;
                };
                return;
            }
            if (synth.speaking || synth.paused) {
                synth.cancel();
                listenIconPlay.classList.remove('hidden');
                listenIconStop.classList.add('hidden');
                pauseBtn.classList.remove('active');
                pauseBtn.disabled = true;
                slowBtn.disabled = true;
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
            pauseBtn.disabled = false; // Enable pause button for TTS
            slowBtn.disabled = false;  // Enable slow button for TTS
            isPaused = false;
            speak(fullText, onBoundary, onEnd, rate);
        }

        listenBtn.addEventListener('click', () => handleListen.call(this, 1.0));

        pauseBtn.addEventListener('click', () => {
            if (audioUrl && audioEl) {
                if (audioEl.paused) {
                    audioEl.play();
                    pauseBtn.classList.remove('active');
                    isPaused = false;
                } else {
                    audioEl.pause();
                    pauseBtn.classList.add('active');
                    isPaused = true;
                }
                return;
            }
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

        slowBtn.addEventListener('click', () => {
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
            speak(fullText, onBoundary, onEnd, 0.6);
        });

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
        matchingGameBtn.addEventListener('click', () => { showActivityView('Memory Game'); generateMatchingGame(); });
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

                activityContent.innerHTML = `
                    <div class="quiz-container">
                        <p style="color: var(--text-muted);">Question ${currentIndex + 1} of ${words.length}</p>
                        <p class="quiz-question">${correctWord.english}</p>
                        <div id="quiz-options" class="quiz-options-grid">
                            ${options.map(opt => `<button data-correct="${opt.english === correctWord.english}" class="quiz-option">${opt.thai}</button>`).join('')}
                        </div>
                        <div id="quiz-feedback" class="quiz-feedback"></div>
                    </div>`;

                qs('#quiz-options').addEventListener('click', (e) => {
                    const selectedButton = e.target.closest('.quiz-option');
                    if (!selectedButton || selectedButton.disabled) return;

                    const isCorrect = selectedButton.dataset.correct === 'true';
                    qsa('.quiz-option').forEach(btn => {
                        btn.disabled = true;
                        if (btn.dataset.correct === 'true') btn.classList.add('correct');
                    });

                    if (isCorrect) {
                        score++;
                        selectedButton.classList.add('correct');
                    } else {
                        selectedButton.classList.add('incorrect');
                    }

                    const nextButton = document.createElement('button');
                    nextButton.textContent = 'Next →';
                    nextButton.className = 'button button-primary';
                    nextButton.style.marginTop = '1rem';
                    nextButton.onclick = () => { currentIndex++; showQuestion(); };
                    qs('#quiz-feedback').appendChild(nextButton);
                });
            }

            function showResults() {
                 activityContent.innerHTML = `
                    <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                        <h3 style="font-size: 2.25rem; font-weight: 700;">Quiz Complete!</h3>
                        <p style="font-size: 1.5rem; margin-top: 1rem; color: var(--text-muted);">You scored ${score} out of ${words.length}</p>
                        <div id="replay-buttons" style="margin-top: 2rem; display: flex; gap: 1rem;"></div>
                    </div>`;
                 const replayContainer = qs('#replay-buttons');
                 if (allWords.length > words.length && words.length > 0) {
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
            
            let cards = [];
            words.forEach((word, index) => {
                cards.push({ type: 'english', text: word.english, matchId: index });
                cards.push({ type: 'thai', text: word.thai, matchId: index });
            });
            cards.sort(() => 0.5 - Math.random());

            activityContent.innerHTML = `<div id="memory-grid" class="memory-grid"></div>`;
            const grid = qs('#memory-grid');

            const cardFrontIcon = `<svg class="card-front-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 21.75l-.648-1.188a2.25 2.25 0 01-1.4-1.4l-1.188-.648 1.188-.648a2.25 2.25 0 011.4-1.4l.648-1.188.648 1.188a2.25 2.25 0 011.4 1.4l1.188.648-1.188.648a2.25 2.25 0 01-1.4 1.4z" /></svg>`;

            cards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.classList.add('memory-card');
                cardEl.dataset.matchId = card.matchId;
                cardEl.innerHTML = `
                    <div class="card-face card-front">${cardFrontIcon}</div>
                    <div class="card-face card-back ${card.type === 'thai' ? 'thai' : ''}">${card.text}</div>
                `;
                grid.appendChild(cardEl);
            });

            let flippedCards = [];
            let lockBoard = false;
            let matchedPairs = 0;

            grid.addEventListener('click', e => {
                const clickedCard = e.target.closest('.memory-card');

                if (lockBoard || !clickedCard || clickedCard.classList.contains('flipped') || clickedCard.classList.contains('matched')) {
                    return;
                }

                clickedCard.classList.add('flipped');
                flippedCards.push(clickedCard);

                if (flippedCards.length === 2) {
                    lockBoard = true;
                    const [card1, card2] = flippedCards;

                    if (card1.dataset.matchId === card2.dataset.matchId) {
                        card1.classList.add('matched');
                        card2.classList.add('matched');
                        matchedPairs++;
                        flippedCards = [];
                        lockBoard = false;

                        if (matchedPairs === words.length) {
                            setTimeout(showGameResults, 800);
                        }
                    } else {
                        card1.classList.add('mismatched');
                        card2.classList.add('mismatched');
                        setTimeout(() => {
                            card1.classList.remove('flipped', 'mismatched');
                            card2.classList.remove('flipped', 'mismatched');
                            flippedCards = [];
                            lockBoard = false;
                        }, 1200);
                    }
                }
            });

            function showGameResults() {
                activityContent.innerHTML = `
                    <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                        <h3 style="font-size: 2.25rem; font-weight: 700; color: var(--secondary);">You Win!</h3>
                        <div id="replay-buttons" style="margin-top: 2rem; display: flex; justify-content: center; gap: 1rem;"></div>
                    </div>`;
                const replayContainer = qs('#replay-buttons');
                 if (allWords.length > words.length && words.length > 0) {
                     replayContainer.innerHTML += `<button id="play-again-same" class="button button-primary">Play Again (Same Words)</button><button id="play-again-new" class="button button-secondary">Play Again (New Words)</button>`;
                     qs('#play-again-same').addEventListener('click', () => generateMatchingGame(words));
                     qs('#play-again-new').addEventListener('click', () => generateMatchingGame());
                 } else {
                     replayContainer.innerHTML += `<button id="play-again" class="button button-primary">Play Again</button>`;
                     qs('#play-again').addEventListener('click', () => generateMatchingGame());
                 }
            }
        }

        function parseQuestions(questionsText) {
            if (!questionsText) return [];
            try {
                const questions = [];
                const lines = questionsText.split('\n').map(line => line.trim()).filter(line => line !== '');
                let currentQuestion = null;
                for (const line of lines) {
                    if (line.startsWith('Q:')) {
                        if (currentQuestion) questions.push(currentQuestion);
                        currentQuestion = { question: line.substring(2).trim(), answers: [] };
                    } else if (line.startsWith('A:')) {
                        if (currentQuestion) {
                            const parts = line.substring(2).split('[');
                            const answerText = parts[0].trim();
                            const isCorrect = parts.length > 1 && parts[1].trim() === 'correct]';
                            currentQuestion.answers.push({ text: answerText, correct: isCorrect });
                        }
                    }
                }
                if (currentQuestion) questions.push(currentQuestion);
                return questions;
            } catch (error) {
                console.error("Error parsing questions:", error);
                return [];
            }
        }
        
        function applyTheme(theme) {
            if (theme === 'dark') {
                this.classList.add('dark');
                themeIconSun.classList.remove('hidden');
                themeIconMoon.classList.add('hidden');
            } else {
                this.classList.remove('dark');
                themeIconSun.classList.add('hidden');
                themeIconMoon.classList.remove('hidden');
            }
        }

        themeToggleBtn.addEventListener('click', () => {
            const newTheme = this.classList.contains('dark') ? 'light' : 'dark';
            localStorage.setItem(THEME_STORAGE_KEY, newTheme);
            applyTheme.call(this, newTheme);
        });

        const init = () => {
            const rawContent = this.innerHTML;
            const parts = rawContent.split('---').map(p => p.trim());
            
            if (parts.length < 3) {
                console.error("Interactive Reader: Not enough content parts. Use '---' to separate title, text, and word bank.");
                return;
            }

            mainTitle.textContent = parts[0];

            try {
                const pairs = parts[2].split(',').map(p => p.split(':').map(s => s.trim()));
                offlineDictionary = Object.fromEntries(pairs);
            } catch (e) {
                console.error("Could not parse word bank.", e);
            }

            originalTexts = parts[1].split('\n').filter(p => p.trim() !== '');

            audioUrl = null;
            if (parts.length > 3 && parts[3].startsWith('audio')) {
                const audioMatch = parts[3].match(/audio-src\s*=\s*([^\s]+)/);
                if (audioMatch) {
                    audioUrl = audioMatch[1].trim();
                }
            }

            let questions = [];
            if (parts.length > 4 && parts[4].startsWith('questions')) {
                const questionsText = parts[4].substring(9).trim();
                questions = parseQuestions(questionsText);
            }

            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
            applyTheme.call(this, savedTheme);

            renderReadingPane();
            renderQuestions(questions);
            renderWordList();
            populateVoiceList();
        };

        init();
    }
}
customElements.define('interactive-reader', InteractiveReader);
