export function setupVh() {
  const root = document.documentElement;
  const vv = window.visualViewport;

  const measure = () => {
    const inner = window.innerHeight;
    const visual = vv ? Math.round(vv.height) : inner;
    const large = Math.max(
      Math.round(window.screen.height || 0),
      Math.round(inner || 0),
      Math.round(visual || 0),
      Math.round(document.documentElement.clientHeight || 0),
    );

    return { svh: visual, dvh: inner, lvh: large, inner };
  };

  const apply = () => {
    const { svh, dvh, lvh, inner } = measure();

    root.style.setProperty('--svh', `${svh}px`);
    root.style.setProperty('--dvh', `${dvh}px`);
    root.style.setProperty('--lvh', `${lvh}px`);
    root.style.setProperty('--inner-vh', `${inner}px`);
  };

  apply();
}
