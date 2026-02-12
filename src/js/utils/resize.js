export function resize() {
  const mq = window.matchMedia(`(min-width: 768px)`);
  let prev = mq.matches;

  const handle = (e) => {
    if (e.matches !== prev) {
      prev = e.matches;
      window.location.reload();
    }
  };

  mq.addEventListener('change', handle);
}
