// 3B görünüm. Plan (x, y) cm → dünya (x/100, 0, y/100) m. Sahne her değişiklikte
// baştan kurulur; bir ev birkaç yüz parçadır, bu yeterince hızlı ve durum tutmaz.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildFurniture, mat } from "./furniture3d.js";
import { floorTexture } from "./textures.js";

const E = globalThis.EvEngine;
const M = 0.01; // cm → m
const EYE = 1.6;
const WALK_SPEED = 2.2; // m/s

export class View3D {
  constructor(container, { onSelect, onModeChange } = {}) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.onModeChange = onModeChange || (() => {});
    this.mode = "orbit";
    this.cutaway = true;
    this.showCeiling = false;
    this.keys = new Set();
    this.wallMeshes = [];
    this.itemGroups = new Map();
    this.hasFramed = false;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#e9e7e2");
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
    this.camera.position.set(6, 7, 9);

    this.orbit = new OrbitControls(this.camera, r.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    this.orbit.minDistance = 1;
    this.orbit.maxDistance = 60;

    this.walk = new PointerLockControls(this.camera, r.domElement);
    this.walk.addEventListener("unlock", () => { if (this.mode === "walk") this.setMode("orbit"); });
    // Tarayıcı fare kilidini reddederse yürüme kipinde asılı kalma.
    document.addEventListener("pointerlockerror", () => { if (this.mode === "walk") this.setMode("orbit"); });

    this.hemi = new THREE.HemisphereLight("#ffffff", "#8a7f70", 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#ffffff", 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    // Referans katmanları (LiDAR, model, splat) ayrı tutulur; sahne her kurulduğunda silinmez.
    this.layerRoot = new THREE.Group();
    this.scene.add(this.layerRoot);

    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Timer();
    this._down = null;

    r.domElement.addEventListener("pointerdown", (e) => { this._down = { x: e.clientX, y: e.clientY }; });
    r.domElement.addEventListener("pointerup", (e) => this._click(e));
    window.addEventListener("keydown", (e) => { if (this.mode === "walk") this.keys.add(e.code); });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    r.setAnimationLoop(() => this._frame());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === "walk") {
      this.orbit.enabled = false;
      const start = this._walkStart || new THREE.Vector3(0, 0, 0);
      this.camera.position.set(start.x, EYE, start.z);
      this.camera.lookAt(start.x + 1, EYE, start.z);
      this.walk.lock();
    } else {
      if (this.walk.isLocked) this.walk.unlock();
      this.orbit.enabled = true;
      this.frame();
    }
    this._applyVisibility();
    this.onModeChange(mode);
  }

  setCutaway(on) { this.cutaway = on; this._applyVisibility(); }

  // Kamerayı evin tamamını görecek şekilde yerleştir.
  frame() {
    if (!this._bounds) return;
    const b = this._bounds;
    const cx = (b.minX + b.maxX) / 2 * M, cz = (b.minY + b.maxY) / 2 * M;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * M;
    this.orbit.target.set(cx, 0.8, cz);
    this.camera.position.set(cx + span * 0.55, span * 1.05 + 2, cz + span * 0.95 + 1);
    this.orbit.update();
  }

  update({ project, variant, style, catalog, selection, issues, focusRoomId }) {
    this._disposeWorld();
    const T = project.wallThickness || 12;
    const world = this.world;
    const all = [];
    project.rooms.forEach((r) => all.push(...r.points));
    this._bounds = all.length ? E.bbox(all) : null;

    const k = E.kelvinToRgb(style.light.kelvin);
    const lightColor = new THREE.Color(`rgb(${k.r},${k.g},${k.b})`);
    this.hemi.color.copy(lightColor);
    this.hemi.intensity = 0.85 * style.light.intensity;
    this.sun.color.copy(lightColor);
    this.sun.intensity = 1.5 * style.light.intensity;
    this.scene.background = new THREE.Color(this.mode === "walk" ? "#d9d6cf" : "#e9e7e2");

    if (this._bounds) {
      const b = this._bounds, cx = (b.minX + b.maxX) / 2 * M, cz = (b.minY + b.maxY) / 2 * M;
      const span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * M + 4;
      this.sun.position.set(cx - span * 0.4, span * 0.9, cz + span * 0.55);
      this.sun.target.position.set(cx, 0, cz);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -span; cam.right = cam.top = span; cam.near = 0.1; cam.far = span * 4;
      cam.updateProjectionMatrix();
    }

    const wallMat = mat(style.walls, { roughness: 0.92 });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(style.floor), roughness: style.floor.type === "tile" || style.floor.type === "terrazzo" ? 0.35 : 0.75 });
    this._floorMat = floorMat;
    const ceilMat = mat(style.ceiling || "#ffffff", { roughness: 1 });
    const glassMat = mat("#cfe4ec", { roughness: 0.05, opacity: 0.22 });
    const frameMat = mat(style.palette.metal, { roughness: 0.5 });

    project.rooms.forEach((room, ri) => {
      // Zemin ve tavan
      const shape = new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x * M, -p.y * M)));
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      floor.userData.roomId = room.id;
      world.add(floor);

      const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), ceilMat);
      ceil.rotation.x = Math.PI / 2;
      ceil.scale.y = -1; // yukarıdan aşağı bakan yüz
      ceil.position.y = room.height * M;
      ceil.userData.isCeiling = true;
      world.add(ceil);

      // Tavan lambası: stilin ışık sıcaklığında.
      const c = E.centroid(room.points);
      const lamp = new THREE.PointLight(lightColor, 1.2 * style.light.intensity, Math.max(6, Math.sqrt(E.area(room.points)) * M * 3), 1.6);
      lamp.position.set(c.x * M, room.height * M - 0.3, c.y * M);
      world.add(lamp);
      if (room.id === focusRoomId || (!this._walkStart && ri === 0)) this._walkStart = new THREE.Vector3(c.x * M, 0, c.y * M);

      // Duvarlar
      E.walls(room).forEach((w) => {
        const angle = Math.atan2(-w.u.y, w.u.x);
        E.wallPieces(project, ri, w.index, T).forEach((pc) => {
          const L = (pc.s1 - pc.s0) * M, H = (pc.z1 - pc.z0) * M, D = pc.depth * M;
          if (L <= 0 || H <= 0) return;
          const mid = (pc.s0 + pc.s1) / 2;
          const px = w.a.x + w.u.x * mid - w.n.x * pc.depth / 2;
          const py = w.a.y + w.u.y * mid - w.n.y * pc.depth / 2;
          const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, D), wallMat);
          m.position.set(px * M, (pc.z0 + pc.z1) / 2 * M, py * M);
          m.rotation.y = angle;
          m.castShadow = m.receiveShadow = true;
          m.userData.outward = new THREE.Vector3(-w.n.x, 0, -w.n.y);
          m.userData.isWall = true;
          world.add(m);
          this.wallMeshes.push(m);
        });

        // Pencere camı ve çerçevesi (yalnız kendi açıklıkları; komşununkini komşu çizer)
        E.openingsOnWall(project, ri, w.index).forEach((o) => {
          if (!o.own) return;
          const cx = w.a.x + w.u.x * o.s - w.n.x * T / 2, cy = w.a.y + w.u.y * o.s - w.n.y * T / 2;
          if (o.type === "window") {
            const g = new THREE.Mesh(new THREE.BoxGeometry(o.width * M, o.height * M, 0.01), glassMat);
            g.position.set(cx * M, (o.sill + o.height / 2) * M, cy * M);
            g.rotation.y = angle;
            world.add(g);
            const fr = new THREE.Mesh(new THREE.BoxGeometry(o.width * M, 0.03, T * M + 0.02), frameMat);
            fr.position.set(cx * M, (o.sill + 1.5) * M, cy * M);
            fr.rotation.y = angle;
            world.add(fr);
            const mid = new THREE.Mesh(new THREE.BoxGeometry(0.03, o.height * M, 0.04), frameMat);
            mid.position.copy(g.position);
            mid.rotation.y = angle;
            world.add(mid);
          } else {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(o.width * M + 0.06, 0.05, T * M + 0.02), frameMat);
            fr.position.set(cx * M, (o.height + 2.5) * M, cy * M);
            fr.rotation.y = angle;
            world.add(fr);
          }
        });
      });
    });

    // Mobilya
    const bad = new Set((issues || []).map((i) => i.itemId));
    (variant.furniture || []).forEach((it) => {
      const c = E.catalogItem(catalog, it.type);
      if (!c) return;
      const d = E.dims(it, catalog);
      const colors = {};
      E.PALETTE_SLOTS.forEach((s) => { colors[s] = E.itemColor(it, catalog, style, s); });
      const g = buildFurniture(c.shape, d.w, d.d, d.h, colors);
      g.position.set(it.x * M, 0, it.y * M);
      g.rotation.y = -(it.rot || 0) * Math.PI / 180;
      g.userData.itemId = it.id;
      g.traverse((o) => { o.userData.itemId = it.id; });
      world.add(g);
      this.itemGroups.set(it.id, g);

      const selected = selection && selection.kind === "item" && selection.id === it.id;
      if (selected || bad.has(it.id)) {
        const box = new THREE.Box3().setFromObject(g);
        const helper = new THREE.Box3Helper(box, selected ? 0x2f7de1 : 0xd23b3b);
        helper.userData.helper = true;
        world.add(helper);
      }
    });

    if (!this.hasFramed && this._bounds) { this.frame(); this.hasFramed = true; }
    this._applyVisibility();
  }

  _disposeWorld() {
    this.world.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.world.clear();
    this.wallMeshes = [];
    this.itemGroups.clear();
    if (this._floorMat) this._floorMat.dispose();
  }

  _applyVisibility() {
    const walk = this.mode === "walk";
    this.world.traverse((o) => { if (o.userData.isCeiling) o.visible = walk || this.showCeiling; });
    this._updateCutaway(true);
  }

  // Yörüngede kameraya dışını dönen duvarlar saydamlaşır ki oda içi görünsün.
  _updateCutaway(force) {
    const walk = this.mode === "walk";
    const cam = this.camera.position;
    for (const m of this.wallMeshes) {
      let fade = false;
      if (!walk && this.cutaway) {
        const to = new THREE.Vector3().subVectors(cam, m.position);
        to.y = 0;
        fade = to.dot(m.userData.outward) > 0;
      }
      if (force || m.userData.faded !== fade) {
        m.userData.faded = fade;
        if (!m.userData.baseMat) m.userData.baseMat = m.material;
        if (fade) {
          if (!this._fadeMat || this._fadeMatSrc !== m.userData.baseMat) {
            this._fadeMatSrc = m.userData.baseMat;
            this._fadeMat = m.userData.baseMat.clone();
            this._fadeMat.transparent = true;
            this._fadeMat.opacity = 0.12;
            this._fadeMat.depthWrite = false;
          }
          m.material = this._fadeMat;
          m.castShadow = false;
        } else {
          m.material = m.userData.baseMat;
          m.castShadow = true;
        }
      }
    }
  }

  _frame() {
    this.clock.update();
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === "walk" && this.walk.isLocked) {
      const f = (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
      const s = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
      const speed = WALK_SPEED * (this.keys.has("ShiftLeft") ? 2 : 1) * dt;
      if (f) this.walk.moveForward(f * speed);
      if (s) this.walk.moveRight(s * speed);
      this.camera.position.y = EYE;
    } else {
      this.orbit.update();
    }
    this._updateCutaway(false);
    this.renderer.render(this.scene, this.camera);
  }

  _click(e) {
    if (!this._down || this.mode === "walk") return;
    if (Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y) > 4) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.children, true)
      .filter((h) => !h.object.userData.helper && !(h.object.userData.isWall && h.object.userData.faded));
    const hit = hits.find((h) => h.object.userData.itemId);
    if (hit && (!hits[0] || hits[0] === hit || hits[0].distance >= hit.distance - 1e-6)) this.onSelect({ kind: "item", id: hit.object.userData.itemId });
    else if (hits[0] && hits[0].object.userData.roomId) this.onSelect({ kind: "room", id: hits[0].object.userData.roomId });
    else this.onSelect(null);
  }

  async setLayers(entries) {
    this.layerRoot.clear();
    const needSpark = entries.some((e) => e.visible && e.splat);
    if (needSpark && !this.spark) {
      const { SparkRenderer } = await import("@sparkjsdev/spark");
      this.spark = new SparkRenderer({ renderer: this.renderer });
      this.scene.add(this.spark);
    }
    entries.forEach((e) => { if (e.visible) this.layerRoot.add(e.outer); });
  }

  // Görünümün küçük resmi (varyant karşılaştırması için).
  snapshot(width = 480) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement("canvas");
    c.width = width;
    c.height = Math.round(width * src.height / src.width);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  }

  pngBlob() {
    this.renderer.render(this.scene, this.camera);
    return new Promise((res) => this.renderer.domElement.toBlob(res, "image/png"));
  }
}
