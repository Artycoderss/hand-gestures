import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { createHelloAnim } from '../handsAnims/helloAnim';
import { createFuckAnim } from '../handsAnims/fuckAnim';
import { createThumbsUpTiltAnim } from '../handsAnims/thumbsUpTiltAnim';
import { createIndexFingerAnim } from '../handsAnims/indexFingerAnim';
import { createTwoFingersAnim } from '../handsAnims/twoFingersAnim';

let raf = 0;

export function initHandScene() {
  const canvas = document.querySelector('#hand-canvas');
  const overlayEl = document.querySelector('#fuck-overlay');

  if (!canvas) return { applyMediaPipeHand: () => {}, destroy: () => {} };

  const FPS_LIMIT = 60;
  const HAND_LOST_MS = 500;

  const HELLO_AXIS = 'z';
  const HELLO_DEG = 18;
  const HELLO_HZ = 1.15;

  const GATHER_IN = 0.16;
  const GATHER_OUT = 0.1;
  const GATHER_MULT = 1.85;
  const GATHER_INVERT = true;

  const IDLE_SPEED = 0.22;
  const IDLE_AMP = 0.07;
  const IDLE_SMOOTH = 0.08;
  const IDLE_AXIS = 'z';

  const PALM_ON_FRAMES = 4;
  const PALM_OFF_FRAMES = 6;
  const PALM_MIN_EXT = 0.75;
  const PALM_MIN_AREA = 0.00018;

  const MODE_EPS = 0.02;
  const POS_EPS = 0.002;
  const ANG_EPS = 0.02;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 0, 2.2);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(2, 2, 2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(-2, 1, 1);
  scene.add(fillLight);

  const v3 = (p) => new THREE.Vector3(p.x, p.y, p.z);

  const poseSkeletonToBind = (root) => {
    root.traverse((o) => {
      if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose();
    });
  };

  const findFirstSkinnedMesh = (root) => {
    let found = null;
    root.traverse((o) => {
      if (!found && o.isSkinnedMesh && o.skeleton) found = o;
    });
    return found;
  };

  const centerAndFitCamera = (obj, cam) => {
    obj.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());

    obj.position.sub(center);
    obj.updateMatrixWorld(true);

    const box2 = new THREE.Box3().setFromObject(obj);
    const size2 = box2.getSize(new THREE.Vector3());
    const maxDim = Math.max(size2.x, size2.y, size2.z);

    const fov = cam.fov * (Math.PI / 180);
    const dist = (maxDim * 0.5) / Math.tan(fov * 0.5);

    cam.position.set(0, 0, dist * 1.25);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  };

  const helloAnim = createHelloAnim({
    HELLO_AXIS,
    HELLO_DEG,
    HELLO_HZ,
    GATHER_IN,
    GATHER_OUT,
    GATHER_MULT,
    GATHER_INVERT,
    IDLE_SPEED,
    IDLE_AMP,
    IDLE_SMOOTH,
    IDLE_AXIS,
    PALM_ON_FRAMES,
    PALM_OFF_FRAMES,
    PALM_MIN_EXT,
    PALM_MIN_AREA,
  });

  const fuckAnim = createFuckAnim();
  const thumbsUpAnim = createThumbsUpTiltAnim();
  const indexFingerAnim = createIndexFingerAnim();
  const twoFingersAnim = createTwoFingersAnim();

  let hand = null;
  let handRig = null;
  let handPivot = null;
  let skinned = null;

  let handHomePos = null;

  const baseHandQuat = new THREE.Quaternion();
  const rigHome = new THREE.Vector3(0, 0, 0);

  let handVisible = false;
  let lastHandSeenAt = 0;

  let mode = 'hello';

  let isTransitioning = false;
  let transitionFrom = 'hello';

  const lerp = (a, b, t) => a + (b - a) * t;

  const decayState = (anim, k = 0.22) => {
    if (!anim?.state) return;
    anim.state.strength = lerp(anim.state.strength || 0, 0, k);
    if (anim.state.strength < 0.0005) anim.state.strength = 0;
  };

  const decayHello = (k = 0.22) => {
    if (!helloAnim?.state) return;
    if (typeof helloAnim.state.waveStrength === 'number') {
      helloAnim.state.waveStrength = lerp(
        helloAnim.state.waveStrength || 0,
        0,
        k,
      );
      if (helloAnim.state.waveStrength < 0.0005)
        helloAnim.state.waveStrength = 0;
    }
  };

  const quatClose = (a, b, eps = ANG_EPS) => {
    if (!a || !b) return true;
    return a.angleTo(b) <= eps;
  };

  const v3Close = (a, b, eps = POS_EPS) => {
    if (!a || !b) return true;
    return a.distanceTo(b) <= eps;
  };

  const isBackToBase = () => {
    const pivotOk = quatClose(handPivot?.quaternion, baseHandQuat, ANG_EPS);
    const rigOk = v3Close(handRig?.position, rigHome, POS_EPS);
    const handOk = v3Close(hand?.position, handHomePos, POS_EPS);
    return pivotOk && rigOk && handOk;
  };

  const resetHelloDetector = () => {
    if (!helloAnim?.state) return;
    if (helloAnim.state.palm) {
      helloAnim.state.palm.isOpen = false;
      helloAnim.state.palm.onCount = 0;
      helloAnim.state.palm.offCount = 0;
    }
  };

  const forceAnimExit = (m) => {
    if (m === 'thumbs') {
      if (thumbsUpAnim?.state) {
        thumbsUpAnim.state.active = false;
        thumbsUpAnim.state.onCount = 0;
        thumbsUpAnim.state.offCount = 0;
      }
    }

    if (m === 'index') {
      if (indexFingerAnim?.state) {
        indexFingerAnim.state.active = false;
        indexFingerAnim.state.onCount = 0;
        indexFingerAnim.state.offCount = 0;
      }
    }

    if (m === 'two') {
      if (twoFingersAnim?.state) {
        twoFingersAnim.state.active = false;
        twoFingersAnim.state.onCount = 0;
        twoFingersAnim.state.offCount = 0;
      }
    }

    if (m === 'fuck') {
      if (fuckAnim?.state) {
        fuckAnim.state.desiredActive = false;
        fuckAnim.state.onCount = 0;
        fuckAnim.state.offCount = 0;
      }
    }

    if (m === 'hello') resetHelloDetector();
  };

  const getStrengthByMode = (m) => {
    if (m === 'fuck') return fuckAnim?.state?.strength || 0;
    if (m === 'thumbs') return thumbsUpAnim?.state?.strength || 0;
    if (m === 'index') return indexFingerAnim?.state?.strength || 0;
    if (m === 'two') return twoFingersAnim?.state?.strength || 0;
    return helloAnim?.state?.waveStrength || 0;
  };

  const getWantedMode = () => {
    const fuckWanted = handVisible && (fuckAnim?.state?.strength || 0) > 0.001;

    const thumbsWanted =
      handVisible &&
      (thumbsUpAnim?.state?.active ||
        (thumbsUpAnim?.state?.strength || 0) > 0.02);

    const indexWanted =
      handVisible &&
      (indexFingerAnim?.state?.active ||
        (indexFingerAnim?.state?.strength || 0) > 0.02);

    const twoWanted =
      handVisible &&
      (twoFingersAnim?.state?.active ||
        (twoFingersAnim?.state?.strength || 0) > 0.02);

    let next = 'hello';
    if (fuckWanted) next = 'fuck';
    else if (thumbsWanted) next = 'thumbs';
    else if (twoWanted) next = 'two';
    else if (indexWanted) next = 'index';

    return next;
  };

  const applyMediaPipeHand = (worldLandmarks) => {
    if (!worldLandmarks || worldLandmarks.length !== 21) return;

    const t = performance.now();
    handVisible = true;
    lastHandSeenAt = t;

    fuckAnim.onMediaPipe({ handVisible }, { worldLandmarks, v3 });
    helloAnim.onMediaPipe({ handVisible }, { worldLandmarks, v3 });
    thumbsUpAnim.onMediaPipe({ handVisible }, { worldLandmarks });
    indexFingerAnim.onMediaPipe({ handVisible }, { worldLandmarks });
    twoFingersAnim.onMediaPipe({ handVisible }, { worldLandmarks });
  };

  const logAllBones = (skinnedMesh) => {
    const bones = skinnedMesh?.skeleton?.bones || [];
    console.log(`=== ALL BONES (${bones.length}) ===`);

    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const parentName = b?.parent?.isBone ? b.parent.name : '';
      const childCount = b?.children
        ? b.children.filter((c) => c && c.isBone).length
        : 0;

      console.log(
        `[${i}] ${b?.name || ''} | parent: ${parentName} | boneChildren: ${childCount}`,
      );
    }

    console.log('=== END BONES ===');
  };

  const loader = new GLTFLoader();
  loader.load(
    '/models/hand.glb',
    (gltf) => {
      hand = gltf.scene;

      handRig = new THREE.Group();
      handPivot = new THREE.Group();

      scene.add(handRig);
      handRig.add(handPivot);
      handPivot.add(hand);

      poseSkeletonToBind(hand);

      hand.rotation.set(0, Math.PI * 0.5, 0);
      hand.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -Math.PI * 0.5);

      skinned = findFirstSkinnedMesh(hand);

      helloAnim.onModelLoaded({ skinned });
      fuckAnim.onModelLoaded({ skinned });
      thumbsUpAnim.onModelLoaded({ skinned });
      indexFingerAnim.onModelLoaded?.({ skinned });
      twoFingersAnim.onModelLoaded?.({ skinned });

      logAllBones(skinned);

      hand.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(hand);
      const min = box.min.clone();
      const centerX = (box.min.x + box.max.x) * 0.5;
      const centerZ = (box.min.z + box.max.z) * 0.5;

      hand.position.x -= centerX;
      hand.position.y -= min.y;
      hand.position.z -= centerZ;

      hand.updateMatrixWorld(true);

      handHomePos = hand.position.clone();

      centerAndFitCamera(handPivot, camera);

      baseHandQuat.copy(handPivot.quaternion);
    },
    undefined,
    (err) => console.error('Failed to load hand.glb', err),
  );

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  window.addEventListener('resize', resize);
  resize();

  const update = (delta) => {
    const now = performance.now();

    if (handVisible && now - lastHandSeenAt > HAND_LOST_MS) {
      handVisible = false;
      resetHelloDetector();
    }

    const pivot = handPivot;
    const rig = handRig;
    const targetObj = handPivot;

    const returnK = handVisible ? 0.18 : 0.28;

    if (rig) {
      if (mode !== 'thumbs' || !handVisible) {
        rig.position.lerp(rigHome, returnK);
      }
    }

    if (hand && handHomePos) {
      if (mode !== 'thumbs' || !handVisible) {
        hand.position.lerp(handHomePos, returnK);
      }
    }

    const wantedMode = getWantedMode();

    if (!isTransitioning && wantedMode !== mode) {
      isTransitioning = true;
      transitionFrom = mode;
      forceAnimExit(transitionFrom);
    }

    if (isTransitioning) {
      const exitHandVisible = false;

      decayState(thumbsUpAnim);
      decayState(indexFingerAnim);
      decayState(twoFingersAnim);
      decayState(fuckAnim);
      decayHello(0.22);

      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: exitHandVisible },
        delta,
      );

      thumbsUpAnim.update({
        pivot,
        rig,
        model: hand,
        basePivotQuat: baseHandQuat,
        handVisible: exitHandVisible,
      });

      indexFingerAnim.update({
        pivot,
        basePivotQuat: baseHandQuat,
        model: hand,
        handVisible: exitHandVisible,
      });

      twoFingersAnim.update({
        pivot: handPivot,
        model: hand,
        basePivotQuat: baseHandQuat,
        handVisible: exitHandVisible,
      });

      fuckAnim.update({
        hand: targetObj,
        baseHandQuat,
        handVisible: exitHandVisible,
      });

      const s = getStrengthByMode(transitionFrom);
      const done = s <= MODE_EPS && isBackToBase();

      if (done) {
        isTransitioning = false;

        const freshWanted = getWantedMode();
        mode = freshWanted;

        if (!handVisible) {
          mode = 'hello';
          resetHelloDetector();
        }
      }

      if (overlayEl) {
        overlayEl.classList.remove('is-active');
        overlayEl.style.opacity = '0';
      }

      return;
    }

    mode = wantedMode;

    if (mode === 'fuck') {
      decayState(thumbsUpAnim);
      decayState(indexFingerAnim);
      decayState(twoFingersAnim);

      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: false },
        delta,
      );
      fuckAnim.update({ hand: targetObj, baseHandQuat, handVisible: true });

      if (overlayEl) {
        const s = fuckAnim?.state?.strength || 0;
        overlayEl.classList.toggle('is-active', s > 0.15);
        overlayEl.style.opacity = String(Math.min(1, s));
      }

      return;
    }

    if (mode === 'thumbs') {
      decayState(indexFingerAnim);
      decayState(twoFingersAnim);
      decayState(fuckAnim);

      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: false },
        delta,
      );

      thumbsUpAnim.update({
        pivot,
        rig,
        model: hand,
        basePivotQuat: baseHandQuat,
        handVisible,
      });

      return;
    }

    if (mode === 'index') {
      decayState(thumbsUpAnim);
      decayState(twoFingersAnim);
      decayState(fuckAnim);

      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: false },
        delta,
      );

      indexFingerAnim.update({
        pivot,
        basePivotQuat: baseHandQuat,
        model: hand,
        handVisible,
      });

      return;
    }

    if (mode === 'two') {
      decayState(thumbsUpAnim);
      decayState(indexFingerAnim);
      decayState(fuckAnim);

      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: false },
        delta,
      );

      twoFingersAnim.update({
        pivot: handPivot,
        model: hand,
        basePivotQuat: baseHandQuat,
        handVisible,
      });

      return;
    }

    decayState(thumbsUpAnim);
    decayState(indexFingerAnim);
    decayState(twoFingersAnim);

    if (!handVisible) {
      decayHello(0.22);
      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: false },
        delta,
      );
    } else {
      helloAnim.update(
        { hand: targetObj, baseHandQuat, handVisible: true },
        delta,
      );
    }

    fuckAnim.update({ hand: targetObj, baseHandQuat, handVisible });

    if (overlayEl) {
      const s = fuckAnim?.state?.strength || 0;
      overlayEl.classList.toggle('is-active', s > 0.15);
      overlayEl.style.opacity = String(Math.min(1, s));
    }
  };

  let lastTime = performance.now();
  let acc = 0;
  const stepMs = FPS_LIMIT > 0 ? 1000 / FPS_LIMIT : 0;

  const loop = () => {
    const now = performance.now();
    const frameMs = now - lastTime;
    lastTime = now;

    if (FPS_LIMIT > 0) {
      acc += frameMs;
      if (acc > 250) acc = 250;

      while (acc >= stepMs) {
        update(stepMs / 1000);
        acc -= stepMs;
      }
    } else {
      update(frameMs / 1000);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };

  loop();

  return {
    applyMediaPipeHand,
    destroy: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
