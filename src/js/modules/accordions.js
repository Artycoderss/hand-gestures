import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export  function accordion() {
  const accordionItems = document.querySelectorAll('.faq-card');

  accordionItems.forEach((card) => {
    card.addEventListener('click', () => {
      const isActive = card.classList.contains('active');

      accordionItems.forEach((c) => {
        if (c.classList.contains('active')) {
          c.classList.remove('active');
          gsap.to(c.querySelector('.faq-card__body'), {
            height: 0,
            duration: 0.5,
            onComplete: () => {
              ScrollTrigger.refresh();
            },
          });
        }
      });

      if (!isActive) {
        const body = card.querySelector('.faq-card__body');
        card.classList.add('active');
        gsap.set(body, { height: 'auto' });
        const targetHeight = body.offsetHeight;

        gsap.fromTo(
          body,
          { height: 0 },
          {
            height: targetHeight,
            duration: 0.5,
            onUpdate: () => {
              ScrollTrigger.refresh();
            },
            onComplete: () => {
              ScrollTrigger.refresh();
            },
          },
        );
      }
    });
  });
}
