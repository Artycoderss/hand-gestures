import gsap from 'gsap';
import Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Fancybox } from '@fancyapps/ui';
import '@fancyapps/ui/dist/fancybox/fancybox.css';
import { setupVh } from '../utils/setupVH';
import { resize } from '../utils/resize';

gsap.registerPlugin(ScrollTrigger, SplitText);

export default function common() {
  setupVh();
  resize();

  const lenis = new Lenis({
    lerp: 0.1,
    smooth: true,
    smoothTouch: false,
  });

  Fancybox.bind('[data-fancybox]', {
    dragToClose: false,
    closeButton: false,
  });
  window.lenis = lenis;

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }

  requestAnimationFrame(raf);

  lenis.on('scroll', () => {
    ScrollTrigger.update();
  });

  const stopScroll = document.querySelectorAll('[data-stop-scroll]');
  const startScroll = document.querySelectorAll('[data-start-scroll]');

  stopScroll.forEach((item) => {
    item.addEventListener('click', () => {
      lenis.stop();
    });
  });

  startScroll.forEach((item) => {
    item.addEventListener('click', () => {
      lenis.start();
    });
  });

  // header
}
