import * as THREE from 'three';

const ON_FRAMES = 4;
const OFF_FRAMES = 7;

const MIN_PALM = 0.02;
const THUMB_EXT_MIN = 0.55;
const CURLED_BIAS = 0.02;

const INDEX_EXT_MIN = 0.55;

const ATTACK = 0.06;
const RELEASE = 0.045;

const POSE_LERP = 0.18;

const HAND_SHIFT = new THREE.Vector3(0, 0, 0);

const FINGER_CONFIG = {
  thumb: { axes: { z: [15, 45, 65], y: [-20, -5, 0], x: [0, 0, 0] } },
  index: { axes: { z: [0, 0, 0], y: [0, 0, 0], x: [0, 0, 0] } },
  middle: { axes: { z: [70, 80, 50], y: [0, 0, 0], x: [0, 0, 0] } },
  ring: { axes: { z: [70, 80, 50], y: [0, 0, 0], x: [0, 0, 0] } },
  pinky: { axes: { z: [70, 80, 30], y: [20, 0, 0], x: [0, 0, 0] } },
};

export function createIndexFingerAnim() {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const toV3 = (p) => new THREE.Vector3(p.x, p.y, p.z);
  const dist = (a, b) => a.distanceTo(b);
  const degToRad = (d) => (d * Math.PI) / 180;

  const WRIST = 0;

  const THUMB_MCP = 2;
  const THUMB_IP = 3;
  const THUMB_TIP = 4;

  const INDEX_MCP = 5;
  const INDEX_PIP = 6;
  const INDEX_TIP = 8;

  const MIDDLE_PIP = 10;
  const MIDDLE_TIP = 12;

  const RING_PIP = 14;
  const RING_TIP = 16;

  const PINKY_PIP = 18;
  const PINKY_TIP = 20;

  const axisVec = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };

  const buildQuatXYZ = (xDeg, yDeg, zDeg) => {
    const qx = new THREE.Quaternion().setFromAxisAngle(
      axisVec.x,
      degToRad(xDeg),
    );
    const qy = new THREE.Quaternion().setFromAxisAngle(
      axisVec.y,
      degToRad(yDeg),
    );
    const qz = new THREE.Quaternion().setFromAxisAngle(
      axisVec.z,
      degToRad(zDeg),
    );
    return new THREE.Quaternion().copy(qy).multiply(qz).multiply(qx);
  };

  const eul = new THREE.Euler();
  const getUprightQuatFromBase = (q) => {
    eul.setFromQuaternion(q, 'YXZ');
    eul.x = 0;
    eul.z = 0;
    return new THREE.Quaternion().setFromEuler(eul);
  };

  const state = {
    strength: 0,
    active: false,
    onCount: 0,
    offCount: 0,

    basePos: new THREE.Vector3(),
    hasBasePos: false,

    bones: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
    baseQ: new Map(),
    targetQ: new Map(),
    ready: false,
  };

  const isBadBoneName = (n) => {
    if (!n) return true;

    const isCtrl = n.includes('ctrl');
    const isEnd = n.includes('end');
    const isBase = n.includes('_base') || n.endsWith('base');
    const isArm =
      n.includes('wrist') ||
      n.includes('hand') ||
      n.includes('palm') ||
      n.includes('arm') ||
      n.includes('forearm');

    return isCtrl || isEnd || isBase || isArm;
  };

  const matchSeg = (nameLower, finger, segNum) => {
    if (isBadBoneName(nameLower)) return false;
    if (!nameLower.includes(`${finger}_`)) return false;
    if (!nameLower.includes(`_0${segNum}r_`)) return false;
    return true;
  };

  const matchTip = (nameLower, finger) => {
    if (!nameLower) return false;
    if (nameLower.includes('end')) return false;
    return nameLower.includes(`${finger}_tipr_`);
  };

  const findBone = (bones, pred) => {
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i];
      const n = (b.name || '').toLowerCase();
      if (pred(n)) return b;
    }
    return null;
  };

  const collectFingerBones = (skinnedMesh) => {
    const bones = skinnedMesh?.skeleton?.bones || [];

    const mk = (finger) => {
      const b01 = findBone(bones, (n) => matchSeg(n, finger, '1'));
      const b02 = findBone(bones, (n) => matchSeg(n, finger, '2'));
      const b03 = findBone(bones, (n) => matchSeg(n, finger, '3'));
      const tip = findBone(bones, (n) => matchTip(n, finger));

      const arr = [];
      if (b01) arr.push(b01);
      if (b02) arr.push(b02);
      if (b03) arr.push(b03);
      if (tip) arr.push(tip);
      return arr;
    };

    return {
      thumb: mk('thumb'),
      index: mk('index'),
      middle: mk('middle'),
      ring: mk('ring'),
      pinky: mk('pinky'),
    };
  };

  const rebuildTargets = () => {
    state.targetQ.clear();

    const keys = ['thumb', 'index', 'middle', 'ring', 'pinky'];

    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      const conf = FINGER_CONFIG[key];
      const bones = state.bones[key] || [];

      if (conf && conf.axes && bones.length) {
        for (let i = 0; i < bones.length; i += 1) {
          const b = bones[i];
          const bq = state.baseQ.get(b);

          if (bq) {
            const isTip = i === 3;
            const seg = isTip ? 2 : i;
            const mul = isTip ? 0.9 : 1;

            const tx = conf.axes.x?.[seg] ?? 0;
            const ty = conf.axes.y?.[seg] ?? 0;
            const tz = conf.axes.z?.[seg] ?? 0;

            const tq = bq.clone();

            if (tx) {
              tq.multiply(
                new THREE.Quaternion().setFromAxisAngle(
                  axisVec.x,
                  degToRad(tx * mul),
                ),
              );
            }
            if (ty) {
              tq.multiply(
                new THREE.Quaternion().setFromAxisAngle(
                  axisVec.y,
                  degToRad(ty * mul),
                ),
              );
            }
            if (tz) {
              tq.multiply(
                new THREE.Quaternion().setFromAxisAngle(
                  axisVec.z,
                  degToRad(tz * mul),
                ),
              );
            }

            state.targetQ.set(b, tq);
          }
        }
      }
    }
  };

  const onModelLoaded = ({ skinned }) => {
    state.strength = 0;
    state.active = false;
    state.onCount = 0;
    state.offCount = 0;

    state.bones = collectFingerBones(skinned);
    state.baseQ.clear();
    state.targetQ.clear();
    state.ready = false;

    const keys = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      const arr = state.bones[key] || [];
      for (let i = 0; i < arr.length; i += 1) {
        const b = arr[i];
        state.baseQ.set(b, b.quaternion.clone());
      }
    }

    rebuildTargets();

    state.hasBasePos = false;
    state.ready = true;
  };

  const isCurled = (lm, tip, pip, norm) => {
    const dTip = dist(lm[WRIST], lm[tip]) / norm;
    const dPip = dist(lm[WRIST], lm[pip]) / norm;
    return dTip < dPip + CURLED_BIAS;
  };

  const isExtended = (lm, tip, pip, norm) => {
    const dTip = dist(lm[WRIST], lm[tip]) / norm;
    const dPip = dist(lm[WRIST], lm[pip]) / norm;
    return dTip > dPip + INDEX_EXT_MIN;
  };

  const thumbExtendScore = (lm, norm) => {
    const dTip = dist(lm[WRIST], lm[THUMB_TIP]) / norm;
    const dIp = dist(lm[WRIST], lm[THUMB_IP]) / norm;
    const dMcp = dist(lm[WRIST], lm[THUMB_MCP]) / norm;

    const gate = dTip > dIp && dTip > dMcp ? 1 : 0;
    const raw = dTip - dIp;

    return clamp(raw * 1.6, 0, 1) * gate;
  };

  const isIndexUp = (lm) => {
    const norm = Math.max(MIN_PALM, dist(lm[INDEX_MCP], lm[17]));

    const indexUp = isExtended(lm, INDEX_TIP, INDEX_PIP, norm);

    const curledMiddle = isCurled(lm, MIDDLE_TIP, MIDDLE_PIP, norm);
    const curledRing = isCurled(lm, RING_TIP, RING_PIP, norm);
    const curledPinky = isCurled(lm, PINKY_TIP, PINKY_PIP, norm);

    const thumbScore = thumbExtendScore(lm, norm);
    const notThumbs = thumbScore < THUMB_EXT_MIN;

    return indexUp && curledMiddle && curledRing && curledPinky && notThumbs;
  };

  const onMediaPipe = ({ handVisible }, { worldLandmarks }) => {
    if (!(handVisible && worldLandmarks && worldLandmarks.length === 21))
      return;

    const lm = worldLandmarks.map(toV3);
    const ok = isIndexUp(lm);

    if (ok) {
      state.onCount += 1;
      state.offCount = 0;
    } else {
      state.offCount += 1;
      state.onCount = 0;
    }

    if (!state.active && state.onCount >= ON_FRAMES) state.active = true;
    if (state.active && state.offCount >= OFF_FRAMES) state.active = false;
  };

  const applyFingerPose = (amt) => {
    if (!state.ready) return;

    const keys = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (let k = 0; k < keys.length; k += 1) {
      const key = keys[k];
      const bones = state.bones[key] || [];

      for (let i = 0; i < bones.length; i += 1) {
        const b = bones[i];
        const bq = state.baseQ.get(b);
        const tq = state.targetQ.get(b);

        if (bq && tq) {
          b.quaternion.copy(bq);
          b.quaternion.slerp(tq, amt);
        }
      }
    }
  };

  const update = ({ pivot, model, basePivotQuat, handVisible }) => {
    if (!pivot || !model) return;

    const target = handVisible && state.active ? 1 : 0;
    const k = target > 0 ? ATTACK : RELEASE;

    state.strength = lerp(state.strength, target, k);
    const amtRaw = clamp(state.strength, 0, 1);
    const amt = smoothstep(amtRaw);

    const uprightBase = getUprightQuatFromBase(basePivotQuat);

    const aestheticQ = buildQuatXYZ(0, 0, 0);
    const desired = uprightBase.clone().multiply(aestheticQ);

    const finalQ = uprightBase.clone().slerp(desired, amt);
    pivot.quaternion.slerp(finalQ, POSE_LERP);

    if (!state.hasBasePos) {
      state.basePos.copy(model.position);
      state.hasBasePos = true;
    }

    const targetPos = state.basePos.clone().addScaledVector(HAND_SHIFT, amt);
    model.position.x = lerp(model.position.x, targetPos.x, POSE_LERP);
    model.position.y = lerp(model.position.y, targetPos.y, POSE_LERP);
    model.position.z = lerp(model.position.z, targetPos.z, POSE_LERP);

    applyFingerPose(amt);
  };

  return { state, onModelLoaded, onMediaPipe, update };
}
