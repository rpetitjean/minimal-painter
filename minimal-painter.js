

// 1) PAINTING-AREA-CONTROLLER (auto-release when outside area)
AFRAME.registerComponent('painting-area-controller', {
  schema: {
    // Use class .paintingArea by default. >
    areaSelector: { default: '.paintingArea' }
  },

  init() {
    this.areas     = Array.from(document.querySelectorAll(this.data.areaSelector));
    this.leftHand  = document.getElementById('left-hand');
    this.rightHand = document.getElementById('right-hand');
    this.inside    = false;

    // scratch
    this._rigPos = new THREE.Vector3();
    this._box    = new THREE.Box3();

    if (!this.areas.length) {
      console.warn('[painting-area-controller] No areas found for selector:', this.data.areaSelector);
    }
  },

  tick() {
    if (!this.areas.length) return;

    // Rig world position
    this.el.object3D.getWorldPosition(this._rigPos);

   
    let nowInside = false;
    for (let i = 0; i < this.areas.length; i++) {
      const area = this.areas[i];
      if (!area || !area.object3D) continue;
      this._box.setFromObject(area.object3D);
      if (this._box.containsPoint(this._rigPos)) {
        nowInside = true;
        break;
      }
    }

    // While outside, force-stop any active stroke every frame.
    if (!nowInside) this._forceReleaseBothHands();

    // Handle enter/leave once
    if (nowInside === this.inside) return;
    this.inside = nowInside;
    if (nowInside) this.enablePainting();
    else           this.disablePainting();
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
    painter.setAttribute('size-picker','');
    if (palette) palette.setAttribute('color-picker','');
  },

  disablePainting() {
    const painter = document.querySelector('[active-brush]');
    const palette = (painter === this.leftHand) ? this.rightHand : this.leftHand;
    const dl      = painter && painter.components['draw-line'];

    // End stroke on current painter if any
    if (dl) {
      if (dl.drawing) dl.stopLine();
      dl.disableInput();
      dl.indicator.visible = false;
    }

    if (painter) painter.removeAttribute('size-picker');
    if (palette) palette.removeAttribute('color-picker');

    // Extra safety: also stop the other hand (in case of desync)
    this._forceReleaseBothHands();
  },

  // --- helper: finish the stroke on BOTH hands immediately ---
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


AFRAME.registerComponent('paint-tool-reset', {
  init() {
    this.leftHand     = document.getElementById('left-hand');
    this.rightHand    = document.getElementById('right-hand');
    this.onGrip       = this.onGrip.bind(this);

    // locomotion config
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
AFRAME.registerComponent('draw-line', {
  schema: {
    color:     { type:'color',  default:'#EF2D5E' },
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


// 4) SIZE-PICKER — button hints tuned: +0.5cm lift, side grip placement
AFRAME.registerComponent('size-picker',{
  schema:{
    sizes:{ default:[0.0025,0.005,0.01,0.02] },

    // Hint styling
    hintSize:     { default: '0.028 0.012' }, // w h
    hintBg:       { default: '#111' },
    hintOpacity:  { default: 0.9 },
    hintTextW:    { default: 1.6 },

    // Placement behavior
    useModelAnchors: { default: true },
    billboardHints:  { default: true },

    // Lifts (meters): top buttons use Y, grip uses ±X (outward)
    hintLiftTop:  { default: 0.005 }, // 0.5 cm above A/B/X/Y
    hintLiftSide: { default: 0.005 }, // 0.5 cm out from grip side

    // Fallback local-space positions (meters) if button nodes aren't found
    // RIGHT HAND
    rA:    { default: '0.021 0.035 -0.030' }, // near A
    rB:    { default: '-0.014 0.045 -0.030' },// near B
    rGrip: { default: '0.030 0.010 0.000' },  // side (outer, +X)
    // LEFT HAND (mirrored)
    lX:    { default: '-0.021 0.035 -0.030' },// near X
    lY:    { default: '0.014 0.045 -0.030' }, // near Y
    lGrip: { default: '-0.030 0.010 0.000' }  // side (outer, -X)
  },

  init(){
    // --- size UI (as before) ---
    this.idx = 0;
    this._buildUI();
    this._highlight();

    // --- button hints ---
    this._planes = [];
    this._handSide = this._getHandSide(); // 'right' | 'left'

    const ready = () => this._buildHints();
    if (this.el.hasLoaded) ready(); else this.el.addEventListener('loaded', ready);
    this.el.addEventListener('model-loaded', () => this._rebuildHints());

    // Cycle sizes with B / Y as before
    this.onBtn = this.onBtn.bind(this);
    ['bbuttondown','ybuttondown'].forEach(evt => this.el.addEventListener(evt, this.onBtn));
  },

  remove(){
    ['bbuttondown','ybuttondown'].forEach(evt => this.el.removeEventListener(evt, this.onBtn));
    if (this.container) this.container.remove();
    this._clearPlanes();
  },

  tick(){
    if (!this.data.billboardHints || !this._planes.length) return;
    const cam = this.el.sceneEl && this.el.sceneEl.camera && this.el.sceneEl.camera.el;
    if (!cam || !cam.object3D) return;
    const camPos = new THREE.Vector3();
    cam.object3D.getWorldPosition(camPos);
    this._planes.forEach(p => p.object3D && p.object3D.lookAt(camPos));
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
      ring.setAttribute('material','color:#888;side:double');
      ring.object3D.position.set((i-(radii.length-1)/2)*gap,0,0);
      this.container.appendChild(ring);
      return ring;
    });
  },

  _highlight(){
    this.cells.forEach((ring,i)=> {
      ring.setAttribute('material', i===this.idx ? 'color:#FFF;side:double' : 'color:#888;side:double');
    });
    const t = this.data.sizes[this.idx];
    const brush = document.querySelector('[active-brush]');
    if (brush) brush.setAttribute('draw-line','thickness', t);
  },

  onBtn(){
    this.idx = (this.idx+1)%this.data.sizes.length;
    this._highlight();
  },

  // ---------- hints ----------
  _rebuildHints(){
    this._clearPlanes();
    this._buildHints();
  },

  _clearPlanes(){
    this._planes.forEach(p => p.remove());
    this._planes.length = 0;
  },

  _buildHints(){
    const isRight = this._handSide === 'right';
    const leftLabel  = isRight ? 'B' : 'Y';
    const rightLabel = isRight ? 'A' : 'X';
    const gripLabel  = 'GRIP';

    const aNode = this.data.useModelAnchors ? this._findButtonNode(isRight ? 'A' : 'X') : null;
    const bNode = this.data.useModelAnchors ? this._findButtonNode(isRight ? 'B' : 'Y') : null;
    const gNode = this.data.useModelAnchors ? this._findGripNode() : null;

    const leftPlane  = this._makeHintPlane(leftLabel);
    const rightPlane = this._makeHintPlane(rightLabel);
    const gripPlane  = this._makeHintPlane(gripLabel);

    // A / X — top lift on Y
    if (aNode) this._attachWithLift(rightPlane, aNode, 'y', this.data.hintLiftTop);
    else       this._fallbackTop(rightPlane, isRight ? this.data.rA : this.data.lX);

    // B / Y — top lift on Y
    if (bNode) this._attachWithLift(leftPlane, bNode, 'y', this.data.hintLiftTop);
    else       this._fallbackTop(leftPlane, isRight ? this.data.rB : this.data.lY);

    // GRIP — side lift on ±X (outward)
    if (gNode) this._attachWithLift(gripPlane, gNode, 'x', isRight ?  this.data.hintLiftSide : -this.data.hintLiftSide);
    else       this._fallbackSide(gripPlane, isRight ? this.data.rGrip : this.data.lGrip, isRight ?  this.data.hintLiftSide : -this.data.hintLiftSide);

    this._planes.push(leftPlane, rightPlane, gripPlane);
  },

  _makeHintPlane(label){
    const [w,h] = this.data.hintSize.split(' ').map(parseFloat);
    const p = document.createElement('a-plane');
    p.setAttribute('width',  w);
    p.setAttribute('height', h);
    p.setAttribute('material', `color:${this.data.hintBg}; opacity:${this.data.hintOpacity}; transparent:true; side:double`);
    const t = document.createElement('a-entity');
    t.setAttribute('text', `value:${label}; align:center; color:#fff; width:${this.data.hintTextW}`);
    t.setAttribute('position', '0 0 0.001');
    p.appendChild(t);
    // attach to controller root for now; we may reparent below
    this.el.appendChild(p);
    return p;
  },

  _attachWithLift(plane, node, axis, lift){
    node.add(plane.object3D);
    // clear any previous transform relative to old parent
    plane.object3D.position.set(0,0,0);
    plane.object3D.rotation.set(0,0,0);
    if (axis === 'y') plane.object3D.position.y += lift;           // raise above surface
    else if (axis === 'x') plane.object3D.position.x += lift;       // push outward on side
  },

  _fallbackTop(plane, triplet){
    const [x,y,z] = triplet.split(' ').map(parseFloat);
    // add top lift on Y
    plane.object3D.position.set(x, y + this.data.hintLiftTop, z);
    this.el.object3D.add(plane.object3D);
  },

  _fallbackSide(plane, triplet, outward){
    const [x,y,z] = triplet.split(' ').map(parseFloat);
    // push outward along ±X (outer side of controller)
    plane.object3D.position.set(x + outward, y, z);
    this.el.object3D.add(plane.object3D);
  },

  _getHandSide(){
    const mtc = this.el.getAttribute('meta-touch-controls');
    if (mtc && mtc.hand) return mtc.hand;
    const id = (this.el.id||'').toLowerCase();
    if (id.includes('right')) return 'right';
    if (id.includes('left'))  return 'left';
    return 'right';
  },

  _findButtonNode(letter){
    const wanted = letter.toLowerCase(); // 'a','b','x','y'
    const patterns = [
      `button_${wanted}`, `${wanted}_button`, `button-${wanted}`, `button${wanted}`,
      `${wanted}button`, `btn_${wanted}`, `btn-${wanted}`, `key_${wanted}`, `${wanted}`
    ];
    let hit = null;
    if (!this.el.object3D) return null;
    this.el.object3D.traverse(n=>{
      if (hit || !n.name) return;
      const name = n.name.toLowerCase().replace(/\s+/g,'');
      const ok = patterns.some(p => name.includes(p)) ||
                 (name.includes('button') && name.includes(wanted));
      if (ok) hit = n;
    });
    return hit;
  },

  _findGripNode(){
    // look for nodes with 'grip' or 'squeeze' in the name
    let hit = null;
    if (!this.el.object3D) return null;
    this.el.object3D.traverse(n=>{
      if (hit || !n.name) return;
      const name = n.name.toLowerCase();
      if (name.includes('grip') || name.includes('squeeze')) hit = n;
    });
    return hit;
  }
});



// 5) COLOR-PICKER (starts ring on defaultColor reliably + correct UP/DOWN)
// 5) COLOR-PICKER — start ring at top-left (index 0)
AFRAME.registerComponent('color-picker',{
  schema:{
    colors:{ default:[
      '#ff0000','#ff4000','#ff8000','#ffbf00',
      '#ffff00','#bfff00','#80ff00','#40ff00',
      '#00ff00','#00ff40','#00ff80','#00ffbf',
      '#00ffff','#00bfff','#0080ff','#0040ff',
      '#0000ff','#4000ff','#8000ff','#bf00ff',
      '#ff00ff','#ff00bf','#ff0080','#ff0040'
    ]},
    bgRadius:  { default: 0.11 },
    bgColor:   { default: '#222' },
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
    bg.setAttribute('position','0 0 -0.01');
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
        cell.setAttribute('segments', 16);
        cell.setAttribute('material', `color:${this.colors[idx]}; side:double`);
        cell.setAttribute('position', `${x} ${y} 0`);
        this.container.appendChild(cell);
      }
    });
    const ring=document.createElement('a-ring');
    ring.setAttribute('radius-inner', r*0.8);
    ring.setAttribute('radius-outer', r*1.2);
    ring.setAttribute('material', 'color:#fff; side:double');
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


AFRAME.registerComponent('oculus-thumbstick-controls', {
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
