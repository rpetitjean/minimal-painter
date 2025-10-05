// SPATIAL-MARKER (rig-friendly: reuses existing camera + hands)
/**
 * SPATIAL-MARKER
 * One-liner setup for your VR painter rig.
 *
 * Usage:
 *   <a-entity id="rig"
 *     spatial-marker="
 *       areaSelector: .paintingArea;
 *       autoArea: true;
 *       areaSize: 4 4;
 *       areaPosition: 0 0 -4;
 *       areaRotation: -90 0 0;
 *       areaColor: #7BC8A4;
 *       areaOpacity: 0.0;
 *       areaTransparent: true;
 *       startSide: right;
 *       useHandSwapper: false;
 *       patchHintSize: true;
 *       sizes: 0.0025,0.005,0.01,0.02;
 *       hintSize: 0.028;
 *       imgHint: UI.png;
 *       billboardHints: true;
 *       colors:
 *         #ffffff,#000000,#ff8000,#ffbf00,#ffff00,#bfff00,#80ff00,#40ff00,
 *         #00ff00,#00ff40,#00ff80,#00ffbf,#00ffff,#00bfff,#0080ff,#0040ff,
 *         #0000ff,#4000ff,#8000ff,#bf00ff,#ff00ff,#ff00bf,#ff0080,#ff0040;
 *       rigSelector: #rig;
 *       createHandsIfMissing: true;
 *     ">
 *     <!-- camera + hands as you already have them -->
 *   </a-entity>
 */

AFRAME.registerComponent('spatial-marker', {
  schema: {
    // --- Painting zone selection/creation ---
    /** CSS selector for paintable area(s). */
    areaSelector:   { default: '.paintingArea' },
    /** If true and no areaSelector found, auto-create a plane. */
    autoArea:       { default: true },
    /** Auto-created plane size "width height" (m). */
    areaSize:       { default: '4 4' },
    /** Auto-created plane position "x y z". */
    areaPosition:   { default: '0 0 -4' },
    /** Auto-created plane rotation "x y z". */
    areaRotation:   { default: '-90 0 0' },
    /** Auto-created plane color (if visible). */
    areaColor:      { default: '#ffffffff' },
    /** Auto-created plane material opacity. */
    areaOpacity:    { default: 0.0 },
    /** Auto-created plane material transparent flag. */
    areaTransparent:{ default: true },

    // --- Behavior toggles ---
    /** Which hand starts as the painter. */
    startSide:      { default: 'right', oneOf: ['left','right'] },
    /** Use hand-swapper instead of paint-tool-reset (both swap on grip). */
    useHandSwapper: { default: true },
    /** Patch size-picker so hint plane honors hintSize (width/height = hintSize). */
    patchHintSize:  { default: true },

    // --- Size-picker passthrough ---
    /** Brush thickness presets cycled by B/Y. */
    sizes:          { default: [0.0025,0.005,0.01,0.02] },
    /** Square hint plane size (meters). */
    hintSize:       { default: 0.028 },
    /** Image for hint (URL or selector). Leave empty to use tinted quad. */
    imgHint:        { default: 'UI.png' },
    /** Make the hint face the camera each frame. */
    billboardHints: { default: true },

    // --- Color-picker passthrough ---
    /** Palette colors (top-left is index 0). */
    colors:         { default: [
      '#ffffff','#000000','#ff8000','#ffbf00',
      '#ffff00','#bfff00','#80ff00','#40ff00',
      '#00ff00','#00ff40','#00ff80','#00ffbf',
      '#00ffff','#00bfff','#0080ff','#0040ff',
      '#0000ff','#4000ff','#8000ff','#bf00ff',
      '#ff00ff','#ff00bf','#ff0080','#ff0040'
    ]},

    // --- Locomotion / rig targeting ---
    /** Which entity the thumbstick-controls should move. */
    rigSelector:    { default: '#rig' },

    // --- Safety/ergonomics ---
    /** If the left/right hand entities are missing, create minimal ones. */
    createHandsIfMissing: { default: true }
  },

  init() {
    const el = this.el;
    const d  = this.data;

    // Ensure the rig has an id (required by thumbstick-controls gating).
    if (!el.id) el.setAttribute('id', 'rig');

    // Get (or optionally create) hands in-place under this rig.
    const L = this._ensureHand('left-hand',  'left',  d.createHandsIfMissing);
    const R = this._ensureHand('right-hand', 'right', d.createHandsIfMissing);

    // Make sure thumbstick-controls target the rig.
    [L, R].forEach(h => {
      if (!h) return;
      if (!h.components['thumbstick-controls']) {
        h.setAttribute('thumbstick-controls', `rigSelector: ${d.rigSelector}`);
      } else {
        h.setAttribute('thumbstick-controls', 'rigSelector', d.rigSelector);
      }
    });

    // Create a painting area if none exists and autoArea is enabled.
    const areas = Array.from(document.querySelectorAll(d.areaSelector));
    if (!areas.length && d.autoArea) this._createAreaPlane();

    // Install core behaviors: area controller + side swapper.
    el.setAttribute('painting-area-controller', { areaSelector: d.areaSelector });

    if (d.useHandSwapper) {
      el.setAttribute('hand-swapper', '');
    } else {
      el.setAttribute('paint-tool-reset', '');
    }

    // Set start side now (forces painter/palette assignment).
    const chooser = d.useHandSwapper
      ? el.components['hand-swapper']
      : el.components['paint-tool-reset'];

    if (chooser) {
      const fn = d.useHandSwapper ? 'activate' : 'assignTools';
      if (typeof chooser[fn] === 'function') {
        // paint-tool-reset.assignTools(side, force) | hand-swapper.activate(side)
        d.useHandSwapper ? chooser.activate(d.startSide)
                         : chooser.assignTools(d.startSide, /*force*/ true);
      }
    }

    // Optionally patch size-picker's hint maker so width/height = hintSize.
    if (d.patchHintSize) this._patchHintSizeOnce();

    // When we first enter the paint zone, push size/color configs to active tools.
    const pac = el.components['painting-area-controller'];
    if (pac) {
      const onChanged = (e) => {
        if (e.detail.name !== 'painting-area-controller') return;
        if (!pac.inside) return;

        // Apply size-picker config to the active brush hand.
        const brush = document.querySelector('[active-brush]');
        if (brush) {
          brush.setAttribute('size-picker', {
            sizes: d.sizes,
            hintSize: d.hintSize,
            imgHint: d.imgHint,
            billboardHints: d.billboardHints
          });
        }

        // Ensure color-picker palette schema is set on both hands
        // (controller will attach/detach palette hand UI as needed).
        [L, R].forEach(h => h && h.setAttribute('color-picker', { colors: d.colors }));

        // Only need to configure once.
        el.removeEventListener('componentchanged', onChanged);
      };
      el.addEventListener('componentchanged', onChanged);
    }
  },

  // ---- helpers ----
  _ensureHand(id, side, allowCreate) {
    let hand = document.getElementById(id);
    if (!hand && !allowCreate) return null;
    if (!hand) {
      hand = document.createElement('a-entity');
      hand.setAttribute('id', id);
      this.el.appendChild(hand);
    }
    if (!hand.getAttribute('meta-touch-controls')) {
      hand.setAttribute('meta-touch-controls', `hand: ${side}`);
    }
    return hand;
  },

  _createAreaPlane() {
    const d = this.data;
    const plane = document.createElement('a-plane');
    plane.classList.add(d.areaSelector.replace(/^[.#]/,''));
    plane.setAttribute('position', d.areaPosition);
    plane.setAttribute('rotation', d.areaRotation);

    const [w,h] = d.areaSize.split(/\s+/).map(parseFloat);
    plane.setAttribute('width',  Number.isFinite(w) ? w : 4);
    plane.setAttribute('height', Number.isFinite(h) ? h : 4);

    plane.setAttribute('material',
      `color:${d.areaColor}; opacity:${d.areaOpacity}; transparent:${d.areaTransparent}`);

    // add to the scene so the controller can find it by selector
    this.el.sceneEl.appendChild(plane);
  },

  _patchHintSizeOnce() {
    const C = AFRAME.components['size-picker']?.Component?.prototype;
    if (!C) return;
    if (C._spatialMarkerPatched) return;

    const make = C._makeSideHint;
    if (typeof make !== 'function') return;

    C._makeSideHint = function spatialMarker_makeSideHintPatched() {
      const s = this.data.hintSize;
      const p = document.createElement('a-plane');
      p.setAttribute('width',  s);
      p.setAttribute('height', s);

      const mat = this.data.imgHint
        ? `src:${this.data.imgHint}; side:double; transparent:true`
        : `color:${this.data.hintTint}; opacity:${this.data.hintOpacity}; transparent:true; side:double`;

      p.setAttribute('material', mat);
      this.el.appendChild(p);
      return p;
    };
    C._spatialMarkerPatched = true;
  }
});


// 1) PAINTING-AREA-CONTROLLER
AFRAME.registerComponent('painting-area-controller', {
  schema: { areaSelector: { default: '.paintingArea' } },

  init() {
    this.areas     = Array.from(document.querySelectorAll(this.data.areaSelector));
    this.leftHand  = document.getElementById('left-hand');
    this.rightHand = document.getElementById('right-hand');
    this.inside    = false;

    this._rigPos = new THREE.Vector3();
    this._box    = new THREE.Box3();

    if (!this.areas.length) {
      console.warn('[painting-area-controller] No areas found for selector:', this.data.areaSelector);
    }
  },

  tick() {
    if (!this.areas.length) return;

    // rig world position
    this.el.object3D.getWorldPosition(this._rigPos);

    // inside any area?
    let nowInside = false;
    for (let i = 0; i < this.areas.length; i++) {
      const area = this.areas[i];
      if (!area || !area.object3D) continue;
      this._box.setFromObject(area.object3D);
      if (this._box.containsPoint(this._rigPos)) { nowInside = true; break; }
    }

    // while outside, force-stop any active stroke
    if (!nowInside) this._forceReleaseBothHands();

    // enter/leave handling
    if (nowInside === this.inside) return;
    this.inside = nowInside;

    if (nowInside) {
      this.enablePainting();
      const painter = document.querySelector('[active-brush]');
      this._gateLocomotionToPainter(painter);
    } else {
      this.disablePainting();
      this._enableLocomotionBoth();
    }
  },

  enablePainting() {
    const painter = document.querySelector('[active-brush]');
    if (!painter) return;

    const palette = (painter === this.leftHand) ? this.rightHand : this.leftHand;
    const dl      = painter.components['draw-line'];

    if (dl) {
      dl.indicator.material.color.set(dl.data.color);
      dl.indicator.visible = true;
      dl.enableInput();
    }

    // Show UI only inside area
    painter.setAttribute('size-picker','');
    if (palette) palette.setAttribute('color-picker','');

    // Tint painting hand only (palette hand cleared)
    this._applyTints(painter, palette);

    // Only the painting hand moves while inside
    this._gateLocomotionToPainter(painter);
  },

  disablePainting() {
    const painter = document.querySelector('[active-brush]');
    const palette = (painter === this.leftHand) ? this.rightHand : this.leftHand;
    const dl      = painter && painter.components['draw-line'];

    if (dl) {
      if (dl.drawing) dl.stopLine();
      dl.disableInput();
      dl.indicator.visible = false;
    }
    if (painter) painter.removeAttribute('size-picker');
    if (palette) palette.removeAttribute('color-picker');

    // Clear all controller tints outside area
    this._clearTints();

    // Both hands can move outside
    this._enableLocomotionBoth();
  },

  // ---------- locomotion helpers ----------
  _ensureThumbstick(handEl) {
    if (!handEl) return;
    if (!handEl.components['thumbstick-controls']) {
      handEl.setAttribute('thumbstick-controls', 'rigSelector', '#rig');
    }
  },

  _setLocomotionEnabled(handEl, enabled) {
    if (!handEl) return;
    this._ensureThumbstick(handEl);
    handEl.setAttribute('thumbstick-controls', 'enabled', !!enabled);
  },

  _gateLocomotionToPainter(painter) {
    if (!painter) { this._enableLocomotionBoth(); return; }
    const isLeft = (painter === this.leftHand);
    this._setLocomotionEnabled(this.leftHand,  isLeft);
    this._setLocomotionEnabled(this.rightHand, !isLeft);
  },

  _enableLocomotionBoth() {
    this._setLocomotionEnabled(this.leftHand,  true);
    this._setLocomotionEnabled(this.rightHand, true);
  },

  // ---------- tint helpers ----------
  _ensureColorizer(handEl) {
    if (!handEl) return null;
    if (!handEl.components['button-colorizer']) {
      handEl.setAttribute('button-colorizer','');
    }
    return handEl.components['button-colorizer'];
  },

  _applyTints(painter, palette) {
    const bcPainter = this._ensureColorizer(painter);
    const bcPalette = this._ensureColorizer(palette);
    if (!bcPainter) return;

    // Right: A red / B blue / Grip yellow. Left: X red / Y blue / Grip yellow.
    const isRight = (painter === this.rightHand);
    const scheme = isRight
      ? { a:'#E94462', b:'#80A8FF', grip:'#E2EC72' }
      : { x:'#E94462', y:'#80A8FF', grip:'#E2EC72' };

    bcPainter.applyScheme(scheme);
    if (bcPalette) bcPalette.clearScheme();
  },

  _clearTints() {
    [this.leftHand, this.rightHand].forEach(h => {
      const bc = h && h.components['button-colorizer'];
      if (bc) bc.clearScheme();
    });
  },

  // ---------- safety: stop strokes when outside ----------
  _forceReleaseBothHands() {
    [this.leftHand, this.rightHand].forEach(hand => {
      if (!hand) return;
      const dl = hand.components && hand.components['draw-line'];
      if (!dl) return;
      if (dl.drawing) {
        try { hand.emit('triggerup'); } catch(e) {}
        dl.stopLine();
        dl.drawing = false;
        if (dl.indicator) dl.indicator.visible = false;
      }
    });
  }
});


// 2) PAINT-TOOL-RESET
AFRAME.registerComponent('paint-tool-reset', {
  init() {
    this.leftHand     = document.getElementById('left-hand');
    this.rightHand    = document.getElementById('right-hand');
    this.onGrip       = this.onGrip.bind(this);
    this.currentSide  = null;

    this.leftHand .addEventListener('gripdown', this.onGrip);
    this.rightHand.addEventListener('gripdown', this.onGrip);

    // start on right
    this.assignTools('right', /* force */ true);
  },

  onGrip(evt) {
    const pac = this.el.components['painting-area-controller'];
    if (!pac || !pac.inside) return;   // swap only inside the area

    const side = (evt.currentTarget.id === 'left-hand') ? 'left' : 'right';
    this.assignTools(side);
  },

  assignTools(side, force = false) {
    if (!force && side === this.currentSide) return;
    this.currentSide = side;

    const painter = (side === 'left') ? this.leftHand : this.rightHand;
    const palette = (side === 'left') ? this.rightHand : this.leftHand;

    // Clean paint UI from both hands (keep locomotion)
    [ this.leftHand, this.rightHand ].forEach(hand => {
      const dlComp = hand.components['draw-line'];
      if (dlComp) {
        dlComp.disableInput();
        hand.object3D.remove(dlComp.indicator);
        dlComp.indicator?.geometry?.dispose?.();
        dlComp.indicator?.material?.dispose?.();
      }
      hand.removeAttribute('draw-line');
      hand.removeAttribute('active-brush');
      hand.removeAttribute('size-picker');
      hand.removeAttribute('color-picker'); // <- no palette on awake
      if (!hand.components['thumbstick-controls']) {
        hand.setAttribute('thumbstick-controls', 'rigSelector', '#rig');
      }
    });

    // Painter tools
    painter.setAttribute('draw-line', 'color:#ffffff; thickness:0.02; minDist:0.005');
    painter.setAttribute('active-brush','');

    const dl = painter.components['draw-line'];
    if (dl) { dl.disableInput(); dl.indicator.visible = false; }

    // If inside, enable painting (also shows palette & gates locomotion)
    const pac = this.el.components['painting-area-controller'];
    if (pac && pac.inside) pac.enablePainting();

    // (No palette attachment here; controller handles it inside the zone)
  },

  remove() {
    this.leftHand .removeEventListener('gripdown', this.onGrip);
    this.rightHand.removeEventListener('gripdown', this.onGrip);
  }
});

// 3) HAND-SWAPPER
AFRAME.registerComponent('hand-swapper', {
  init() {
    this.leftHand  = document.getElementById('left-hand');
    this.rightHand = document.getElementById('right-hand');

    this.onGrip = this.onGrip.bind(this);
    this.leftHand .addEventListener('gripdown', this.onGrip);
    this.rightHand.addEventListener('gripdown', this.onGrip);

    this.activate('right');
  },

  onGrip(evt) {
    const pac = this.el.components['painting-area-controller'];
    if (!pac || !pac.inside) return;   // swap only inside the area

    const side = evt.currentTarget.id === 'left-hand' ? 'left' : 'right';
    this.activate(side);
  },

  activate(side) {
    const painter = side === 'left' ? this.leftHand : this.rightHand;
    const palette = side === 'left' ? this.rightHand : this.leftHand;

    // Clean paint UI; keep locomotion
    [this.leftHand, this.rightHand].forEach(h => {
      const dl = h.components['draw-line'];
      if (dl) {
        dl.disableInput?.();
        if (dl.indicator) {
          h.object3D.remove(dl.indicator);
          dl.indicator.geometry?.dispose?.();
          dl.indicator.material?.dispose?.();
        }
      }
      h.removeAttribute('draw-line');
      h.removeAttribute('size-picker');
      h.removeAttribute('color-picker'); // <- no palette on awake
      h.removeAttribute('active-brush');

      if (!h.components['thumbstick-controls']) {
        h.setAttribute('thumbstick-controls', 'rigSelector', '#rig');
      }
    });

    // Painter setup
    painter.setAttribute('draw-line', 'color:#ffffff; thickness:0.02; minDist:0.005');
    painter.setAttribute('size-picker','');
    painter.setAttribute('active-brush','');

    const dl = painter.components['draw-line'];
    if (dl) dl.disableInput?.();

    // If inside, controller will show palette & gate locomotion to this hand
    const pac = this.el.components['painting-area-controller'];
    if (pac && pac.inside) pac.enablePainting();
  },

  remove() {
    this.leftHand .removeEventListener('gripdown', this.onGrip);
    this.rightHand.removeEventListener('gripdown', this.onGrip);
  }
});

// 4) DRAW-LINE
AFRAME.registerComponent('draw-line', {
  schema: {
    color:     { type:'color',  default:'#ffffff' },
    thickness: { type:'number', default:0.02   },
    minDist:   { type:'number', default:0.005  },
    tipOffset: { type:'number', default:0.05   }
  },
  init() {
    const THREE = AFRAME.THREE, d = this.data;
    this.points      = [];
    this.drawing     = false;
    this.currentMesh = null;
    this.drawn       = [];

    // tip indicator
    const geo = new THREE.SphereGeometry(d.thickness,16,16);
    const mat = new THREE.MeshBasicMaterial({
      color:d.color, transparent:true, opacity:1
    });
    this.indicator = new THREE.Mesh(geo,mat);
    this.indicator.frustumCulled = false;
    this.indicator.position.set(0,0,-d.tipOffset);
    this.el.object3D.add(this.indicator);

    // bind handlers
    this._onTriggerDown = ()=>this.startLine();
    this._onTriggerUp   = ()=>this.stopLine();
    this._onMouseDown   = e=>{ if(e.button===0) this.startLine(); };
    this._onMouseUp     = e=>{ if(e.button===0) this.stopLine(); };
    this._onContext     = e=>e.preventDefault();
    this._onDelete      = this.deleteLast.bind(this);

    // start with input off
    this.disableInput();
  },
  update(old) {
    const d = this.data, THREE = AFRAME.THREE;
    if (old.thickness!==d.thickness) {
      this.indicator.geometry.dispose();
      this.indicator.geometry=new THREE.SphereGeometry(d.thickness,16,16);
    }
    if (old.color!==d.color) {
      this.indicator.material.color.set(d.color);
    }
    if (old.tipOffset!==d.tipOffset) {
      this.indicator.position.set(0,0,-d.tipOffset);
    }
  },
  startLine() {
    this.drawing = true;
    this.points.length = 0;
    this.indicator.visible = false;
    const mat=new AFRAME.THREE.MeshBasicMaterial({
      color:this.data.color, side:AFRAME.THREE.FrontSide
    });
    this.currentMesh=new AFRAME.THREE.Mesh(
      new AFRAME.THREE.BufferGeometry(), mat
    );
    this.currentMesh.frustumCulled = false;
    this.el.sceneEl.object3D.add(this.currentMesh);
  },
  stopLine() {
    this.drawing = false;
    this.indicator.visible = true;
    if (!this.points.length) return;
    const capGeo=new AFRAME.THREE.SphereGeometry(this.data.thickness,8,8);
    const capMat=new AFRAME.THREE.MeshBasicMaterial({color:this.data.color});
    const startCap=new AFRAME.THREE.Mesh(capGeo,capMat);
    const endCap  =new AFRAME.THREE.Mesh(capGeo,capMat);
    startCap.position.copy(this.points[0]);
    endCap.position.copy(this.points[this.points.length-1]);
    this.el.sceneEl.object3D.add(startCap,endCap);
    this.drawn.push({tube:this.currentMesh, startCap, endCap});
    this.currentMesh=null;
  },
  deleteLast() {
    const last=this.drawn.pop();
    if (!last) return;
    [last.tube, last.startCap, last.endCap].forEach(m=>{
      this.el.sceneEl.object3D.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
  },
  tick() {
    if (!this.drawing || !this.currentMesh) return;
    const pos=new AFRAME.THREE.Vector3();
    this.indicator.getWorldPosition(pos);
    const last=this.points[this.points.length-1];
    if (!last || last.distanceTo(pos)>this.data.minDist) {
      this.points.push(pos.clone());
    } else return;
    if (this.points.length<2) return;
    const curve=new AFRAME.THREE.CatmullRomCurve3(this.points);
    const segs=Math.max(this.points.length*4,16);
    const geo=new AFRAME.THREE.TubeGeometry(curve,segs,this.data.thickness,8,false);
    this.currentMesh.geometry.dispose();
    this.currentMesh.geometry = geo;
    this.currentMesh.material.color.set(this.data.color);
  },
  disableInput() {
    this.el.removeEventListener('triggerdown', this._onTriggerDown);
    this.el.removeEventListener('triggerup',   this._onTriggerUp);
    this.el.sceneEl.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.el.sceneEl.canvas.removeEventListener('contextmenu', this._onContext);
    this.el.removeEventListener('abuttondown', this._onDelete);
    this.el.removeEventListener('xbuttondown', this._onDelete);
    this.indicator.visible = false;
  },
  enableInput() {
    this.el.addEventListener('triggerdown', this._onTriggerDown);
    this.el.addEventListener('triggerup',   this._onTriggerUp);
    this.el.sceneEl.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    this.el.sceneEl.canvas.addEventListener('contextmenu', this._onContext);
    this.el.addEventListener('abuttondown', this._onDelete);
    this.el.addEventListener('xbuttondown', this._onDelete);
    this.indicator.visible = true;
  }
});

// 5) SIZE-PICKER
AFRAME.registerComponent('size-picker',{
  schema:{
    sizes:{ default:[0.0025,0.005,0.01,0.02] },

    // One square hint per hand
    hintSize:        { default: 0.05 },       // width = height (m)
    hintTint:        { default: '#111' },
    hintOpacity:     { default: 0.9 },
    imgHint:         { default: 'UI.png' },          // selector or URL (optional)
    billboardHints:  { default: true },        // face camera
    faceOutward:     { default: true },        // if not billboarding, point normal outward

    // Side placement (controller local space)
    outerOffset:     { default: 0.04 },        // 4 cm out to ±X
    raise:           { default: 0.01 },        // 1 cm up on +Y
    forward:         { default: 0.00 },        // Z tweak if needed

    // keep your button to cycle sizes
    cycleWithBY:     { default: true }
  },

  init(){
    // --- size UI (as before) ---
    this.idx = 0;
    this._buildUI();
    this._highlight();

    // --- single side hint ---
    this._handSide = this._getHandSide(); // 'right' | 'left'
    this._hint = this._makeSideHint();
    this._placeSideHint();

    // input to cycle sizes (optional)
    if (this.data.cycleWithBY) {
      this.onBtn = this.onBtn.bind(this);
      ['bbuttondown','ybuttondown'].forEach(evt => this.el.addEventListener(evt, this.onBtn));
    }
  },

  remove(){
    if (this.data.cycleWithBY) {
      ['bbuttondown','ybuttondown'].forEach(evt => this.el.removeEventListener(evt, this.onBtn));
    }
    if (this.container) this.container.remove();
    if (this._hint) this._hint.remove();
  },

  tick(){
    if (!this.data.billboardHints || !this._hint) return;
    const cam = this.el.sceneEl?.camera?.el;
    if (!cam?.object3D) return;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);
    this._hint.object3D?.lookAt(camPos);
  },

  // ---------- size UI ----------
  _buildUI(){
    const radii=[0.0075,0.01,0.0125,0.015], gap=0.03;
    this.container=document.createElement('a-entity');
    this.container.setAttribute('position','0 -0.05 -0.055');
    this.container.setAttribute('rotation','90 0 0');
    this.el.appendChild(this.container);

    this.cells = radii.map((r,i)=>{
      const ring=document.createElement('a-ring');
      ring.setAttribute('radius-inner',r*0.8);
      ring.setAttribute('radius-outer',r);
      ring.setAttribute('material','color:#E0E0E0;side:double');
      ring.object3D.position.set((i-(radii.length-1)/2)*gap,0,0);
      this.container.appendChild(ring);
      return ring;
    });
  },

  _highlight(){
    this.cells.forEach((ring,i)=> {
      ring.setAttribute('material', i===this.idx ? 'color:#D6D6D6;side:double' : 'color:#888;side:double');
    });
    const t = this.data.sizes[this.idx];
    const brush = document.querySelector('[active-brush]');
    if (brush) brush.setAttribute('draw-line','thickness', t);
  },

  onBtn(){
    this.idx = (this.idx+1)%this.data.sizes.length;
    this._highlight();
  },

  // ---------- single side hint ----------
  _makeSideHint(){
    const s = this.data.hintSize;
    const p = document.createElement('a-plane');
    p.setAttribute('width',  0.3);
    p.setAttribute('height', 0.3);

    const mat = this.data.imgHint
      ? `src:${this.data.imgHint}; side:double; transparent:true`
      : `color:${this.data.hintTint}; opacity:${this.data.hintOpacity}; transparent:true; side:double`;
    p.setAttribute('material', mat);

    // attach to the controller entity
    this.el.appendChild(p);
    return p;
  },

  _placeSideHint(){
    if (!this._hint?.object3D) return;

    const sign = (this._handSide === 'right') ? +2 : -2; // +X for right, -X for left
    const x = sign * this.data.outerOffset;
    const y = this.data.raise;
    const z = this.data.forward;

    // position
    this._hint.object3D.position.set(x, y, z);

    // orientation if not billboarding: face outward along ±X
    if (!this.data.billboardHints && this.data.faceOutward) {
      // plane faces +Z by default; rotate around Y so normal points ±X
      this._hint.object3D.rotation.set(0, sign * Math.PI/2, 0);
    }
  },

  _getHandSide(){
    const mtc = this.el.getAttribute('meta-touch-controls');
    if (mtc?.hand) return mtc.hand;
    const id = (this.el.id||'').toLowerCase();
    if (id.includes('right')) return 'right';
    if (id.includes('left'))  return 'left';
    return 'right';
  }
});


// 6) COLOR-PICKER — start ring at top-left (index 0)
AFRAME.registerComponent('color-picker',{
  schema:{
    colors:{ default:[
      '#ffffff','#000000','#ff8000','#ffbf00',
      '#ffff00','#bfff00','#80ff00','#40ff00',
      '#00ff00','#00ff40','#00ff80','#00ffbf',
      '#00ffff','#00bfff','#0080ff','#0040ff',
      '#0000ff','#4000ff','#8000ff','#bf00ff',
      '#ff00ff','#ff00bf','#ff0080','#ff0040'
    ]},
    bgRadius:  { default: 0.11 },
    bgColor:   { default: '#ffffff' },
    bgOpacity: { default: 0.6 },
    faceDown:  { default: true },   // palette faces floor by default
    invertY:   { default: true }    // stick up -> visually up
  },

  init(){
    // layout
    this.rowSizes=[2,4,6,6,4,2];
    this.rowStart=[0];
    this.rowSizes.forEach((sz,i)=>{ if(i>0) this.rowStart.push(this.rowStart[i-1]+this.rowSizes[i-1]); });

    // state
    this.colors   = this.data.colors.slice(0, this.rowSizes.reduce((a,b)=>a+b,0));
    this.selected = 0;                 // <- always start at top-left
    this.canStep  = true;
    this.pressTh  = 0.5;
    this.releaseTh= 0.5;
    this.cellX=[]; this.cellY=[];
    this.ring = null;

    // container
    this.container=document.createElement('a-entity');
    this.container.setAttribute('position','0 -0.05 -0.16');
    this.container.setAttribute('rotation', this.data.faceDown ? '-90 0 0' : '90 0 0');
    this.el.appendChild(this.container);

    // build
    this._addPaletteBackground();
    this._buildPalette();

    // place ring over top-left AFTER elements exist
    const place = () => this._applyColor(true);
    if (this.container.hasLoaded) place(); else this.container.addEventListener('loaded', place);
    if (this.ring) { if (this.ring.hasLoaded) place(); else this.ring.addEventListener('loaded', place); }
    requestAnimationFrame(place);

    // input
    this.onThumb=this.onThumb.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumb);
  },

  _addPaletteBackground(){
    const bg=document.createElement('a-circle');
    bg.setAttribute('radius', this.data.bgRadius);
    bg.setAttribute('segments', 64);
    bg.setAttribute('material', `color:${this.data.bgColor}; opacity:${this.data.bgOpacity}; transparent:true; side:double`);
    bg.setAttribute('position','0 0 -0.005');
    this.container.appendChild(bg);
  },

  _buildPalette(){
    const gap=0.03, r=0.015;
    let idx=0;
    this.rowSizes.forEach((count,row)=>{
      const y=((this.rowSizes.length-1)/2-row)*gap; // top row first
      for(let col=0; col<count; col++, idx++){
        const x=(col-(count-1)/2)*gap;              // leftmost first
        this.cellX.push(x);
        this.cellY.push(y);
        const cell=document.createElement('a-circle');
        cell.setAttribute('radius', r);
        cell.setAttribute('segments', 32);
        cell.setAttribute('material', `color:${this.colors[idx]}; side:double`);
        cell.setAttribute('position', `${x} ${y} 0`);
        this.container.appendChild(cell);
      }
    });
    const ring=document.createElement('a-ring');
    ring.setAttribute('radius-inner', r*0.8);
    ring.setAttribute('radius-outer', r*1.2);
    ring.setAttribute('material', 'color:#D6D6D6; side:double');
    ring.setAttribute('position', '0 0 0.01'); // will be moved in _applyColor
    this.container.appendChild(ring);
    this.ring = ring;
  },

  onThumb(evt){
    const x = evt.detail.x;
    const y = this.data.invertY ? -evt.detail.y : evt.detail.y;

    if(!this.canStep){
      if(Math.abs(x)<this.releaseTh && Math.abs(y)<this.releaseTh) this.canStep=true;
      return;
    }
    if      (y >  this.pressTh) this._moveVert(-1); // UP a row
    else if (y < -this.pressTh) this._moveVert( 1); // DOWN a row
    else if (x >  this.pressTh) this._moveHoriz( 1);
    else if (x < -this.pressTh) this._moveHoriz(-1);
    else return;

    this._applyColor(false);
    this.canStep=false;
  },

  _findRow(idx){
    for(let r=0;r<this.rowSizes.length;r++){
      const start=this.rowStart[r];
      if(idx<start+this.rowSizes[r]) return r;
    }
    return 0;
  },

  _moveHoriz(dir){
    const r=this._findRow(this.selected);
    const start=this.rowStart[r], sz=this.rowSizes[r];
    const col=this.selected-start;
    this.selected = start + ((col+dir+sz)%sz);
  },

  _moveVert(dir){
    const r=this._findRow(this.selected);
    const start=this.rowStart[r], sz=this.rowSizes[r];
    const col=this.selected-start;
    const frac= sz>1 ? col/(sz-1) : 0;
    const nr=(r+dir+this.rowSizes.length)%this.rowSizes.length;
    const nsz=this.rowSizes[nr];
    const newCol=Math.round(frac*(nsz-1));
    this.selected = this.rowStart[nr] + newCol;
  },

  _applyColor(initial=false){
    if (!this.ring) return;
    const x = this.cellX[this.selected] ?? 0;
    const y = this.cellY[this.selected] ?? 0;

    // Move ring now
    this.ring.setAttribute('position', `${x} ${y} 0.01`);
    if (this.ring.object3D) this.ring.object3D.position.set(x, y, 0.01);

    // Also set brush color to the selected swatch
    const brush=document.querySelector('[active-brush]');
    if (brush) brush.setAttribute('draw-line','color', this.colors[this.selected]);
  },

  remove(){
    this.el.removeEventListener('thumbstickmoved', this.onThumb);
    this.container.remove();
  }
});

// 7) THUMBSTICK-CONTROLS
AFRAME.registerComponent('thumbstick-controls', {
    schema: {
        acceleration: { default: 25 },
        rigSelector: {default: "#rig"},
        fly: { default: false },
        controllerOriented: { default: false },
        adAxis: {default: 'x', oneOf: ['x', 'y', 'z']},
        wsAxis: {default: 'z', oneOf: ['x', 'y', 'z']},
        enabled: {default: true},
        adEnabled: {default: true},
        adInverted: {default: false},
        wsEnabled: {default: true},
        wsInverted: {default: false}
    },
    init: function () {
        this.easing = 1.1;
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.tsData = new THREE.Vector2(0, 0);

        this.thumbstickMoved = this.thumbstickMoved.bind(this)
        this.el.addEventListener('thumbstickmoved', this.thumbstickMoved);
    },
    update: function() {
        this.rigElement = document.querySelector(this.data.rigSelector)
    },
    tick: function (time, delta) {
        if (!this.el.sceneEl.is('vr-mode')) return;
        var data = this.data;
        var el = this.rigElement
        var velocity = this.velocity;
        //console.log("here", this.tsData, this.tsData.length())
        if (!velocity[data.adAxis] && !velocity[data.wsAxis] && !this.tsData.length()) { return; }

        // Update velocity.
        delta = delta / 1000;
        this.updateVelocity(delta);

        if (!velocity[data.adAxis] && !velocity[data.wsAxis]) { return; }

        // Get movement vector and translate position.
        el.object3D.position.add(this.getMovementVector(delta));
    },
    updateVelocity: function (delta) {
        var acceleration;
        var adAxis;
        var adSign;
        var data = this.data;
        var velocity = this.velocity;
        var wsAxis;
        var wsSign;
        const CLAMP_VELOCITY = 0.00001;

        adAxis = data.adAxis;
        wsAxis = data.wsAxis;

        // If FPS too low, reset velocity.
        if (delta > 0.2) {
            velocity[adAxis] = 0;
            velocity[wsAxis] = 0;
            return;
        }

        // https://gamedev.stackexchange.com/questions/151383/frame-rate-independant-movement-with-acceleration
        var scaledEasing = Math.pow(1 / this.easing, delta * 60);
        // Velocity Easing.
        if (velocity[adAxis] !== 0) {
            velocity[adAxis] = velocity[adAxis] * scaledEasing;
        }
        if (velocity[wsAxis] !== 0) {
            velocity[wsAxis] = velocity[wsAxis] * scaledEasing;
        }

        // Clamp velocity easing.
        if (Math.abs(velocity[adAxis]) < CLAMP_VELOCITY) { velocity[adAxis] = 0; }
        if (Math.abs(velocity[wsAxis]) < CLAMP_VELOCITY) { velocity[wsAxis] = 0; }

        if (!data.enabled) { return; }

        // Update velocity using keys pressed.
        acceleration = data.acceleration;
        if (data.adEnabled && this.tsData.x) {
            adSign = data.adInverted ? -1 : 1;
            velocity[adAxis] += adSign * acceleration * this.tsData.x * delta; 
        }
        if (data.wsEnabled) {
            wsSign = data.wsInverted ? -1 : 1;
            velocity[wsAxis] += wsSign * acceleration * this.tsData.y * delta;
        }
    },
    getMovementVector: (function () {
        var directionVector = new THREE.Vector3(0, 0, 0);
        var rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');

        return function (delta) {
            var rotation = this.el.sceneEl.camera.el.object3D.rotation
            var velocity = this.velocity;
            var xRotation;

            directionVector.copy(velocity);
            directionVector.multiplyScalar(delta);
            // Absolute.
            if (!rotation) { return directionVector; }
            xRotation = this.data.fly ? rotation.x : 0;

            // Transform direction relative to heading.
            rotationEuler.set(xRotation, rotation.y, 0);
            directionVector.applyEuler(rotationEuler);
            return directionVector;
        };
    })(),
    thumbstickMoved: function (evt) {
        this.tsData.set(evt.detail.x, evt.detail.y);
    },
    remove: function () {
        this.el.removeEventListener('thumbstickmoved', this.thumbstickMoved);
    }
});


// 8) BUTTON-COLORIZER
AFRAME.registerComponent('button-colorizer', {
  schema: {
    a:    { type: 'color', default: '#E94462' },
    b:    { type: 'color', default: '#80A8FF' },
    x:    { type: 'color', default: '#E94462' },
    y:    { type: 'color', default: '#80A8FF' },
    grip: { type: 'color', default: '#E2EC72' },

    useEmissive:       { default: true },
    emissiveIntensity: { default: 1 },
    overrideBaseColor: { default: true },
    debug:             { default: false }
  },

  init() {
    this._targets  = {a:[], b:[], x:[], y:[], grip:[]};
    this._original = new Map();  // node.uuid -> [original materials]
    this._pending  = null;

    this._onModelLoaded = () => {
      this._collectTargets();
      if (this._pending) { this.applyScheme(this._pending); this._pending = null; }
    };
    this.el.addEventListener('model-loaded', this._onModelLoaded);
    if (this.el.getObject3D('mesh')) this._onModelLoaded();

    // scratch
    this._v = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
  },

  remove() {
    this.clearScheme();
    this.el.removeEventListener('model-loaded', this._onModelLoaded);
  },

  // ---- public API ----
  applyScheme(scheme) {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) { this._pending = scheme; return; }

    // restore anything previously tinted by us
    this._restoreTintedOnly();

    // 1) Try by names first (A↔X, B↔Y synonyms)
    const equiv = {
      a: ['a','x'], x: ['x','a'],
      b: ['b','y'], y: ['y','b'],
      grip: ['grip']
    };
    Object.keys(scheme).forEach(key => {
      const hex = scheme[key];
      if (!hex) return;
      const keysToApply = equiv[key] || [key];
      keysToApply.forEach(k => {
        (this._targets[k] || []).forEach(node => this._tintNode(node, hex));
      });
    });

    // 2) Positional fallback if the two face buttons collapsed into one bucket
    // Build pair list from all face buckets we have.
    const faces = this._uniqueNodes(
      [].concat(this._targets.a, this._targets.b, this._targets.x, this._targets.y)
    );
    if (faces.length >= 2) {
      // If either pair is missing or one bucket grabbed both, split by local Y.
      const needLeft  = (scheme.x || scheme.y);
      const needRight = (scheme.a || scheme.b);

      const missingLeft  = needLeft  && (this._targets.x.length === 0 || this._targets.y.length === 0);
      const missingRight = needRight && (this._targets.a.length === 0 || this._targets.b.length === 0);

      if (missingLeft || missingRight) {
        const side = this._getSide(); // 'left'|'right'
        const sorted = faces
          .map(n => ({ n, y: this._localY(n) }))
          .sort((p,q) => q.y - p.y); // top first

        const top    = sorted[0]?.n;
        const bottom = sorted[1]?.n;

        // Decide top/bottom colors from the scheme we received.
        // Left:  top = Y, bottom = X.
        // Right: top = B, bottom = A.
        const topColor =
          (side === 'left')  ? (scheme.y || this.data.y) :
          (side === 'right') ? (scheme.b || this.data.b) : null;

        const botColor =
          (side === 'left')  ? (scheme.x || this.data.x) :
          (side === 'right') ? (scheme.a || this.data.a) : null;

        if (top && topColor)     this._tintNode(top, topColor);
        if (bottom && botColor)  this._tintNode(bottom, botColor);
      }
    }

    if (this.data.debug) {
      console.log('[button-colorizer] scheme applied. Face counts:',
        'a',this._targets.a.length,'b',this._targets.b.length,
        'x',this._targets.x.length,'y',this._targets.y.length);
    }
  },

  clearScheme() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !this._original.size) return;
    mesh.traverse(n => {
      if (!n.isMesh) return;
      const orig = this._original.get(n.uuid);
      if (!orig) return;
      n.material = Array.isArray(n.material) ? orig : orig[0];
      n.material.needsUpdate = true;
    });
    this._original.clear();
  },

  // ---- internals ----
  _uniqueNodes(arr) {
    const seen = new Set();
    const out = [];
    arr.forEach(n => { if (n && !seen.has(n.uuid)) { seen.add(n.uuid); out.push(n); } });
    return out;
  },

  _localY(node) {
    // convert node world pos into controller local space, return Y
    node.getWorldPosition(this._v);
    this._inv.copy(this.el.object3D.matrixWorld).invert();
    this._v.applyMatrix4(this._inv);
    return this._v.y;
  },

  _getSide() {
    const mtc = this.el.getAttribute('meta-touch-controls');
    if (mtc && mtc.hand) return mtc.hand;
    const id = (this.el.id||'').toLowerCase();
    if (id.includes('right')) return 'right';
    if (id.includes('left'))  return 'left';
    return 'right';
  },

  _restoreTintedOnly() {
    if (!this._original.size) return;
    for (const [uuid, mats] of this._original.entries()) {
      const node = this._findNodeByUUID(uuid);
      if (!node) continue;
      node.material = Array.isArray(node.material) ? mats : mats[0];
      node.material.needsUpdate = true;
    }
    this._original.clear();
  },

  _findNodeByUUID(uuid) {
    const mesh = this.el.getObject3D('mesh');
    let out = null;
    if (!mesh) return null;
    mesh.traverse(n => { if (!out && n.uuid === uuid) out = n; });
    return out;
  },

  _collectTargets() {
    this._targets = {a:[], b:[], x:[], y:[], grip:[]};
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;

    const order = ['a','b','x','y','grip']; // first match wins
    mesh.traverse(n => {
      if (!n.isMesh || !n.name) return;
      const name = n.name.toLowerCase().replace(/\s+/g, '');

      let matchedKey = null;
      for (const key of order) {
        if (key === 'grip') {
          if (name.includes('grip') || name.includes('squeeze')) { matchedKey = 'grip'; break; }
        } else if (this._btnMatch(name, key, n)) {
          matchedKey = key; break;
        }
      }
      if (matchedKey) this._targets[matchedKey].push(n);
    });

    if (this.data.debug) {
      Object.keys(this._targets).forEach(k => {
        if (this._targets[k].length) {
          console.log(`[button-colorizer] ${k}:`, this._targets[k].map(n => n.name));
        }
      });
    }
  },

  _btnMatch(name, letter, node) {
    // 1) explicit patterns
    const pats = [
      `button_${letter}`, `${letter}_button`,
      `button-${letter}`, `${letter}-button`,
      `btn_${letter}`,    `btn-${letter}`,
      `button${letter}`,  `${letter}button`
    ];
    if (pats.some(p => name.includes(p))) return true;

    // 2) common extras
    const extras = [
      `${letter}cap`, `cap_${letter}`, `${letter}-cap`,
      `${letter}face`, `face_${letter}`, `${letter}-face`
    ];
    if (extras.some(p => name.includes(p))) return true;

    // 3) (NO LONGER) using naive "button+letter anywhere" — too noisy.
    // 4) tiny-geometry heuristic for single-letter meshes (x/y)
    if ((letter === 'x' || letter === 'y') && this._letterAlone(name, letter) && this._seemsButtonLike(node)) {
      return true;
    }

    return false;
  },

  _letterAlone(name, letter) {
    const re = new RegExp(`(^|[^a-z0-9])${letter}([^a-z0-9]|$)`);
    return re.test(name);
  },

  _seemsButtonLike(node) {
    const g = node.geometry;
    if (!g) return false;
    if (!g.boundingSphere) g.computeBoundingSphere?.();
    const r = g.boundingSphere ? g.boundingSphere.radius : Infinity;
    return r > 0 && r < 0.05; // tweak if your model scale differs
  },

  _tintNode(node, hex) {
    if (!this._original.has(node.uuid)) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      this._original.set(node.uuid, mats);
      const cloned = mats.map(m => (m && m.clone) ? m.clone() : m);
      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    }

    const matsNow = Array.isArray(node.material) ? node.material : [node.material];
    matsNow.forEach(m => {
      if (!m) return;
      if (this.data.overrideBaseColor && m.color) m.color.set(hex);
      if (this.data.useEmissive && 'emissive' in m) {
        m.emissive.set(hex);
        if ('emissiveIntensity' in m) m.emissiveIntensity = this.data.emissiveIntensity;
      }
      m.needsUpdate = true;
    });
  }
});
