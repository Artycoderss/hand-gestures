import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

let landmarker = null;
let stream = null;
let raf = 0;

export async function initMediaPipeHand({
  videoId = 'mp-video',
  maxHands = 1,
  onResults = () => {},
} = {}) {
  const video = document.getElementById(videoId);
  if (!video) throw new Error(`Video #${videoId} not found`);

  // 1) Камера
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();

  // 2) WASM + landmarker
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/models/hand_landmarker.task', // <-- твій public/models/
    },
    numHands: maxHands,
    runningMode: 'VIDEO',
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.45,
  });

  // 3) Луп
  let lastVideoTime = -1;

  const loop = () => {
    if (!landmarker) return;

    if (video.currentTime !== lastVideoTime) {
      const nowMs = performance.now();
      const res = landmarker.detectForVideo(video, nowMs);
      onResults(res);
      lastVideoTime = video.currentTime;
    }

    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);

  // cleanup
  return () => {
    cancelAnimationFrame(raf);

    if (landmarker?.close) landmarker.close();
    landmarker = null;

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    video.pause();
    video.srcObject = null;
  };
}
