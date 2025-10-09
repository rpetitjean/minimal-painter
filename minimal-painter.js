/**

 */

AFRAME.registerComponent('spatial-marker', { 
  schema: {
    // --- Painting zone selection/creation ---
    areaSelector:    { default: '.paintingArea' },
    autoArea:        { default: true },
    areaSize:        { default: '4 4' },           // "width height"
    areaPosition:    { default: '0 0 -4' },        // "x y z"
    areaRotation:    { default: '-90 0 0' },       // "x y z"
    areaColor:       { default: '#57ff94'},
    areaOpacity:     { default: 0.1 },
    areaTransparent: { default: true },

    // --- Size-picker passthrough (applied whenever size-picker appears) ---
    markerSize:           { default: [0.0025,0.005,0.01,0.02,] },
    hintSize:        { default: 0.1 },
    imgHint:         { default: 'UI.png' },
    billboardHints:  { default: true },

    // --- Color-picker passthrough (applied whenever color-picker appears) ---
    colors:          { default: [
,
  '#f2f23a','#d8d835',  
  '#f4bd36','#d29930','#f58436','#d06430',   
  '#f45336','#d13230','#f33a3a','#d13636','#f3398c','#d13470',   
  '#f339f3','#d134d8','#9933f3','#7300d8','#3333f3','#0000d8',   
  '#3399f3','#0073d8','#33f339','#00d836',   
  '#99f339','#70d134'    
    ]}
  },

  init() {
    const el = this.el;
    const d  = this.data;
    if (!el.id) el.setAttribute('id', 'rig');

    const L = document.getElementById('left-hand');
    const R = document.getElementById('right-hand');

    // Auto-create area if requested and none found.
    if (!document.querySelector(d.areaSelector) && d.autoArea) {
      this._createAreaPlane();
    }

    // Mount core behaviors (always use paint-tool-reset).
    el.setAttribute('painting-area-controller', { areaSelector: d.areaSelector });
    el.setAttribute('paint-tool-reset', '');

    // Start side: always right.
    const ptr = el.components['paint-tool-reset'];
    if (ptr && typeof ptr.assignTools === 'function') {
      ptr.assignTools('right', /*force*/ true);
    }

    // Always patch size-picker hint plane sizing.
    this._patchHintSizeOnce();

    // Re-apply options whenever size/color pickers (re)attach (entry / swap).
    const onInit = (evt) => {
      const name = evt.detail?.name;
      if (name === 'size-picker')  this._applySizePickerOptions(evt.target);
      if (name === 'color-picker') this._applyColorPickerOptions(evt.target);
    };
    L && L.addEventListener('componentinitialized', onInit);
    R && R.addEventListener('componentinitialized', onInit);

    // Apply immediately if already present.
    this._applyIfPresent();
  },

  // Re-apply after initial entry, or if components were present before we attached listeners
  _applyIfPresent(){
    const L = document.getElementById('left-hand');
    const R = document.getElementById('right-hand');
    [L,R].forEach(h=>{
      if (!h) return;
      if (h.components['size-picker'])  this._applySizePickerOptions(h);
      if (h.components['color-picker']) this._applyColorPickerOptions(h);
    });
  },

  // ---------- APPLY CONFIGS ----------
_applySizePickerOptions(handEl){
  if (!handEl.hasAttribute('active-brush')) return;
  handEl.setAttribute('size-picker', {
    sizes: this.data.markerSize,   // <-- was this.data.sizes
    hintSize: this.data.markerSizeHint || this.data.hintSize || 0.1, // optional; keep your old hint if used
    imgHint: this.data.imgHint,
    billboardHints: this.data.billboardHints
  });
},


  _applyColorPickerOptions(handEl){
    // Only configure if this is the PALETTE hand (no active-brush), else ignore
    if (handEl.hasAttribute('active-brush')) return;
    const colors = this._parseColors(this.data.colors);
    handEl.setAttribute('color-picker', { colors }); // relies on color-picker.update
  },

  // ---- helpers ----
  _createAreaPlane() {
    const d = this.data;
    const plane = document.createElement('a-plane');
    plane.classList.add(d.areaSelector.replace(/^[.#]/,''));
    plane.setAttribute('position', d.areaPosition);
    plane.setAttribute('rotation', d.areaRotation);

    const [w, h] = d.areaSize.split(/\s+/).map(parseFloat);
    plane.setAttribute('width',  Number.isFinite(w) ? w : 4);
    plane.setAttribute('height', Number.isFinite(h) ? h : 4);

    plane.setAttribute('material',
      `color:${d.areaColor}; opacity:${d.areaOpacity}; transparent:${d.areaTransparent}`);

    this.el.sceneEl.appendChild(plane);
  },

  _patchHintSizeOnce() {
    const P = AFRAME.components['size-picker']?.Component?.prototype;
    if (!P || P._spatialMarkerPatched) return;
    const orig = P._makeSideHint;
    if (typeof orig !== 'function') return;

    P._makeSideHint = function patchedMakeSideHint() {
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
    P._spatialMarkerPatched = true;
  },

  _parseColors(input) {
    if (Array.isArray(input)) return input.map(c=>this._normHex(c)).filter(Boolean);
    if (typeof input === 'string') {
      return input
        .split(/,|\s+/)
        .map(s => s.replace(/^['"]|['"]$/g,''))
        .map(c => this._normHex(c))
        .filter(Boolean);
    }
    return [];
  },
  _normHex(x){
    if (!x) return null;
    const s = (''+x).trim();
    // #RGB -> #RRGGBB, or #RRGGBB; reject alpha
    const m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
    if (m3){
      const [r,g,b] = m3[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    const m6 = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (m6) return `#${m6[1].toLowerCase()}`;
    return null;
  }
});


// 1) PAINTING-AREA-CONTROLLER
AFRAME.registerComponent('painting-area-controller', {
  schema: { areaSelector: { default: '.paintingArea' } },

 CONTROLLER_COLORS: {
  right: { a:'#E94462', b:'#80A8FF', grip:'#d4e700' },
  left:  { x:'#E94462', y:'#80A8FF', grip:'#d4e700' }
},


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
// helper to get colorizer safely
_ensureColorizer(handEl) {
  if (!handEl) return null;
  if (!handEl.components['button-colorizer']) {
    handEl.setAttribute('button-colorizer','enabled:false'); // start disabled
  }
  return handEl.components['button-colorizer'];
},

_applyTints(painter, palette) {
  const bcPainter = this._ensureColorizer(painter);
  const bcPalette = this._ensureColorizer(palette);
  if (!bcPainter) return;

  const isRight = (painter === this.rightHand);
  const scheme = isRight
    ? { a:'#E94462', b:'#80A8FF', grip:'#d4e700' }
    : { x:'#E94462', y:'#80A8FF', grip:'#d4e700' };

  // Painter hand ON + apply
  bcPainter.el.setAttribute('button-colorizer','enabled', true);
  bcPainter.applyScheme(scheme);

  // Palette hand OFF + clear
  if (bcPalette) {
    bcPalette.el.setAttribute('button-colorizer','enabled', false);
    bcPalette.clearScheme();
  }
},

_clearTints() {
  [this.leftHand, this.rightHand].forEach(h => {
    const bc = h && h.components['button-colorizer'];
    if (bc) {
      bc.el.setAttribute('button-colorizer','enabled', false);
      bc.clearScheme();
    }
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
    // Removed unused variable 'palette'

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
    painter.setAttribute('draw-line', 'color:#ffffff; thickness:0.0025; minDist:0.005');
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
    // Removed unused variable 'palette'

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
// SIZE-PICKER — 4 options max, clamp [0.001,0.04],
// same outer radius for all rings, band width ∝ thickness (relative to the 4 values)
// 5) SIZE-PICKER — 4 options max, clamp [0.001,0.04],
// ring outer radius encodes size; band width constant
AFRAME.registerComponent('size-picker',{
  schema:{
    sizes:{ default:[0.0025,0.005,0.01,0.02] },
    // --- hint props you want to control from spatial-marker
    hintSize:{ default: 0.1 },
    imgHint:{ default: 'UI.png' },
    hintTint:{ default: '#111' },
    hintOpacity:{ default: 0.9 },
    billboardHints:{ default: true },

    // placement
    faceOutward:{ default: true },
    outerOffset:{ default: 0.04 },
    raise:{ default: 0.01 },
    forward:{ default: 0.00 },

    cycleWithBY:{ default: true }
  },

  init(){
    this.idx = 0;
    this._prepareSizes();
    this._buildUI();
    this._highlight();

    this._handSide = this._getHandSide();

    // create hint once, but keep a reference so we can resize in update()
    this._hint = this._ensureSideHint();
    this._placeSideHint();

    if (this.data.cycleWithBY) {
      this.onBtn = this.onBtn.bind(this);
      ['bbuttondown','ybuttondown'].forEach(e => this.el.addEventListener(e, this.onBtn));
    }
  },

  update(old){
    // react to sizes change (existing behavior)
    if (!old || JSON.stringify(old.sizes)!==JSON.stringify(this.data.sizes)) {
      const prevIdx = this.idx;
      this._prepareSizes();
      this.idx = Math.min(prevIdx, this._sizes.length ? this._sizes.length-1 : 0);
      if (this.container) this.container.remove();
      this._buildUI();
      this._highlight();
    }

    // NEW: react to hint props changing at runtime
    if (old && (
        old.hintSize      !== this.data.hintSize ||
        old.imgHint       !== this.data.imgHint ||
        old.hintTint      !== this.data.hintTint ||
        old.hintOpacity   !== this.data.hintOpacity ||
        old.billboardHints!== this.data.billboardHints
    )) {
      this._refreshSideHint();
    }
  },

  remove(){
    if (this.data.cycleWithBY) {
      ['bbuttondown','ybuttondown'].forEach(e => this.el.removeEventListener(e, this.onBtn));
    }
    this.container?.remove();
    this._hint?.remove();
  },

  tick(){
    // billboard only if requested
    if (!this.data.billboardHints || !this._hint) return;
    const cam = this.el.sceneEl?.camera?.el;
    if (!cam?.object3D) return;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);
    this._hint.object3D?.lookAt(camPos);
  },

  // ---------- data prep ----------
  _prepareSizes(){
    const MIN_T = 0.001, MAX_T = 0.04;
    const raw = Array.isArray(this.data.sizes) ? this.data.sizes : (''+this.data.sizes).split(',');
    const nums = raw
      .map(x => +x)
      .filter(v => Number.isFinite(v) && v > 0)
      .map(v => Math.min(MAX_T, Math.max(MIN_T, v)));

    this._sizes = nums.slice(0, 4);
    if (!this._sizes.length) this._sizes = [0.01];

    const BAND = 0.0012;
    const tMin = Math.min(...this._sizes);
    const p    = 0.70;
    const R_MIN = BAND + 0.0008;
    const R_MAX = 0.030;

    const mapRadius = (t) => Math.min(R_MAX, R_MIN * Math.pow(Math.max(1, t/tMin), p));

    this._rings = this._sizes.map(t => {
      const rOuter = mapRadius(t);
      const rInner = Math.max(rOuter - BAND, 0.001);
      return { t, rOuter, rInner };
    });
  },

  // ---------- UI ----------
  _buildUI(){
    const zStep = 0.0015;
    const gap = 0.01;

    this.container = document.createElement('a-entity');
    this.container.setAttribute('position','0 -0.05 -0.055');
    this.container.setAttribute('rotation','90 0 0');
    this.el.appendChild(this.container);

    const positions = [];
    let x = 0;
    this._rings.forEach((r, i) => {
      if (i === 0) x = -r.rOuter;
      else {
        const prev = this._rings[i - 1];
        x += prev.rOuter + r.rOuter + gap;
      }
      positions.push(x);
    });
    const centerOffset = (positions[0] + positions[positions.length - 1]) / 2;
    for (let i = 0; i < positions.length; i++) positions[i] -= centerOffset;

    this.cells = this._rings.map((r,i)=>{
      const ring = document.createElement('a-ring');
      ring.setAttribute('radius-inner', r.rInner);
      ring.setAttribute('radius-outer', r.rOuter);
      ring.setAttribute('material','color:#E0E0E0;side:double;metalness:0;roughness:1');
      ring.object3D.position.set(positions[i], 0, i * zStep);
      this.container.appendChild(ring);
      return ring;
    });
  },

  _highlight(){
    this.cells?.forEach((ring,i)=> {
      ring.setAttribute('material',
        i===this.idx
          ? 'color:#D6D6D6;side:double;metalness:0;roughness:1'
          : 'color:#888;side:double;metalness:0;roughness:1'
      );
    });
    const t = this._rings[this.idx]?.t;
    if (t != null) {
      const brush = document.querySelector('[active-brush]');
      if (brush) brush.setAttribute('draw-line','thickness', t);
    }
  },

  onBtn(){
    if (!this._rings.length) return;
    this.idx = (this.idx+1)%this._rings.length;
    this._highlight();
  },

  // ---------- hint ----------
  _ensureSideHint(){
    if (this._hint && this._hint.isConnected) return this._hint;
    const p = document.createElement('a-plane');
    p.setAttribute('width',  this.data.hintSize);
    p.setAttribute('height', this.data.hintSize);
    const mat = this.data.imgHint
      ? `src:${this.data.imgHint}; side:double; transparent:true`
      : `color:${this.data.hintTint}; opacity:${this.data.hintOpacity}; transparent:true; side:double`;
    p.setAttribute('material', mat);
    this.el.appendChild(p);
    this._hint = p;
    return p;
  },

  _refreshSideHint(){
    const p = this._ensureSideHint();
    // size
    p.setAttribute('width',  this.data.hintSize);
    p.setAttribute('height', this.data.hintSize);
    // material
    const mat = this.data.imgHint
      ? `src:${this.data.imgHint}; side:double; transparent:true`
      : `color:${this.data.hintTint}; opacity:${this.data.hintOpacity}; transparent:true; side:double`;
    p.setAttribute('material', mat);
    // orientation / position unchanged; billboard handled in tick()
  },

  _placeSideHint(){
    if (!this._hint?.object3D) return;
    const sign = (this._handSide === 'right') ? +2 : -2;
    this._hint.object3D.position.set(sign * this.data.outerOffset, this.data.raise, this.data.forward);
    if (!this.data.billboardHints && this.data.faceOutward) {
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


// 6) COLOR-PICKER — rebuilds on colors change + robust parsing
AFRAME.registerComponent('color-picker',{
  schema:{
    colors:{ default:[
   '#f2f23a','#d8d835',  
  '#f4bd36','#d29930','#f58436','#d06430',   
  '#f45336','#d13230','#f33a3a','#d13636','#f3398c','#d13470',   
  '#f339f3','#d134d8','#9933f3','#7300d8','#3333f3','#0000d8',   
  '#3399f3','#0073d8','#33f339','#00d836',   
  '#99f339','#70d134'    
    ]},
    bgRadius:  { default: 0.11 },
    bgColor:   { default: '#ffffff' },
    bgOpacity: { default: 0.6 },
    faceDown:  { default: true },   // palette faces floor by default
    invertY:   { default: true }    // stick up -> visually up
  },

  init(){
    // Layout definition (unchanged)
    this.rowSizes=[2,4,6,6,4,2];
    this.rowStart=[0];
    this.rowSizes.forEach((_,i)=>{ if(i>0) this.rowStart.push(this.rowStart[i-1]+this.rowSizes[i-1]); });
    this._capacity = this.rowSizes.reduce((a,b)=>a+b,0);

    // State
    this.colors   = this._parseColors(this.data.colors).slice(0, this._capacity);
    if (this.colors.length === 0) this.colors = ['#ffffff']; // safety
    this.selected = 0;   // top-left
    this.canStep  = true;
    this.pressTh  = 0.5;
    this.releaseTh= 0.5;
    this.cellX=[]; this.cellY=[];
    this.ring = null;

    // Build container
    this.container=document.createElement('a-entity');
    this.container.setAttribute('position','0 -0.05 -0.16');
    this.container.setAttribute('rotation', this.data.faceDown ? '-90 0 0' : '90 0 0');
    this.el.appendChild(this.container);

    // Build UI
    this._addPaletteBackground();
    this._buildPalette();

    // Place ring over current selection after DOM is ready
    const place = () => this._applyColor(true);
    if (this.container.hasLoaded) place(); else this.container.addEventListener('loaded', place);
    if (this.ring) { if (this.ring.hasLoaded) place(); else this.ring.addEventListener('loaded', place); }
    requestAnimationFrame(place);

    // Input
    this.onThumb=this.onThumb.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumb);
  },

  // React to runtime changes (e.g., from spatial-marker)
  update(old){
    if (!old || !('colors' in old)) return;

    const prev = this._parseColors(old.colors).slice(0, this._capacity);
    const next = this._parseColors(this.data.colors).slice(0, this._capacity);
    if (this._arraysEqual(prev, next)) return;

    this.colors = next.length ? next : ['#ffffff'];

    // Preserve selection if possible
    this.selected = Math.min(this.selected, this.colors.length - 1);

    // Rebuild UI cleanly
    this.container?.remove();
    this.cellX = []; this.cellY = []; this.ring = null;

    this.container=document.createElement('a-entity');
    this.container.setAttribute('position','0 -0.05 -0.16');
    this.container.setAttribute('rotation', this.data.faceDown ? '-90 0 0' : '90 0 0');
    this.el.appendChild(this.container);

    this._addPaletteBackground();
    this._buildPalette();
    this._applyColor(true);
  },

  remove(){
    this.el.removeEventListener('thumbstickmoved', this.onThumb);
    this.container?.remove();
  },

  // ---------- palette building ----------
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
        const colStr = this.colors[idx] ?? '#888888';
        cell.setAttribute('radius', r);
        cell.setAttribute('segments', 32);
        cell.setAttribute('material', `color:${colStr}; side:double`);
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

  // ---------- input/navigation ----------
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

  _applyColor(){
    if (!this.ring) return;
    const x = this.cellX[this.selected] ?? 0;
    const y = this.cellY[this.selected] ?? 0;

    // Move ring now
    this.ring.setAttribute('position', `${x} ${y} 0.01`);
    if (this.ring.object3D) this.ring.object3D.position.set(x, y, 0.01);

    // Set brush color to selected swatch
    const brush=document.querySelector('[active-brush]');
    const color = this.colors[this.selected] ?? '#ffffff';
    if (brush) brush.setAttribute('draw-line','color', color);
  },

  // ---------- helpers ----------
  _arraysEqual(a,b){
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i=0;i<a.length;i++){
      if ((a[i]||'').trim() !== (b[i]||'').trim()) return false;
    }
    return true;
  },

  _parseColors(input){
    // Accept: array OR string (commas/spaces/newlines; optional quotes; #RGB or #RRGGBB)
    if (Array.isArray(input)) {
      return input.map(c=>this._normHex(c)).filter(Boolean);
    }
    if (typeof input === 'string') {
      return input
        .split(/,|\s+/)                       // commas OR whitespace
        .map(s => s.replace(/^['"]|['"]$/g,'')) // strip single/double quotes
        .map(c=>this._normHex(c))
        .filter(Boolean);
    }
    return [];
  },

  _normHex(x){
    if (!x) return null;
    let s = (''+x).trim();
    if (!s.startsWith('#')) return null;
    // #RGB => #RRGGBB
    const m3 = /^#([0-9a-fA-F]{3})$/.exec(s);
    if (m3){
      const [r,g,b] = m3[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    // #RRGGBB
    const m6 = /^#([0-9a-fA-F]{6})$/.exec(s);
    if (m6) return `#${m6[1].toLowerCase()}`;
    return null; // reject invalids (e.g., 8-digit with alpha)
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
    tick: function (delta) {
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
    enabled:           { default: true },  // <- NEW: opt-in tinting

    useEmissive:       { default: true },
    overrideBaseColor: { default: true },
    debug:             { default: false },

    emissiveFace:      { default: 0.30 },
    emissiveGrip:      { default: 0.00 }
  },

  init() {
    this._targets       = {a:[], b:[], x:[], y:[], grip:[]};
    this._original      = new Map();
    this._lastScheme    = null;
    this._reapplyFrames = 0;
    this._lastRootId    = null;

    // Bind
    this._onModelLoaded       = () => { this._collectTargets(); this._scheduleReapply(); };
    this._onObject3DSet       = () => { this._collectTargets(); this._scheduleReapply(); };
    this._onChildAttached     = () => { this._scheduleReapply(); };
    this._onChildDetached     = () => { this._scheduleReapply(); };
    this._onButtonStateChange = () => { this._scheduleReapply(); };

    // Listeners
    this.el.addEventListener('model-loaded', this._onModelLoaded);
    this.el.addEventListener('object3dset',  this._onObject3DSet);
    this.el.addEventListener('child-attached', this._onChildAttached);
    this.el.addEventListener('child-detached', this._onChildDetached);

    ['gripdown','gripup','abuttondown','abuttonup','bbuttondown','bbuttonup','xbuttondown','xbuttonup','ybuttondown','ybuttonup']
      .forEach(e => this.el.addEventListener(e, this._onButtonStateChange));

    if (this.el.getObject3D('mesh')) {
      this._collectTargets();
      this._scheduleReapply();
    }

    // scratch
    this._v = new THREE.Vector3();
    this._inv = new THREE.Matrix4();
  },

  update(old) {
    if (!old) return;

    // Toggle enable/disable at runtime
    if (old.enabled !== this.data.enabled) {
      if (!this.data.enabled) {
        // turning OFF: restore everything & stop future re-applies
        this.clearScheme();
        this._reapplyFrames = 0;
      } else {
        // turning ON: try to reapply current scheme
        this._scheduleReapply();
      }
    }
  },

  remove() {
    this.clearScheme();
    this.el.removeEventListener('model-loaded', this._onModelLoaded);
    this.el.removeEventListener('object3dset',  this._onObject3DSet);
    this.el.removeEventListener('child-attached', this._onChildAttached);
    this.el.removeEventListener('child-detached', this._onChildDetached);

    ['gripdown','gripup','abuttondown','abuttonup','bbuttondown','bbuttonup','xbuttondown','xbuttonup','ybuttondown','ybuttonup']
      .forEach(e => this.el.removeEventListener(e, this._onButtonStateChange));
  },

  tick() {
    if (!this.data.enabled) return;        // <- honor enabled
    if (this._reapplyFrames > 0) {
      this._reapplyFrames--;
      this._applyNow();
    }
  },

  // -------- Public API --------
  applyScheme(scheme) {
    this._lastScheme = scheme || null;
    if (!this.data.enabled) return;        // don't paint while disabled
    this._scheduleReapply();
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

  // -------- Internals --------
  _scheduleReapply(n = 6) {
    if (!this.data.enabled) return;        // <- honor enabled
    this._reapplyFrames = Math.max(this._reapplyFrames, n);
  },

  _applyNow() {
    if (!this.data.enabled) return;        // <- honor enabled
    const mesh = this.el.getObject3D('mesh');
    if (!mesh || !this._lastScheme) return;

    // If mesh root changed, forget old originals
    const rootId = mesh.uuid;
    if (this._lastRootId && this._lastRootId !== rootId) {
      this._original.clear();
      if (this.data.debug) console.log('[button-colorizer] mesh root changed; clearing originals cache');
    }
    this._lastRootId = rootId;

    // Refresh targets each time
    this._collectTargets();

    // Restore then apply
    this._restoreTintedOnly();
    const scheme = this._lastScheme;
    const equiv = { a:['a','x'], x:['x','a'], b:['b','y'], y:['y','b'], grip:['grip'] };

    Object.keys(scheme).forEach(key => {
      const hex = scheme[key];
      if (!hex) return;
      const keysToApply = equiv[key] || [key];
      keysToApply.forEach(k => {
        (this._targets[k] || []).forEach(node => this._tintNode(node, hex, k));
      });
    });

    // Fallback pairing if labels collapsed
    const faces = this._uniqueNodes([].concat(this._targets.a, this._targets.b, this._targets.x, this._targets.y));
    if (faces.length >= 2) {
      const needLeft  = (scheme.x || scheme.y);
      const needRight = (scheme.a || scheme.b);
      const missingLeft  = needLeft  && (this._targets.x.length === 0 || this._targets.y.length === 0);
      const missingRight = needRight && (this._targets.a.length === 0 || this._targets.b.length === 0);
      if (missingLeft || missingRight) {
        const side = this._getSide();
        const sorted = faces.map(n => ({ n, y: this._localY(n) })).sort((p,q) => q.y - p.y);
        const top    = sorted[0]?.n;
        const bottom = sorted[1]?.n;
        const topColor =
          (side === 'left')  ? (scheme.y) :
          (side === 'right') ? (scheme.b) : null;
        const botColor =
          (side === 'left')  ? (scheme.x) :
          (side === 'right') ? (scheme.a) : null;

        if (top && topColor)    this._tintNode(top, topColor, side === 'left' ? 'y' : 'b');
        if (bottom && botColor) this._tintNode(bottom, botColor, side === 'left' ? 'x' : 'a');
      }
    }
  },

  _uniqueNodes(arr) {
    const seen = new Set(); const out = [];
    arr.forEach(n => { if (n && !seen.has(n.uuid)) { seen.add(n.uuid); out.push(n); } });
    return out;
  },

  _localY(node) {
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

    const order = ['a','b','x','y','grip'];
    mesh.traverse(n => {
      if (!n.isMesh || !n.name) return;
      const name = n.name.toLowerCase().replace(/\s+/g, '');
      let matchedKey = null;
      for (const key of order) {
        if (key === 'grip') {
          if (name.includes('grip') || name.includes('squeeze')) { matchedKey = 'grip'; break; }
        } else if (this._btnMatch(name, key, n)) { matchedKey = key; break; }
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
    const pats = [
      `button_${letter}`, `${letter}_button`,
      `button-${letter}`, `${letter}-button`,
      `btn_${letter}`,    `btn-${letter}`,
      `button${letter}`,  `${letter}button`
    ];
    if (pats.some(p => name.includes(p))) return true;

    const extras = [
      `${letter}cap`, `cap_${letter}`, `${letter}-cap`,
      `${letter}face`, `face_${letter}`, `${letter}-face`
    ];
    if (extras.some(p => name.includes(p))) return true;

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
    return r > 0 && r < 0.05;
  },

  _tintNode(node, hex, whichKey) {
    if (!this._original.has(node.uuid)) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      this._original.set(node.uuid, mats);
      const cloned = mats.map(m => (m && m.clone) ? m.clone() : m);
      node.material = Array.isArray(node.material) ? cloned : cloned[0];
    }

    const matsNow = Array.isArray(node.material) ? node.material : [node.material];
    const isGrip  = (whichKey === 'grip');
    const emissiveIntensity = isGrip ? this.data.emissiveGrip : this.data.emissiveFace;

    matsNow.forEach(m => {
      if (!m) return;
      if (this.data.overrideBaseColor && m.color) m.color.set(hex);

      if (this.data.useEmissive && 'emissive' in m) {
        if (emissiveIntensity > 0) {
          m.emissive.set(hex);
          if ('emissiveIntensity' in m) m.emissiveIntensity = emissiveIntensity;
        } else {
          m.emissive.set(0x000000);
          if ('emissiveIntensity' in m) m.emissiveIntensity = 0;
        }
      }
      m.needsUpdate = true;
    });
  }
});
