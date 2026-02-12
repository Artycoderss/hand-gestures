import initSplitText from './init-split-text';

export default function simpleLoader() {
  const loader = document.getElementById('loader');

  async function waitForFonts() {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.warn('Помилка при завантаженні шрифтів:', error);
    }
  }

  async function simulateLoading() {
    try {
      await waitForFonts();
      await initSplitText();

      loader.classList.add('loading-ended');

      requestAnimationFrame(() => {
        loader.classList.add('loaded');
        document.body.classList.add('loaded');

        const onLoaderLoaded = new CustomEvent('onLoaderLoaded');
        window.dispatchEvent(onLoaderLoaded);
      });
    } catch (error) {
      console.error('Помилка під час завантаження:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', simulateLoading);
}
