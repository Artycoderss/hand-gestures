import * as THREE from 'three';

export function createFuckAnim(params = {}) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const degToRad = (d) => (d * Math.PI) / 180;

  const getAxisVecFromKey = (axisKey) => {
    if (axisKey === 'y') return new THREE.Vector3(0, 1, 0);
    if (axisKey === 'z') return new THREE.Vector3(0, 0, 1);
    return new THREE.Vector3(1, 0, 0);
  };

  const axisVec = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  const ON_FRAMES = params.ON_FRAMES ?? 4;
  const OFF_FRAMES = params.OFF_FRAMES ?? 8;

  const IN = params.IN ?? 0.34;
  const OUT = params.OUT ?? 0.22;

  const SLERP = params.SLERP ?? 0.28;

  const FLIP_AXIS = params.AXIS ?? new THREE.Vector3(0, 1, 0);
  const FLIP_RAD = params.RAD ?? Math.PI * 1.48;

  const TILT_AXIS = params.TILT_AXIS ?? 'x';
  const TILT_AXIS_VEC = getAxisVecFromKey(TILT_AXIS);
  const TILT_RAD = params.TILT_RAD ?? -1;

  const COMP_AXIS = params.COMP_AXIS ?? 'z';
  const COMP_AXIS_VEC = getAxisVecFromKey(COMP_AXIS);
  const COMP_RAD = params.COMP_RAD ?? degToRad(-50);

  const POS_AXIS = params.POS_AXIS ?? 'y';
  const POS_AXIS_VEC = getAxisVecFromKey(POS_AXIS);
  const POS_OFFSET = params.POS_OFFSET ?? 0.2;
  const POS_IN = params.POS_IN ?? 0.25;
  const POS_OUT = params.POS_OUT ?? 0.18;

  const FINGER_CONFIG = params.FINGER_CONFIG ?? {
    index: {
      axes: {
        z: [80, 90, 15],
        y: [-5, 0, 0],
        x: [0, -5, 0],
      },
    },
    middle: {
      axes: {
        z: [80, 0, 0],
        y: [0, 0, 0],
        x: [0, 0, 0],
      },
    },
    ring: {
      axes: {
        z: [90, 90, 15],
        y: [5, 0, 0],
        x: [0, 0, 0],
      },
    },
    pinky: {
      axes: {
        z: [90, 90, 15],
        y: [0, 0, 0],
        x: [25, 0, 0],
      },
    },
  };

  const state = {
    desiredActive: false,
    isActive: false,
    onCount: 0,
    offCount: 0,
    strength: 0,
    ready: false,
    curlBones: [],
    curlBaseQ: new Map(),
    curlTargetQ: new Map(),
    posAmt: 0,
    baseHandPos: null,
  };

  const isFingerExtended = (lm, tip, pip) => lm[tip].y < lm[pip].y;

  const detectMiddleFinger = (lm) => {
    const middleUp = isFingerExtended(lm, 12, 10);
    const indexDown = !isFingerExtended(lm, 8, 6);
    const ringDown = !isFingerExtended(lm, 16, 14);
    const pinkyDown = !isFingerExtended(lm, 20, 18);
    return middleUp && indexDown && ringDown && pinkyDown;
  };

  const isArmOrHandBone = (nameLower) =>
    nameLower.includes('wrist') ||
    nameLower.includes('hand') ||
    nameLower.includes('palm') ||
    nameLower.includes('arm') ||
    nameLower.includes('forearm');

  const isBadBone = (nameLower) => {
    const isCtrl = nameLower.includes('ctrl');
    const isEnd = nameLower.includes('end') || nameLower.includes('tip');
    return isCtrl || isEnd || isArmOrHandBone(nameLower);
  };

  const getFingerKey = (nameLower) => {
    if (nameLower.includes('thumb')) return 'thumb';
    if (nameLower.includes('index')) return 'index';
    if (nameLower.includes('middle')) return 'middle';
    if (nameLower.includes('ring')) return 'ring';
    if (nameLower.includes('pinky')) return 'pinky';
    return '';
  };

  const onModelLoaded = ({ skinned }) => {
    const bones = skinned?.skeleton?.bones || [];

    state.curlBones = [];
    state.curlBaseQ.clear();
    state.curlTargetQ.clear();
    state.ready = false;

    const groups = { index: [], ring: [], pinky: [], middle: [] };

    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const n = (b.name || '').toLowerCase();

      if (n) {
        const finger = getFingerKey(n);
        const allowed =
          finger === 'index' ||
          finger === 'ring' ||
          finger === 'pinky' ||
          finger === 'middle';

        if (allowed && !isBadBone(n)) {
          groups[finger].push(b);
        }
      }
    }

    const sortByName = (arr) =>
      arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const addFinger = (arr, fingerKey) => {
      const cfg = FINGER_CONFIG[fingerKey];
      if (!cfg) return;

      const sorted = sortByName(arr);
      const count = Math.max(0, Math.min(3, sorted.length));
      const picked = sorted.slice(0, count);

      for (let j = 0; j < picked.length; j += 1) {
        const bone = picked[j];
        const baseQ = bone.quaternion.clone();
        state.curlBaseQ.set(bone, baseQ);

        const seg = Math.min(2, j);
        const targetQ = baseQ.clone();

        const axes = cfg.axes || {};
        Object.keys(axes).forEach((axisKey) => {
          const arrDeg = axes[axisKey];
          const deg = arrDeg?.[seg] ?? 0;
          if (!deg) return;

          const vec = axisVec[axisKey] || axisVec.x;
          const q = new THREE.Quaternion().setFromAxisAngle(vec, degToRad(deg));
          targetQ.multiply(q);
        });

        state.curlTargetQ.set(bone, targetQ);
        state.curlBones.push(bone);
      }
    };

    addFinger(groups.index, 'index');
    addFinger(groups.ring, 'ring');
    addFinger(groups.pinky, 'pinky');
    addFinger(groups.middle, 'middle');

    state.curlBones.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    state.ready = true;
  };

  const onMediaPipe = ({ handVisible }, { worldLandmarks, v3 }) => {
    if (!handVisible || !worldLandmarks || worldLandmarks.length !== 21) {
      state.desiredActive = false;
      state.onCount = 0;
      state.offCount = 0;
      return;
    }

    const lm = worldLandmarks.map((p) => v3(p));
    const ok = detectMiddleFinger(lm);

    if (ok) {
      state.onCount += 1;
      state.offCount = 0;
    } else {
      state.offCount += 1;
      state.onCount = 0;
    }

    if (!state.desiredActive) {
      if (state.onCount >= ON_FRAMES) state.desiredActive = true;
    } else if (state.offCount >= OFF_FRAMES) {
      state.desiredActive = false;
    }
  };

  const applyHandRotationAndTilt = ({ hand, baseHandQuat }) => {
    const qFlip = new THREE.Quaternion().setFromAxisAngle(
      FLIP_AXIS,
      FLIP_RAD * state.strength,
    );

    const qTilt = new THREE.Quaternion().setFromAxisAngle(
      TILT_AXIS_VEC,
      TILT_RAD * state.strength,
    );

    const qComp = new THREE.Quaternion().setFromAxisAngle(
      COMP_AXIS_VEC,
      COMP_RAD * state.strength,
    );

    const targetQ = baseHandQuat
      .clone()
      .multiply(qFlip)
      .multiply(qTilt)
      .multiply(qComp);

    hand.quaternion.slerp(targetQ, SLERP);
  };

  const applyCurl = () => {
    if (!state.ready) return;
    if (!state.curlBones.length) return;

    const amt = state.strength;

    for (let i = 0; i < state.curlBones.length; i += 1) {
      const b = state.curlBones[i];
      const bq = state.curlBaseQ.get(b);
      const tq = state.curlTargetQ.get(b);

      if (bq && tq) {
        b.quaternion.copy(bq);
        b.quaternion.slerp(tq, amt);
      }
    }
  };

  const update = ({ hand, baseHandQuat, handVisible }) => {
    if (!hand) return;

    if (!state.baseHandPos) state.baseHandPos = hand.position.clone();

    const activeNow = Boolean(handVisible && state.desiredActive);
    const target = activeNow ? 1 : 0;

    state.strength = lerp(state.strength, target, activeNow ? IN : OUT);

    if (state.strength < 0.0001) state.strength = 0;
    if (state.strength > 0.9999) state.strength = 1;

    state.isActive = state.strength > 0;

    if (state.strength > 0) {
      applyHandRotationAndTilt({ hand, baseHandQuat });
      applyCurl();
    }

    const posTarget = activeNow ? 1 : 0;
    state.posAmt = lerp(state.posAmt, posTarget, activeNow ? POS_IN : POS_OUT);

    if (state.posAmt < 0.0001) state.posAmt = 0;
    if (state.posAmt > 0.9999) state.posAmt = 1;

    if (state.baseHandPos) {
      hand.position.copy(state.baseHandPos);
      hand.position.addScaledVector(POS_AXIS_VEC, POS_OFFSET * state.posAmt);
    }
  };

  return {
    state,
    onModelLoaded,
    onMediaPipe,
    update,
  };
}
