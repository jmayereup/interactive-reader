class ReadThis extends HTMLElement {
  constructor() {
    super();
    let utterance = new SpeechSynthesisUtterance();
    utterance.lang = 'en-CA';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    // let utteranceVoiceURI = null;

    let lang = 'en-CA';
    let lang2 = "";
    let isPlaying = false;
    let useNewLine = false;

    utterance.addEventListener("end", function () {
      isPlaying = false;
    });


    const readVocabElements = document.querySelectorAll('.read-vocab');
    useNewLine = false;
    prepareLines(readVocabElements, useNewLine);
    
    const readLinesElements = document.querySelectorAll('.read-lines');
    useNewLine = true;
    prepareLines(readLinesElements, useNewLine);

    const readSectionElements = document.querySelectorAll('.read-section');
    prepareSection(readSectionElements);

    let spans = document.querySelectorAll(".read-this");
    addHeadphones(spans);
   
    if ('speechSynthesis' in window) {
      console.log("TTS supported.");
    } 
    if (('speechSynthesis' in window) == false) {
      console.log("TTS not supported.");
      if (!document.getElementById('tts-not-supported-warning'))  {
      let parent = document.querySelector('section');
      let warningElement = document.createElement('div');
      warningElement.textContent = `TEXT-TO-SPEECH NOT SUPPORTED:
      You need to open this page in a browser like Firefox, Chrome, Safari or Edge.
      It will not work if you open it from most messaging apps.`;
      warningElement.classList.add('warning');
      warningElement.id = 'tts-not-supported-warning';
      parent?.insertBefore(warningElement, parent.firstChild);
      }
      console.log("TTS not supported.");
    }



    function readText(text) {
      utterance.text = text;
      utterance.lang = lang;
      utterance.rate = .8;
      utterance.onend = () => {
        isPlaying = false; };
      window.speechSynthesis.speak(utterance);
      

    }

    function prepareLines(data, nlinevalue) {
      data.forEach(readVocab => {
        let languageSetting = readVocab.dataset.lang;
        if(languageSetting==="en-US") languageSetting = "en-CA";
        let languageSetting2 = readVocab.dataset.lang2;
        //added for backwards compatibility with old posts 
        if (!languageSetting2) {
          switch (languageSetting) {
            case "en-CA":
              languageSetting2 = "th-TH";
              break;
            case "es-MX":
              languageSetting2 = "en-CA";
            case "th-TH":
              languageSetting2 = "en-CA";
            case "de-DE":
              languageSetting2 = "en-CA";
            default:
              languageSetting2 = "en-CA"
              break;
          }
        }
        languageSetting ? lang = languageSetting : lang = "en-CA";
        languageSetting2 ? lang2 = languageSetting2 : lang2 = "en-CA";

        let content = readVocab.textContent.trim();
        content = content.replace(/([.?!])\s*(?=[A-Z])/g, '$1\n');
        const lines = content.split('\n');
        readVocab.textContent = "";
        lines.forEach(line => {
          const parts = line.split(' - ');

          const span = document.createElement('span');
          span.classList.add('read-this');
          span.dataset.lang = lang;
          span.dataset.lang2 = lang2;
          span.dataset.nline = nlinevalue;
          let partCleaned = parts[0].trimStart().trim();
          span.textContent = partCleaned;
          readVocab.appendChild(span);
        });
      })
    }

    function prepareSection(data) {
      data.forEach(readSection => {
      let languageSetting = readSection.dataset.lang;
      if(languageSetting==="en-US") languageSetting = "en-CA";
      let languageSetting2 = readSection.dataset.lang2;

      languageSetting ? lang = languageSetting : lang = "en-CA";
      languageSetting2 ? lang2 = languageSetting2 : lang2 = "en-CA";

          const span = document.createElement('span');
          span.classList.add('read-this');
          span.dataset.lang = lang;
          span.dataset.lang2 = lang2;
          span.dataset.nline = 'true';
          span.innerHTML = readSection.innerHTML;
          readSection.innerHTML = "";
          readSection.appendChild(span);
        });
      }
  

    function addHeadphones(spans){
      spans.forEach(function (span) {
        let parentText = span.innerHTML;
        let translatethis = span.innerHTML;
        let nline = span.dataset.nline;
        let parentSpan = document.createElement('span');
        let button = document.createElement('button');
        let button2 = document.createElement('button');
        button.innerHTML = '&#127911;';
        button.className = "read-button";
        if (parentText) { 
          parentSpan.innerHTML = parentText;
          span.innerHTML = "";
          span.appendChild(parentSpan);
          span.appendChild(button);}
        if (translatethis) {
          button2.innerHTML = '&#127911;';
          button2.className = "read-button";
          var translateSpan = document.createElement("span");
          if (nline=="true"){
            let lineBreak1 = document.createElement("br");
            span.appendChild(lineBreak1);
          }
          translateSpan.innerHTML = ` ${translatethis} `;
          translateSpan.setAttribute('translate', 'yes');
          translateSpan.classList.add('translated');
          span.appendChild(translateSpan);
          span.appendChild(button2);
        }
        const lineBreak = document.createElement('br');
        span.appendChild(lineBreak);
        button.addEventListener("click", function () {
          let languageSetting = span.dataset.lang;
          languageSetting ? lang = languageSetting : lang = "en-CA";
          if (isPlaying) {
            speechSynthesis.cancel();
            isPlaying = false;
          } else {
            readText(parentSpan.textContent);
            isPlaying = true;
          }
        });
        button2.addEventListener("click", function () {
          let languageSetting2 = span.dataset.lang2;
          let currentLang = document.documentElement.lang;
          // console.log(currentLang);
          if (currentLang != "auto") {
            languageSetting2 = currentLang;
          }
          
          console.log(translateSpan);
          languageSetting2 ? lang = languageSetting2 : lang = "th-TH";
          if (isPlaying) {
            speechSynthesis.cancel();
            isPlaying = false;
          } else {
            readText(translateSpan.textContent);
            isPlaying = true;
          }
        });
      })
    }

  }
}


customElements.define('read-this', ReadThis);