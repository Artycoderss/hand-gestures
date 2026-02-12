import '../styles/index.scss';
import { initHandScene } from '@/js/modules/hand-scene';
import { initMediaPipeHand } from '@/js/modules/mediapipe-hand';
import common from './modules/common';
import simpleLoader from './modules/loader';

common();
simpleLoader();

const sections = [];

window.addEventListener('onLoaderLoaded', () => {
  sections.forEach((section) => section());
});
window.addEventListener('onLoaderLoaded', async () => {
  const handApi = initHandScene();

  initMediaPipeHand({
    onResults: (res) => {
      const lm = res?.worldLandmarks?.[0];
      if (lm) handApi.applyMediaPipeHand(lm);
    },
  });
});
