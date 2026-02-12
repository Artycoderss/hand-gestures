import * as THREE from 'three';

export function createHelloAnim(params) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const axisVector = (axis) => {
    if (axis === 'x') return new THREE.Vector3(1, 0, 0);
    if (axis === 'y') return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
  };

  const isValidFingerBoneName = (nameLower) => {
    const isFinger =
      nameLower.includes('thumb') ||
      nameLower.includes('index') ||
      nameLower.includes('middle') ||
      nameLower.includes('ring') ||
      nameLower.includes('pinky') ||
      nameLower.includes('finger');

    const isCtrl = nameLower.includes('ctrl');
    const isEnd = nameLower.includes('end') || nameLower.includes('tip');

    const isArm =
      nameLower.includes('wrist') ||
      nameLower.includes('hand') ||
      nameLower.includes('arm') ||
      nameLower.includes('forearm');

    return isFinger && !isCtrl && !isEnd && !isArm;
  };

  const collectFingerBonesForIdle = (skinnedMesh) => {
    const bones = skinnedMesh?.skeleton?.bones || [];
    const out = [];

    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const n = (b.name || '').toLowerCase();
      if (isValidFingerBoneName(n)) out.push(b);
    }

    out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return out;
  };

  const pickFingerRootBones = (skinnedMesh) => {
    const bones = skinnedMesh?.skeleton?.bones || [];
    const groups = { thumb: [], index: [], middle: [], ring: [], pinky: [] };

    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const n = (b.name || '').toLowerCase();

      if (isValidFingerBoneName(n)) {
        if (n.includes('thumb')) groups.thumb.push(b);
        else if (n.includes('index')) groups.index.push(b);
        else if (n.includes('middle')) groups.middle.push(b);
        else if (n.includes('ring')) groups.ring.push(b);
        else if (n.includes('pinky')) groups.pinky.push(b);
      }
    }

    const sortByName = (arr) =>
      arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const firstOrNull = (arr) => {
      const s = sortByName(arr);
      return s.length ? s[0] : null;
    };

    return [
      firstOrNull(groups.thumb),
      firstOrNull(groups.index),
      firstOrNull(groups.middle),
      firstOrNull(groups.ring),
      firstOrNull(groups.pinky),
    ].filter(Boolean);
  };

  const gatherOffsetEulerForRoot = (nameLower) => {
    if (nameLower.includes('thumb')) return new THREE.Euler(1, 1, 1, 'XYZ');
    if (nameLower.includes('index'))
      return new THREE.Euler(0, 0.26, -0.24, 'XYZ');
    if (nameLower.includes('middle'))
      return new THREE.Euler(0, 0.18, -0.1, 'XYZ');
    if (nameLower.includes('ring')) return new THREE.Euler(0, 0.18, 0.1, 'XYZ');
    if (nameLower.includes('pinky'))
      return new THREE.Euler(0, 0.35, 0.24, 'XYZ');
    return new THREE.Euler(0, 0, 0, 'XYZ');
  };

  const PALM_ON_FRAMES = params.PALM_ON_FRAMES ?? 4;
  const PALM_OFF_FRAMES = params.PALM_OFF_FRAMES ?? 6;

  const PALM_MIN_EXT = params.PALM_MIN_EXT ?? 0.75;
  const PALM_MIN_AREA = params.PALM_MIN_AREA ?? 0.00018;

  const state = {
    idleBones: [],
    idleBase: [],
    gatherRoots: [],
    gatherBaseQ: new Map(),
    gatherTargetQ: new Map(),

    waveStrength: 0,
    helloPhase: 0,
    gatherAmount: 0,
    t0: 0,

    helloAxisVec: axisVector(params.HELLO_AXIS),

    palm: { isOpen: false, onCount: 0, offCount: 0 },
  };

  const WRIST = 0;

  const INDEX_MCP = 5;
  const INDEX_PIP = 6;
  const INDEX_TIP = 8;

  const MIDDLE_MCP = 9;
  const MIDDLE_PIP = 10;
  const MIDDLE_TIP = 12;

  const RING_MCP = 13;
  const RING_PIP = 14;
  const RING_TIP = 16;

  const PINKY_MCP = 17;
  const PINKY_PIP = 18;
  const PINKY_TIP = 20;

  const dist = (a, b) => a.distanceTo(b);

  const fingerExtendScore = (lm, mcp, pip, tip) => {
    const dTip = dist(lm[WRIST], lm[tip]);
    const dPip = dist(lm[WRIST], lm[pip]);
    const dMcp = dist(lm[WRIST], lm[mcp]);

    const denom = Math.max(1e-6, dist(lm[mcp], lm[tip]));
    const raw = (dTip - dPip) / denom;

    const gate = dTip > dMcp ? 1 : 0;

    const score = clamp(raw * 1.4, 0, 1) * gate;
    return score;
  };

  const palmAreaScore = (lm) => {
    const a = lm[WRIST];
    const b = lm[INDEX_MCP];
    const c = lm[PINKY_MCP];

    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    const cross = ab.clone().cross(ac);
    const area = 0.5 * cross.length();
    return area;
  };

  const isOpenPalm = (lm) => {
    const s1 = fingerExtendScore(lm, INDEX_MCP, INDEX_PIP, INDEX_TIP);
    const s2 = fingerExtendScore(lm, MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP);
    const s3 = fingerExtendScore(lm, RING_MCP, RING_PIP, RING_TIP);
    const s4 = fingerExtendScore(lm, PINKY_MCP, PINKY_PIP, PINKY_TIP);

    const avg = (s1 + s2 + s3 + s4) / 4;
    const area = palmAreaScore(lm);

    if (area < PALM_MIN_AREA) return false;
    return avg >= PALM_MIN_EXT;
  };

  const onModelLoaded = ({ skinned }) => {
    state.idleBones = collectFingerBonesForIdle(skinned);
    state.idleBase = state.idleBones.map((b) => ({
      x: b.rotation.x,
      y: b.rotation.y,
      z: b.rotation.z,
    }));

    state.gatherRoots = pickFingerRootBones(skinned);
    state.gatherBaseQ.clear();
    state.gatherTargetQ.clear();

    const dir = params.GATHER_INVERT ? -1 : 1;

    for (let i = 0; i < state.gatherRoots.length; i += 1) {
      const b = state.gatherRoots[i];
      const n = (b.name || '').toLowerCase();

      const baseQ = b.quaternion.clone();
      state.gatherBaseQ.set(b, baseQ);

      const offE = gatherOffsetEulerForRoot(n);
      offE.x *= params.GATHER_MULT * dir;
      offE.y *= params.GATHER_MULT * dir;
      offE.z *= params.GATHER_MULT * dir;

      const offQ = new THREE.Quaternion().setFromEuler(offE);
      const targetQ = baseQ.clone().multiply(offQ);

      state.gatherTargetQ.set(b, targetQ);
    }

    state.t0 = performance.now();
    state.palm.isOpen = false;
    state.palm.onCount = 0;
    state.palm.offCount = 0;
  };

  const onMediaPipe = ({ handVisible }, { worldLandmarks, v3 }) => {
    if (!handVisible || !worldLandmarks || worldLandmarks.length !== 21) return;

    const lm = worldLandmarks.map((p) => v3(p));
    const open = isOpenPalm(lm);

    if (open) {
      state.palm.onCount += 1;
      state.palm.offCount = 0;
    } else {
      state.palm.offCount += 1;
      state.palm.onCount = 0;
    }

    if (!state.palm.isOpen && state.palm.onCount >= PALM_ON_FRAMES) {
      state.palm.isOpen = true;
    }

    if (state.palm.isOpen && state.palm.offCount >= PALM_OFF_FRAMES) {
      state.palm.isOpen = false;
    }
  };

  const update = ({ hand, baseHandQuat, handVisible }, delta) => {
    const now = performance.now();
    const helloActive = handVisible && state.palm.isOpen;

    if (handVisible && !helloActive && state.idleBones.length) {
      const tt = (now - state.t0) / 1000;

      for (let i = 0; i < state.idleBones.length; i += 1) {
        const b = state.idleBones[i];
        const base = state.idleBase[i];

        const phase = i * 0.23;
        const w = Math.sin(tt * Math.PI * 2 * params.IDLE_SPEED + phase);

        const idxInFinger = i % 4;
        const segmentMul = 1.0 - idxInFinger * 0.5;

        const target =
          base[params.IDLE_AXIS] + w * (params.IDLE_AMP * segmentMul);

        b.rotation[params.IDLE_AXIS] +=
          (target - b.rotation[params.IDLE_AXIS]) * params.IDLE_SMOOTH;

        if (params.IDLE_AXIS !== 'x')
          b.rotation.x += (base.x - b.rotation.x) * params.IDLE_SMOOTH;
        if (params.IDLE_AXIS !== 'y')
          b.rotation.y += (base.y - b.rotation.y) * params.IDLE_SMOOTH;
        if (params.IDLE_AXIS !== 'z')
          b.rotation.z += (base.z - b.rotation.z) * params.IDLE_SMOOTH;
      }
    }

    {
      const targetStrength = helloActive ? 1 : 0;
      state.waveStrength = lerp(
        state.waveStrength,
        targetStrength,
        helloActive ? 0.12 : 0.09,
      );
    }

    {
      const targetGather = helloActive ? 1 : 0;
      const speed = helloActive ? params.GATHER_IN : params.GATHER_OUT;
      state.gatherAmount = lerp(state.gatherAmount, targetGather, speed);

      const amt = clamp(state.gatherAmount, 0, 1);

      if (state.gatherRoots.length) {
        for (let i = 0; i < state.gatherRoots.length; i += 1) {
          const b = state.gatherRoots[i];
          const bq = state.gatherBaseQ.get(b);
          const tq = state.gatherTargetQ.get(b);

          if (bq && tq) {
            b.quaternion.copy(bq);
            b.quaternion.slerp(tq, amt);
          }
        }
      }
    }

    if (hand) {
      if (helloActive) {
        state.helloPhase += Math.PI * 2 * params.HELLO_HZ * delta;
        if (state.helloPhase > Math.PI * 2) state.helloPhase -= Math.PI * 2;
      }

      const maxAngle = THREE.MathUtils.degToRad(params.HELLO_DEG);
      const sway = Math.sin(state.helloPhase) * maxAngle * state.waveStrength;

      const qSway = new THREE.Quaternion().setFromAxisAngle(
        state.helloAxisVec,
        sway,
      );
      const targetQ = baseHandQuat.clone().multiply(qSway);

      const s = helloActive ? 0.16 : 0.12;

      if (helloActive) hand.quaternion.slerp(targetQ, s);
      else hand.quaternion.slerp(baseHandQuat, s);
    }
  };

  return {
    state,
    onModelLoaded,
    onMediaPipe,
    update,
  };
}
