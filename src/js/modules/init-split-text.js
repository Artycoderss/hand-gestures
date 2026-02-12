import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

export default function initSplitText() {
  function splitTextOnce(selector, options) {
    document.querySelectorAll(selector).forEach((element) => {
      if (!element.dataset.splitApplied) {
        const split = new SplitText(element, options);
        const newElement = element; // ✅ Создаем новую переменную
        newElement.dataset.splitApplied = 'true';
        newElement.splitInstance = split; // ✅ Убираем `_`
      }
    });
  }

  return new Promise((resolve, reject) => {
    try {
      splitTextOnce('[text-split]', {
        type: 'words, chars',
        wordsClass: 'word',
        charsClass: 'char',
      });

      splitTextOnce('[word-split]', {
        type: 'lines, words',
        linesClass: 'line',
        wordsClass: 'word',
      });

      splitTextOnce('[line-split]', {
        type: 'lines',
        linesClass: 'line',
      });

      splitTextOnce('[line-split-nested] > p', {
        type: 'lines,words',
        linesClass: 'line-wrap',
        wordsClass: 'word',
      });

      splitTextOnce('[line-split-nested-all]', {
        type: 'lines,words',
        linesClass: 'line-wrap',
        wordsClass: 'word',
      });

      splitTextOnce('[line-wrap-split], .line-wrap-split', {
        type: 'lines, words',
        linesClass: 'line-wrap',
      });

      document.querySelectorAll('.line-wrap').forEach((line) => {
        if (!line.dataset.wrapped) {
          const lineContent = line.innerHTML;
          line.innerHTML = `<span class="line" style="display: block;">${lineContent}</span>`;
          line.dataset.wrapped = 'true';
        }
      });

      document.querySelectorAll('.spacer').forEach((spacer) => {
        const parentLine = spacer.closest('.line');
        if (parentLine) {
          parentLine.prepend(spacer);
        }
      });

      resolve();
    } catch (error) {
      console.error('Error in initSplitText:', error);
      reject(error);
    }
  });
}
