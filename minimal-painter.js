
// 1) PAINTING-AREA-CONTROLLER (updated to end strokes on exit)
AFRAME.registerComponent('painting-area-controller', {
  init() {
    this.area      = document.querySelector('#paintingArea');
    this.leftHand  = document.getElementById('left-hand');
    this.rightHand = document.getElementById('right-hand');
    this.inside    = false;

    // Reuse objects to avoid allocations each frame
    this._rigPos = new THREE.Vector3();
    this._box    = new THREE.Box3();
  },

  tick() {
    if (!this.area || !this.area.object3D) return;

    // Rig position (the component sits on #rig)
    this.el.object3D.getWorldPosition(this._rigPos);

    // Is rig inside the painting area’s bounds?
    const nowInside = this._box
      .setFromObject(this.area.object3D)
      .containsPoint(this._rigPos);

    if (nowInside === this.inside) return;

    this.inside = nowInside;
    if (nowInside) this.enablePainting();
    else           this.disablePainting();   // <- will hard-stop any active stroke
  },

  enablePainting() {
    const painter = document.querySelector('[active-brush]');
    if (!painter) return;

    const palette = (painter === this.leftHand) ? this.rightHand : this.leftHand;
    const dl      = painter.components['draw-line'];

    if (dl) {
      // refresh tip color + show tip
      dl.indicator.material.color.set(dl.data.color);
      dl.indicator.visible = true;
      // allow input again
      dl.enableInput();
    }

    // show UI
    painter.setAttribute('size-picker','');
    if (palette) palette.setAttribute('color-picker','');
  },

  disablePainting() {
    const painter = document.querySelector('[active-brush]');
    const palette = (painter === this.leftHand) ? this.rightHand : this.leftHand;
    const dl      = painter && painter.components['draw-line'];

    if (dl) {
      // If a stroke is in progress, end it immediately so TubeGeometry stops updating.
      if (dl.drawing) dl.stopLine();
      dl.disableInput();              // remove listeners
      dl.indicator.visible = false;   // hide tip
    }

    // hide UI
    if (painter) painter.removeAttribute('size-picker');
    if (palette) palette.removeAttribute('color-picker');
  }
});


AFRAME.registerComponent('paint-tool-reset', {
  init() {
    this.leftHand     = document.getElementById('left-hand');
    this.rightHand    = document.getElementById('right-hand');
    this.onGrip       = this.onGrip.bind(this);
    // locomotion config (matches your HTML schema)
    this.movementAttr = { rig: '#rig', speed: 0.2 };
    this.currentSide  = null;

    // Listen for grip presses on both hands
    this.leftHand .addEventListener('gripdown', this.onGrip);
    this.rightHand.addEventListener('gripdown', this.onGrip);

    // Default to right-hand on load (force=true skips same-side no-op)
    this.assignTools('right', /* force */ true);
  },

  onGrip(evt) {
    const side = (evt.currentTarget.id === 'left-hand') ? 'left' : 'right';
    this.assignTools(side);
  },

  assignTools(side, force = false) {
    // If it’s the same hand and not forced, do nothing
    if (!force && side === this.currentSide) return;
    this.currentSide = side;

    const painter = (side === 'left') ? this.leftHand : this.rightHand;
    const palette = (side === 'left') ? this.rightHand : this.leftHand;

    // 1) CLEAN UP both hands
    [ this.leftHand, this.rightHand ].forEach(hand => {
      const dlComp = hand.components['draw-line'];
      if (dlComp) {
        dlComp.disableInput();
        // remove any old sphere-indicator mesh
        hand.object3D.remove(dlComp.indicator);
        dlComp.indicator.geometry.dispose();
        dlComp.indicator.material.dispose();
      }
      hand.removeAttribute('draw-line');
      hand.removeAttribute('active-brush');
      hand.removeAttribute('size-picker');
      hand.removeAttribute('color-picker');
      hand.removeAttribute('oculus-thumbstick-controls');
    });

    // 2) ADD locomotion + draw-line + mark this as the brush
    painter.setAttribute('oculus-thumbstick-controls', this.movementAttr);
    painter.setAttribute(
      'draw-line',
      'color:#EF2D5E; thickness:0.02; minDist:0.005'
    );
    painter.setAttribute('active-brush','');

    // Disable and hide its sphere until the zone tells us to show
    const dl = painter.components['draw-line'];
    if (dl) {
      dl.disableInput();
      dl.indicator.visible = false;
    }

    // 3) IF WE’RE ALREADY IN THE PAINT ZONE, re-enable UI & drawing
    const paintCtrl = this.el.components['painting-area-controller'];
    if (paintCtrl && paintCtrl.inside) {
      paintCtrl.enablePainting();
    }
  },

  remove() {
    this.leftHand .removeEventListener('gripdown', this.onGrip);
    this.rightHand.removeEventListener('gripdown', this.onGrip);
  }
});

AFRAME.registerComponent('hand-swapper', {
  init() {
    this.leftHand  = document.getElementById('left-hand');
    this.rightHand = document.getElementById('right-hand');
    // motion‐stick config, as an object
    this.thumbAttr = { rig: '#rig', speed: 0.2 };

    this.onGrip = this.onGrip.bind(this);
    this.leftHand .addEventListener('gripdown', this.onGrip);
    this.rightHand.addEventListener('gripdown', this.onGrip);

    // start on right by default
    this.activate('right');
  },
  onGrip(evt) {
    // evt.currentTarget is the hand entity
    const side = evt.currentTarget.id === 'left-hand' ? 'left' : 'right';
    this.activate(side);
  },
  activate(side) {
    // 1) remove ALL paint/move attributes from both hands
    [this.leftHand, this.rightHand].forEach(h => {
      h.removeAttribute('oculus-thumbstick-controls');
      h.removeAttribute('draw-line');
      h.removeAttribute('size-picker');
      h.removeAttribute('color-picker');
      h.removeAttribute('active-brush');
    });

    // 2) decide which is painter vs. palette
    const painter = side === 'left' ? this.leftHand : this.rightHand;
    const palette = side === 'left' ? this.rightHand : this.leftHand;

    // 3) give painter movement + draw + size + mark it
    painter.setAttribute('oculus-thumbstick-controls', this.thumbAttr);
    painter.setAttribute(
      'draw-line',
      'color:#EF2D5E; thickness:0.02; minDist:0.005'
    );
    painter.setAttribute('size-picker','');
    painter.setAttribute('active-brush','');    // for pickers to find it

    // start disabled until zone says otherwise
    const dl = painter.components['draw-line'];
    if (dl) dl.disableInput();

    // if we’re already inside when we swapped, re-enable immediately
    const paintCtrl = this.el.components['painting-area-controller'];
    if (paintCtrl && paintCtrl.inside && dl) {
      dl.enableInput();
    }

    // 4) other hand just gets the color-picker
    palette.setAttribute('color-picker','');
  },
  remove() {
    this.leftHand .removeEventListener('gripdown', this.onGrip);
    this.rightHand.removeEventListener('gripdown', this.onGrip);
  }
});


// 3) DRAW-LINE
// 3) DRAW-LINE  (updated: auto-stop if tip leaves #paintingArea)
AFRAME.registerComponent('draw-line', {
  schema: {
    color:     { type:'color',    default:'#EF2D5E' },
    thickness: { type:'number',   default:0.02 },
    minDist:   { type:'number',   default:0.005 },
    tipOffset: { type:'number',   default:0.05 },
    // New: which area bounds to respect (can be overridden per-hand)
    area:      { type:'selector', default:'#paintingArea' },
    // New: if true, refuse to start or continue outside the area
    clipToArea:{ type:'boolean',  default:true }
  },

  init() {
    const THREE = AFRAME.THREE, d = this.data;

    this.points      = [];
    this.drawing     = false;
    this.currentMesh = null;
    this.drawn       = [];

    // tip indicator
    const geo = new THREE.SphereGeometry(d.thickness,16,16);
    const mat = new THREE.MeshBasicMaterial({ color:d.color, transparent:true, opacity:0.5 });
    this.indicator = new THREE.Mesh(geo,mat);
    this.indicator.frustumCulled = false;
    this.indicator.position.set(0,0,-d.tipOffset);
    this.el.object3D.add(this.indicator);

    // scratch objects (avoid GC)
    this._tmpWorld = new THREE.Vector3();
    this._box      = new THREE.Box3();

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
      this.indicator.geometry = new THREE.SphereGeometry(d.thickness,16,16);
    }
    if (old.color!==d.color) {
      this.indicator.material.color.set(d.color);
    }
    if (old.tipOffset!==d.tipOffset) {
      this.indicator.position.set(0,0,-d.tipOffset);
    }
  },

  // --- helpers --------------------------------------------------------------
  _tipWorldPosition(out) {
    // indicator is parented to the controller; works even when invisible
    this.indicator.getWorldPosition(out);
    return out;
  },
  _tipInsideArea() {
    if (!this.data.clipToArea) return true;
    const areaEl = this.data.area;
    if (!areaEl || !areaEl.object3D) return true; // fail-open
    this._box.setFromObject(areaEl.object3D);
    this._tipWorldPosition(this._tmpWorld);
    return this._box.containsPoint(this._tmpWorld);
  },

  // --- drawing lifecycle ----------------------------------------------------
  startLine() {
    // Don’t allow starting outside the area
    if (!this._tipInsideArea()) return;

    this.drawing = true;
    this.points.length = 0;
    this.indicator.visible = false;

    const mat = new AFRAME.THREE.MeshBasicMaterial({
      color:this.data.color, side:AFRAME.THREE.FrontSide
    });
    this.currentMesh = new AFRAME.THREE.Mesh(
      new AFRAME.THREE.BufferGeometry(), mat
    );
    this.currentMesh.frustumCulled = false;
    this.el.sceneEl.object3D.add(this.currentMesh);
  },

  stopLine() {
    if (!this.drawing) return;

    this.drawing = false;
    this.indicator.visible = true;
    if (!this.points.length) {
      // clean up empty mesh if any
      if (this.currentMesh) {
        this.el.sceneEl.object3D.remove(this.currentMesh);
        this.currentMesh.geometry.dispose();
        this.currentMesh.material.dispose();
      }
      this.currentMesh = null;
      return;
    }

    const capGeo = new AFRAME.THREE.SphereGeometry(this.data.thickness,8,8);
    const capMat = new AFRAME.THREE.MeshBasicMaterial({color:this.data.color});
    const startCap = new AFRAME.THREE.Mesh(capGeo,capMat);
    const endCap   = new AFRAME.THREE.Mesh(capGeo,capMat);
    startCap.position.copy(this.points[0]);
    endCap.position.copy(this.points[this.points.length-1]);
    this.el.sceneEl.object3D.add(startCap,endCap);

    this.drawn.push({ tube:this.currentMesh, startCap, endCap });
    this.currentMesh = null;
  },

  deleteLast() {
    const last = this.drawn.pop();
    if (!last) return;
    [last.tube, last.startCap, last.endCap].forEach(m=>{
      this.el.sceneEl.object3D.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
  },

  tick() {
    // If not currently drawing, nothing to update
    if (!this.currentMesh) return;

    // If we left the area mid-stroke, **stop immediately**
    if (!this._tipInsideArea()) {
      this.stopLine();
      return;
    }

    // Continue building the tube while inside
    const pos = this._tipWorldPosition(this._tmpWorld);
    const last = this.points[this.points.length-1];

    if (!last || last.distanceTo(pos) > this.data.minDist) {
      this.points.push(pos.clone());
    } else {
      return;
    }

    if (this.points.length < 2) return;

    const curve = new AFRAME.THREE.CatmullRomCurve3(this.points);
    const segs  = Math.max(this.points.length*4, 16);
    const geo   = new AFRAME.THREE.TubeGeometry(curve, segs, this.data.thickness, 8, false);

    // replace geometry in-place
    this.currentMesh.geometry.dispose();
    this.currentMesh.geometry = geo;
    this.currentMesh.material.color.set(this.data.color);
  },

  // --- input gating ---------------------------------------------------------
  disableInput() {
    // If someone disables input mid-stroke, stop it cleanly.
    if (this.drawing) this.stopLine();

    this.el.removeEventListener('triggerdown', this._onTriggerDown);
    this.el.removeEventListener('triggerup',   this._onTriggerUp);

    const canvas = this.el.sceneEl && this.el.sceneEl.canvas;
    if (canvas) {
      canvas.removeEventListener('mousedown', this._onMouseDown);
      canvas.removeEventListener('contextmenu', this._onContext);
    }
    window.removeEventListener('mouseup', this._onMouseUp);

    this.el.removeEventListener('abuttondown', this._onDelete);
    this.el.removeEventListener('xbuttondown', this._onDelete);
    this.indicator.visible = false;
  },

  enableInput() {
    this.el.addEventListener('triggerdown', this._onTriggerDown);
    this.el.addEventListener('triggerup',   this._onTriggerUp);

    const canvas = this.el.sceneEl && this.el.sceneEl.canvas;
    if (canvas) {
      canvas.addEventListener('mousedown', this._onMouseDown);
      canvas.addEventListener('contextmenu', this._onContext);
    }
    window.addEventListener('mouseup', this._onMouseUp);

    this.el.addEventListener('abuttondown', this._onDelete);
    this.el.addEventListener('xbuttondown', this._onDelete);
    this.indicator.visible = true;
  }
});



// 4) SIZE-PICKER
AFRAME.registerComponent('size-picker',{
  schema:{ sizes:{ default:[0.0025,0.005,0.01,0.02] }},
  init(){
    this.idx=0; this._buildUI(); this._highlight();
    this.onBtn = this.onBtn.bind(this);
    ['bbuttondown','ybuttondown'].forEach(evt=>
      this.el.addEventListener(evt, this.onBtn)
    );
  },
  onBtn(){
    this.idx = (this.idx+1)%this.data.sizes.length;
    this._highlight();
  },
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
      ring.setAttribute('material','color:#888;side:double');
      ring.object3D.position.set((i-(radii.length-1)/2)*gap,0,0);
      this.container.appendChild(ring);
      return ring;
    });
  },
  _highlight(){
    this.cells.forEach((ring,i)=> {
      ring.setAttribute(
        'material',
        i===this.idx?'color:#FFF;side:double':'color:#888;side:double'
      );
    });
    const t=this.data.sizes[this.idx];
    // apply to whichever hand is marked active-brush
    const brush = document.querySelector('[active-brush]');
    if (brush) brush.setAttribute('draw-line','thickness',t);
  },
  remove(){
    ['bbuttondown','ybuttondown'].forEach(evt=>
      this.el.removeEventListener(evt,this.onBtn)
    );
    this.container.remove();
  }
});


// 5) COLOR-PICKER
AFRAME.registerComponent('color-picker',{
  schema:{ colors:{ default:[
    '#ff0000','#ff4000','#ff8000','#ffbf00',
    '#ffff00','#bfff00','#80ff00','#40ff00',
    '#00ff00','#00ff40','#00ff80','#00ffbf',
    '#00ffff','#00bfff','#0080ff','#0040ff',
    '#0000ff','#4000ff','#8000ff','#bf00ff',
    '#ff00ff','#ff00bf','#ff0080','#ff0040'
  ]}},
  init(){
    this.rowSizes=[2,4,6,6,4,2];
    this.rowStart=[0];
    this.rowSizes.forEach((sz,i)=>{
      if(i>0) this.rowStart.push(this.rowStart[i-1]+this.rowSizes[i-1]);
    });
    this.colors = this.data.colors.slice(0,this.rowSizes.reduce((a,b)=>a+b,0));
    this.selected=0; this.canStep=true;
    this.pressTh=0.5; this.releaseTh=0.5;
    this.cellX=[]; this.cellY=[];
    this.container=document.createElement('a-entity');
    this.container.setAttribute('rotation','90 0 0');
    this.container.setAttribute('position','0 -0.05 -0.16');
    this.el.appendChild(this.container);
    this._addPaletteModel();
    this._buildPalette();
    this._applyColor();
    this.onThumb=this.onThumb.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumb);
  },
  _addPaletteModel(){
    const bg=document.createElement('a-entity');
    bg.setAttribute('gltf-model','Assets/Palette.glb');
    bg.setAttribute('portal-effect','');
    bg.setAttribute('scale','0.15 0.15 0.15');
    bg.setAttribute('position','0 0 0.007');
    bg.setAttribute('rotation','-90 0 0');
    this.container.appendChild(bg);
  },
  _buildPalette(){
    const gap=0.03, r=0.015;
    let idx=0;
    this.rowSizes.forEach((count,row)=>{
      const y=((this.rowSizes.length-1)/2-row)*gap;
      for(let col=0;col<count;col++,idx++){
        const x=(col-(count-1)/2)*gap;
        this.cellX.push(x);
        this.cellY.push(y);
        const cell=document.createElement('a-circle');
        cell.setAttribute('radius',r);
        cell.setAttribute('segments',16);
        cell.setAttribute('material',`color:${this.colors[idx]};side:double`);
        cell.setAttribute('position',`${x} ${y} 0`);
        this.container.appendChild(cell);
      }
    });
    const ring=document.createElement('a-ring');
    ring.setAttribute('radius-inner',r*0.8);
    ring.setAttribute('radius-outer',r*1.2);
    ring.setAttribute('material','color:#fff;side:double');
    ring.setAttribute('position','0 0 -0.01');
    this.container.appendChild(ring);
  },
  _findRow(idx){
    for(let r=0;r<this.rowSizes.length;r++){
      const start=this.rowStart[r];
      if(idx<start+this.rowSizes[r]) return r;
    }
    return 0;
  },
  onThumb(evt){
    const x=evt.detail.x, y=evt.detail.y;
    if(!this.canStep){
      if(Math.abs(x)<this.releaseTh && Math.abs(y)<this.releaseTh)
        this.canStep=true;
      return;
    }
    if      (y> this.pressTh) this._moveVert(-1);
    else if (y< -this.pressTh) this._moveVert( 1);
    else if (x> this.pressTh) this._moveHoriz( 1);
    else if (x< -this.pressTh) this._moveHoriz(-1);
    else return;
    this._applyColor();
    this.canStep=false;
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
    const frac= sz>1? col/(sz-1) : 0;
    const nr=(r+dir+this.rowSizes.length)%this.rowSizes.length;
    const nsz=this.rowSizes[nr];
    const newCol=Math.round(frac*(nsz-1));
    this.selected = this.rowStart[nr] + newCol;
  },
  _applyColor(){
    const ring=this.container.querySelector('a-ring');
    ring.object3D.position.set(
      this.cellX[this.selected],
      this.cellY[this.selected],
      0.01
    );
    const brush=document.querySelector('[active-brush]');
    if (brush) brush.setAttribute('draw-line','color',this.colors[this.selected]);
  },
  remove(){
    this.el.removeEventListener('thumbstickmoved', this.onThumb);
    this.container.remove();
  }
});

AFRAME.registerComponent('oculus-thumbstick-controls', {
  schema: {
    // Movement tuning
    acceleration: { default: 25 },          // how quickly we accelerate
    deadzone:     { default: 0.20 },        // thumbstick deadzone (0..1)
    easing:       { default: 1.1 },         // higher = more damping

    // Axes (world axes on the rig)
    adAxis: { default: 'x', oneOf: ['x','y','z'] },  // left/right
    wsAxis: { default: 'z', oneOf: ['x','y','z'] },  // forward/back

    // Feature toggles
    enabled:      { default: true },
    adEnabled:    { default: true },
    adInverted:   { default: false },
    wsEnabled:    { default: true },
    wsInverted:   { default: false },
    fly:          { default: false },            // if true, allow Y motion
    onlyActiveBrush: { default: true },          // require active-brush on this hand

    // Where to move (accepts either 'rig' or legacy 'rigSelector')
    rig:         { default: '#rig' },
    rigSelector: { default: '' } // legacy alias; if set, overrides rig
  },

  init: function () {
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.tsData   = new THREE.Vector2(0, 0);

    // helper: is this hand currently allowed to drive movement?
    this._isActive = () => {
      return this.data.enabled && (!this.data.onlyActiveBrush || this.el.hasAttribute('active-brush'));
    };

    // Bind handlers
    this.thumbstickMoved = this.thumbstickMoved.bind(this);
    this.el.addEventListener('thumbstickmoved', this.thumbstickMoved);
  },

  update: function () {
    // Support both 'rig' (new) and 'rigSelector' (legacy) props.
    const sel = this.data.rigSelector || this.data.rig || '#rig';
    this.rigElement =
      (sel && document.querySelector(sel)) ||
      document.querySelector('#rig') ||
      this.el.sceneEl; // ultra-fallback, shouldn't be needed
  },

  remove: function () {
    this.el.removeEventListener('thumbstickmoved', this.thumbstickMoved);
  },

  thumbstickMoved: function (evt) {
    const { deadzone, adEnabled, wsEnabled } = this.data;

    // Read raw values
    let x = evt.detail.x || 0;
    let y = evt.detail.y || 0;

    // Deadzone: zero-out tiny inputs
    const mag = Math.hypot(x, y);
    if (mag < deadzone) { x = 0; y = 0; }

    // Only capture input if this hand is the mover
    if (!this._isActive()) return;

    // Respect axis enables
    if (!adEnabled) x = 0;
    if (!wsEnabled) y = 0;

    // Store for tick
    this.tsData.set(x, y);

    // Swallow event so no other component (e.g. snap-turn) rotates the camera
    if (evt.stopImmediatePropagation) evt.stopImmediatePropagation();
    if (evt.stopPropagation)          evt.stopPropagation();
    if (evt.preventDefault)           evt.preventDefault();
  },

  tick: function (time, deltaMs) {
    if (!this._isActive()) return;
    if (!this.rigElement)  return;
    if (!this.el.sceneEl || !this.el.sceneEl.is('vr-mode')) return;

    const delta = deltaMs / 1000;
    if (delta > 0.2) {
      // Too slow a frame → avoid physics explosions
      this.velocity.set(0, 0, 0);
      return;
    }

    // Update velocity from thumbstick
    this.updateVelocity(delta);

    const d = this.data;
    const v = this.velocity;

    if (!v[d.adAxis] && !v[d.wsAxis]) return;

    // Convert (x,z) velocity into camera-heading space, keep planar unless fly=true
    const move = this.getMovementVector(delta);
    if (!d.fly) move.y = 0;

    // Apply translation to rig
    this.rigElement.object3D.position.add(move);
  },

  updateVelocity: function (delta) {
    const d = this.data;
    const v = this.velocity;

    // Easing/damping (frame-rate independent)
    const scaledEasing = Math.pow(1 / (d.easing || 1.1), delta * 60);
    v[d.adAxis] *= scaledEasing;
    v[d.wsAxis] *= scaledEasing;

    // Clamp near-zero to zero
    const CLAMP = 0.00001;
    if (Math.abs(v[d.adAxis]) < CLAMP) v[d.adAxis] = 0;
    if (Math.abs(v[d.wsAxis]) < CLAMP) v[d.wsAxis] = 0;

    if (!d.enabled) return;

    // Accumulate acceleration from stick
    if (this.tsData.x) {
      const s = d.adInverted ? -1 : 1;
      v[d.adAxis] += s * d.acceleration * this.tsData.x * delta;
    }
    if (this.tsData.y) {
      const s = d.wsInverted ? -1 : 1;
      v[d.wsAxis] += s * d.acceleration * this.tsData.y * delta;
    }
  },

  // Rotate movement by camera yaw (NOT rotating the rig—just the vector)
  getMovementVector: (function () {
    const dir = new THREE.Vector3();
    const rot = new THREE.Euler(0, 0, 0, 'YXZ');
    return function (delta) {
      const d = this.data;
      const v = this.velocity;

      dir.set(0, 0, 0);
      dir[d.adAxis] = v[d.adAxis] * delta; // left/right
      dir[d.wsAxis] = -v[d.wsAxis] * delta; // forward is negative Z stick by convention

      // Use camera yaw to define "forward"
      const cam = this.el.sceneEl && this.el.sceneEl.camera && this.el.sceneEl.camera.el;
      const yaw = cam ? cam.object3D.rotation.y : 0;
      const pitch = d.fly ? (cam ? cam.object3D.rotation.x : 0) : 0;

      rot.set(pitch, yaw, 0);
      dir.applyEuler(rot);
      return dir;
    };
  })()
});
