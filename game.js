(() => {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const W = 1200, H = 680, GROUND = 584;
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const ui = {
    phase: document.getElementById('phase-label'), level: document.getElementById('level-label'), hint: document.getElementById('stage-hint'), objective: document.getElementById('objective-text'),
    kicker: document.getElementById('deck-kicker'), sub: document.getElementById('deck-sub'), materials: document.getElementById('materials'), action: document.getElementById('action-button'), actionLabel: document.getElementById('action-label'), rotate: document.getElementById('rotate-button'), reset: document.getElementById('reset-button'),
    birdsInfo: document.getElementById('birds-info'), birdsLabel: document.getElementById('birds-label'), dots: document.getElementById('bird-dots'), toast: document.getElementById('toast'), banner: document.getElementById('turn-banner'), modal: document.getElementById('modal-backdrop'), resultTitle: document.getElementById('result-title'), resultCopy: document.getElementById('result-copy'), resultEyebrow: document.getElementById('result-eyebrow'), next: document.getElementById('next-button'), replay: document.getElementById('replay-button'),
  };
  const levels = [
    { pigs: 1, birds: 4, wood: 8, stone: 4, glass: 4 },
    { pigs: 2, birds: 5, wood: 9, stone: 5, glass: 4 },
    { pigs: 3, birds: 6, wood: 10, stone: 5, glass: 5 },
  ];
  const sizes = { wood: [104, 22], stone: [78, 34], glass: [100, 14] };
  const mats = {
    wood: { fill: '#b98352', edge: '#74472e', line: '#d5a574', weight: 1.15 },
    stone: { fill: '#89968c', edge: '#56645f', line: '#bec7b7', weight: 2.4 },
    glass: { fill: '#8ed5d1', edge: '#4b999c', line: '#d4ffff', weight: .65 },
  };
  const engine = Engine.create({ enableSleeping: true });
  engine.gravity.y = 1.02; engine.gravity.scale = .00105;
  let levelIndex = 0, mode = 'build', selected = 'wood', rotation = 0, inventory = {}, pigs = [], blocks = [], shots = 0, birdsTotal = 4, activeBird = null, aim = null, pointer = { x: 700, y: 430, inside: false }, settledAt = 0, soundOn = true, audioContext = null, toastTimer = 0, bannerTimer = 0, winPlayed = false;
  const ground = Bodies.rectangle(W / 2, GROUND + 44, W + 100, 90, { isStatic: true, label: 'ground', friction: .85 });
  const platform = Bodies.rectangle(900, 558, 270, 24, { isStatic: true, label: 'platform', friction: .8 });
  Composite.add(engine.world, [ground, platform]);

  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  new ResizeObserver(resize).observe(stage); resize();
  function mapPointer(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function toast(text) { ui.toast.textContent = text; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1700); }
  function banner(text) { ui.banner.textContent = text; ui.banner.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), 1300); }
  function setMode(next) {
    mode = next;
    const building = mode === 'build';
    ui.phase.textContent = building ? 'BUILD PHASE' : 'ATTACK PHASE';
    ui.hint.textContent = building ? 'YOUR TURN TO BUILD' : 'YOUR FRIEND IS UP';
    ui.kicker.textContent = building ? 'BUILD YOUR FORT' : 'FIRE AWAY';
    ui.sub.textContent = building ? 'Select a piece · tap the field to place' : 'Pull back the bird · release to launch';
    ui.actionLabel.textContent = building ? 'DONE BUILDING' : 'BACK TO BUILD';
    ui.materials.classList.toggle('inactive', !building);
    ui.materials.querySelectorAll('button').forEach(b => b.disabled = !building);
    ui.objective.textContent = building ? 'Build a fort. Your friend will attack!' : 'Knock the pigs off the fort!';
    ui.birdsInfo.style.visibility = building ? 'hidden' : 'visible';
  }
  function updateInventoryUI() {
    for (const kind of Object.keys(sizes)) {
      const button = ui.materials.querySelector(`[data-material="${kind}"]`);
      document.getElementById(`count-${kind}`).textContent = inventory[kind] ?? 0;
      button.classList.toggle('empty', !inventory[kind]); button.classList.toggle('selected', selected === kind);
    }
  }
  function updateBirdsUI() {
    ui.dots.innerHTML = '';
    for (let i = 0; i < birdsTotal; i++) { const d = document.createElement('i'); d.className = `bird-dot${i < shots ? ' spent' : ''}`; ui.dots.appendChild(d); }
    const left = birdsTotal - shots; ui.birdsLabel.textContent = `${left} ${left === 1 ? 'SHOT' : 'SHOTS'}`;
  }
  function removeBody(body) { if (body && Composite.get(engine.world, body.id, 'body')) Composite.remove(engine.world, body); }
  function newLevel(index) {
    levelIndex = index; const data = levels[levelIndex % levels.length];
    mode = 'build'; selected = 'wood'; rotation = 0; shots = 0; birdsTotal = data.birds; inventory = { wood: data.wood, stone: data.stone, glass: data.glass }; pigs = []; blocks = []; activeBird = null; aim = null; settledAt = 0; winPlayed = false;
    Composite.clear(engine.world, false); Composite.add(engine.world, [ground, platform]);
    const positions = data.pigs === 1 ? [900] : data.pigs === 2 ? [855, 945] : [835, 900, 965];
    positions.forEach((x, i) => { const body = Bodies.circle(x, 535, 19, { label: 'pig', restitution: .16, friction: .7, density: .0018, sleepThreshold: 80 }); body.pigIndex = i; pigs.push(body); Composite.add(engine.world, body); });
    ui.level.textContent = `LEVEL ${String(levelIndex + 1).padStart(2, '0')}`;
    ui.objective.textContent = data.pigs === 1 ? 'Protect the pig? Not today.' : `Knock all ${data.pigs} pigs off the fort!`;
    ui.modal.hidden = true; ui.banner.classList.remove('show'); setMode('build'); updateInventoryUI(); updateBirdsUI();
  }
  function makeBlock(kind, x, y, angle = 0) {
    const [w, h] = sizes[kind], material = mats[kind];
    const body = Bodies.rectangle(x, y, w, h, { label: 'block', angle, density: material.weight * .001, friction: kind === 'glass' ? .35 : .72, restitution: kind === 'glass' ? .12 : .04, chamfer: { radius: kind === 'stone' ? 4 : 2 } });
    Body.setStatic(body, true);
    body.materialKind = kind; blocks.push(body); Composite.add(engine.world, body); return body;
  }
  function eraseLast() {
    if (mode !== 'build' || !blocks.length) return;
    const b = blocks.pop(); inventory[b.materialKind]++; removeBody(b); updateInventoryUI(); toast('Last piece picked back up');
  }
  function rotatePiece() { rotation = rotation ? 0 : Math.PI / 2; }
  function finishBuild() {
    if (mode !== 'build') {
      blocks.forEach(b => Body.setStatic(b, true)); pigs.forEach(p => Body.setStatic(p, true));
      setMode('build'); toast('Back to building — your friend can wait!'); return;
    }
    if (blocks.length < 2) { toast('Add a couple of blocks to your fort first!'); return; }
    blocks.forEach(b => Body.setStatic(b, false)); pigs.forEach(p => Body.setStatic(p, false));
    setMode('attack'); shots = 0; settledAt = 0; updateBirdsUI(); makeBird(); banner('YOUR FRIEND IS READY'); toast('Drag the bird back, then let it fly!');
  }
  function makeBird() {
    if (shots >= birdsTotal || mode !== 'attack') return;
    activeBird = Bodies.circle(164, 444, 18, { label: 'bird', restitution: .67, friction: .35, density: .004, frictionAir: .004 });
    Body.setStatic(activeBird, true);
    activeBird.launched = false; activeBird.launchTime = 0; Composite.add(engine.world, activeBird);
  }
  function launchBird() {
    if (!activeBird || activeBird.launched) return;
    const dx = 164 - activeBird.position.x, dy = 444 - activeBird.position.y;
    if (Math.hypot(dx, dy) < 14) { aim = null; Body.setPosition(activeBird, { x: 164, y: 444 }); return; }
    Body.setStatic(activeBird, false); Body.setVelocity(activeBird, { x: dx * .19, y: dy * .19 });
    activeBird.launched = true; activeBird.launchTime = performance.now(); settledAt = 0; aim = null; shots++; updateBirdsUI(); playLaunch();
  }
  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const { bodyA, bodyB } of pairs) {
      const bird = bodyA.label === 'bird' ? bodyA : bodyB.label === 'bird' ? bodyB : null;
      const target = bodyA.label === 'pig' ? bodyA : bodyB.label === 'pig' ? bodyB : null;
      if (bird && target && !target.defeated) defeatPig(target);
    }
  });
  function defeatPig(pig) {
    if (pig.defeated) return; pig.defeated = true; pigs = pigs.filter(p => p !== pig); removeBody(pig); playPop();
    toast(pigs.length ? `${pigs.length} pig${pigs.length === 1 ? '' : 's'} left!` : 'Fort down. Friend wins!');
    if (!pigs.length) setTimeout(() => finishLevel(true), 650);
  }
  function finishLevel(won) {
    if (!ui.modal.hidden) return;
    if (won) {
      ui.resultEyebrow.textContent = levelIndex === levels.length - 1 ? 'FORT DESTROYER!' : 'NICE ONE!';
      ui.resultTitle.textContent = ['Tower toppled.', 'Piggies down!', 'Fort? What fort?'][levelIndex % levels.length];
      ui.resultCopy.textContent = 'Your friend really knows how to make an entrance.';
      ui.next.style.display = levelIndex < levels.length - 1 ? 'flex' : 'none';
      ui.replay.textContent = levelIndex < levels.length - 1 ? 'PLAY AGAIN' : 'PLAY FROM LEVEL 1';
      ui.modal.hidden = false; if (!winPlayed) { winPlayed = true; playVictory(); }
    } else {
      ui.resultEyebrow.textContent = 'SO CLOSE!'; ui.resultTitle.textContent = 'Fort still standing.'; ui.resultCopy.textContent = 'Your friend ran out of birds. Give it another go!';
      ui.next.style.display = 'none'; ui.replay.textContent = 'TRY AGAIN'; ui.modal.hidden = false; playFail();
    }
  }
  function settleCheck(now) {
    if (mode !== 'attack' || !activeBird?.launched) return;
    const b = activeBird, speed = Math.hypot(b.velocity.x, b.velocity.y);
    const gone = b.position.x > W + 80 || b.position.x < -80 || b.position.y > H + 60 || b.position.y < -100;
    if (gone) { removeBody(b); activeBird = null; }
    else if (now - b.launchTime > 1300 && speed < 1.65) {
      if (!settledAt) settledAt = now;
      if (now - settledAt > 720) { removeBody(b); activeBird = null; }
    } else settledAt = 0;
    if (!activeBird && shots >= birdsTotal && pigs.length) finishLevel(false);
    else if (!activeBird && shots < birdsTotal && pigs.length) makeBird();
  }

  function ensureAudio() {
    if (!audioContext) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audioContext = new AC(); }
    if (audioContext?.state === 'suspended') audioContext.resume();
  }
  function tone(freq, when, duration, type = 'sine', volume = .08, endFreq = null) {
    if (!soundOn || !audioContext) return;
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, when + duration);
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(volume, when + .018); gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(when); osc.stop(when + duration + .03);
  }
  function playLaunch() { ensureAudio(); if (!audioContext) return; const t = audioContext.currentTime; tone(230, t, .19, 'triangle', .12, 100); tone(530, t + .035, .12, 'sine', .035, 190); }
  function playPop() { ensureAudio(); if (!audioContext) return; tone(380, audioContext.currentTime, .12, 'triangle', .07, 90); }
  function playFail() { ensureAudio(); if (!audioContext) return; tone(340, audioContext.currentTime, .3, 'triangle', .06, 240); }
  function playVictory() {
    ensureAudio();
    if (audioContext) {
      const t = audioContext.currentTime + .06;
      [659, 784, 988, 1175, 988, 1318].forEach((n, i) => tone(n, t + i * .12, .22, i % 2 ? 'triangle' : 'sine', .075));
      [523, 659, 784].forEach((n, i) => tone(n, t + .74 + i * .14, .36, 'triangle', .055));
    }
    if (soundOn && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const say = new SpeechSynthesisUtterance('Arre wah! Kya baat hai!');
      say.lang = 'hi-IN'; say.rate = .94; say.pitch = 1.12; say.volume = .85;
      const voice = speechSynthesis.getVoices().find(v => /hi-IN|Hindi/i.test(v.lang + ' ' + v.name));
      if (voice) say.voice = voice;
      window.speechSynthesis.speak(say);
    }
  }

  function pointerDown(e) {
    e.preventDefault(); ensureAudio(); const p = mapPointer(e); pointer = { ...p, inside: true };
    if (mode === 'build') {
      if (p.x < 594 || p.x > 1110 || p.y < 55 || p.y > 552) { toast('Build on your side of the field'); return; }
      if (!inventory[selected]) { toast(`You're out of ${selected}. Pick another block!`); return; }
      const [w, h] = sizes[selected], wide = rotation ? h : w, tall = rotation ? w : h;
      if (p.x - wide / 2 < 592 || p.x + wide / 2 > 1110 || p.y + tall / 2 > 550) { toast('That piece is outside the build zone'); return; }
      makeBlock(selected, p.x, p.y, rotation); inventory[selected]--; updateInventoryUI();
    } else if (activeBird && !activeBird.launched && Math.hypot(p.x - activeBird.position.x, p.y - activeBird.position.y) < 52) {
      aim = { id: e.pointerId }; canvas.setPointerCapture(e.pointerId);
    }
  }
  function pointerMove(e) {
    const p = mapPointer(e); pointer = { ...p, inside: true };
    if (aim && activeBird && !activeBird.launched) {
      const dx = p.x - 164, dy = p.y - 444, d = Math.hypot(dx, dy), max = 122, f = d > max ? max / d : 1;
      Body.setPosition(activeBird, { x: 164 + dx * f, y: 444 + dy * f });
    }
  }
  function pointerUp() { if (aim) launchBird(); aim = null; }
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('pointerleave', () => { if (!aim) pointer.inside = false; });
  ui.materials.addEventListener('click', e => {
    const b = e.target.closest('[data-material]'); if (!b || b.disabled) return;
    selected = b.dataset.material; updateInventoryUI();
  });
  ui.rotate.addEventListener('click', rotatePiece);
  ui.action.addEventListener('click', finishBuild);
  ui.reset.addEventListener('click', () => newLevel(levelIndex));
  ui.replay.addEventListener('click', () => newLevel(levelIndex));
  ui.next.addEventListener('click', () => newLevel((levelIndex + 1) % levels.length));
  document.getElementById('sound-toggle').addEventListener('click', e => {
    soundOn = !soundOn; e.currentTarget.classList.toggle('muted', !soundOn);
    document.getElementById('sound-icon').textContent = soundOn ? '♪' : '×';
    e.currentTarget.querySelector('.sound-word').textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    if (!soundOn && 'speechSynthesis' in window) speechSynthesis.cancel();
    else { ensureAudio(); tone(660, audioContext.currentTime, .12, 'sine', .04); }
  });
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'r') rotatePiece();
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); eraseLast(); }
    if (e.key === 'Enter' && mode === 'build') finishBuild();
    if (e.key === 'Escape' && !ui.modal.hidden) ui.modal.hidden = true;
  });

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  }
  function drawBackground(now) {
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#9ed3df'); sky.addColorStop(.55, '#c6e5d9'); sky.addColorStop(1, '#e8e4bf'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(1000, 100, 8, 1000, 100, 90); sun.addColorStop(0, '#fff5ca'); sun.addColorStop(1, '#fff3c900'); ctx.fillStyle = sun; ctx.fillRect(900, 0, 200, 200);
    ctx.fillStyle = '#ffffff83';
    for (const [x, y, s] of [[255,100,.9],[570,78,.7],[945,150,.8]]) { const drift = Math.sin(now / 9000 + x) * 7; ctx.beginPath(); ctx.ellipse(x + drift,y,35*s,9*s,0,0,Math.PI*2); ctx.ellipse(x+20*s+drift,y-5*s,20*s,12*s,0,0,Math.PI*2); ctx.ellipse(x-17*s+drift,y-3*s,17*s,10*s,0,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = '#a0c8b4'; ctx.beginPath(); ctx.moveTo(0,375); ctx.quadraticCurveTo(170,300,355,377); ctx.quadraticCurveTo(540,320,720,372); ctx.quadraticCurveTo(920,302,1200,372); ctx.lineTo(1200,610); ctx.lineTo(0,610); ctx.fill();
    ctx.fillStyle = '#b2d0aa'; ctx.beginPath(); ctx.moveTo(0,428); ctx.quadraticCurveTo(230,365,470,430); ctx.quadraticCurveTo(690,370,870,422); ctx.quadraticCurveTo(1060,380,1200,422); ctx.lineTo(1200,606); ctx.lineTo(0,606); ctx.fill();
    for (const x of [38,83,320,1148,1180]) { const y = 425 + (x % 3) * 13; ctx.fillStyle = '#759e7a'; ctx.fillRect(x-3,y,6,46); ctx.beginPath(); ctx.arc(x,y-5,17,0,Math.PI*2); ctx.fill(); }
    const grass = ctx.createLinearGradient(0, 500, 0, 640); grass.addColorStop(0, '#89b67b'); grass.addColorStop(1, '#5e986c'); ctx.fillStyle = grass;
    ctx.beginPath(); ctx.moveTo(0,528); ctx.quadraticCurveTo(300,505,590,532); ctx.quadraticCurveTo(880,507,1200,525); ctx.lineTo(1200,H); ctx.lineTo(0,H); ctx.fill();
    ctx.fillStyle = '#d1dcae'; ctx.globalAlpha=.35; for (let i=0;i<70;i++){const x=(i*173+31)%1200,y=535+(i*61)%130;ctx.fillRect(x,y,2+(i%3),1.5);} ctx.globalAlpha=1;
    ctx.fillStyle = '#5c8965'; ctx.fillRect(0, GROUND+5, W, H-GROUND);
    ctx.fillStyle = '#98c47d'; ctx.fillRect(0,GROUND,W,8); ctx.fillStyle = '#b8d28f'; ctx.fillRect(0,GROUND,W,2);
    ctx.fillStyle = '#627868'; ctx.fillRect(812,568,13,16); ctx.fillRect(974,568,13,16);
    ctx.fillStyle = '#c9ae7a'; roundedRect(765,545,270,24,5); ctx.fill(); ctx.strokeStyle='#8c7657';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#ddc995';ctx.fillRect(770,548,260,5);ctx.fillStyle='#a38c64';for(let x=785;x<1025;x+=32){ctx.fillRect(x,557,3,7);}
    drawSling();
    ctx.save(); ctx.strokeStyle='#ffffff63'; ctx.lineWidth=1.5; ctx.setLineDash([6,7]); ctx.beginPath();ctx.moveTo(596,545);ctx.lineTo(1105,545);ctx.stroke();ctx.setLineDash([]);
    if (mode === 'build') { ctx.fillStyle='#234044a0';ctx.font='500 10px "DM Mono", monospace';ctx.textAlign='center';ctx.fillText('YOUR BUILD ZONE',850,570); }
    ctx.restore();
  }
  function drawSling() {
    ctx.save(); ctx.lineCap='round'; ctx.strokeStyle='#56402c';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(150,472);ctx.lineTo(150,500);ctx.lineTo(140,548);ctx.moveTo(150,500);ctx.lineTo(166,549);ctx.stroke();
    ctx.strokeStyle='#98714a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(150,500);ctx.lineTo(151,472);ctx.moveTo(150,500);ctx.lineTo(164,472);ctx.stroke();
    if (activeBird && !activeBird.launched && mode==='attack') { ctx.strokeStyle='#704d3e';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(151,472);ctx.lineTo(activeBird.position.x,activeBird.position.y);ctx.lineTo(164,472);ctx.stroke(); }
    ctx.restore();
  }

  function drawBlock(body) {
    const kind = body.materialKind, look = mats[kind], v = body.vertices;
    ctx.save(); ctx.beginPath(); ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath(); ctx.shadowColor = '#244b4455'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.fillStyle = look.fill; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = look.edge; ctx.lineWidth = 2; ctx.stroke();
    const [w, h] = sizes[kind];
    ctx.translate(body.position.x, body.position.y); ctx.rotate(body.angle);
    if (kind === 'wood') {
      ctx.strokeStyle = '#e2b47b65'; ctx.lineWidth = 1;
      for (let y = -h / 2 + 5; y < h / 2; y += 7) { ctx.beginPath(); ctx.moveTo(-w / 2 + 5, y); ctx.quadraticCurveTo(0, y - 2, w / 2 - 5, y + 1); ctx.stroke(); }
      ctx.fillStyle = '#63452f88';
      for (const x of [-w * .34, w * .34]) { ctx.beginPath(); ctx.arc(x, 0, 1.8, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === 'stone') {
      ctx.strokeStyle = '#d5dfd25a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w * .25, -h * .38); ctx.lineTo(-w * .12, h * .32); ctx.lineTo(w * .12, h * .15); ctx.stroke();
      ctx.fillStyle = '#e3eadc55'; ctx.fillRect(-w * .4, -h * .34, w * .2, 2);
    } else {
      ctx.fillStyle = '#ddffff60'; ctx.beginPath(); ctx.moveTo(-w / 2 + 9, -h / 2 + 3); ctx.lineTo(-w / 2 + 28, -h / 2 + 3); ctx.lineTo(-w / 2 + 8, h / 2 - 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d4ffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, 0); ctx.lineTo(w / 2 - 4, 0); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPig(pig) {
    const { x, y } = pig.position, r = pig.circleRadius || 19;
    ctx.save(); ctx.translate(x, y); ctx.rotate(pig.angle);
    ctx.shadowColor = '#386c4b50'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#76ca74'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#398d58'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#a4e890'; ctx.beginPath(); ctx.ellipse(-5, -r + 3, 5, 7, -.35, 0, Math.PI * 2); ctx.ellipse(7, -r + 3, 5, 7, .35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f6f5dc'; ctx.beginPath(); ctx.arc(-6, -4, 5, 0, Math.PI * 2); ctx.arc(7, -4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#263d37'; ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI * 2); ctx.arc(8, -3, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8edc83'; ctx.strokeStyle = '#398d58'; ctx.beginPath(); ctx.ellipse(1, 5, 10, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#397e51'; ctx.beginPath(); ctx.ellipse(-3, 5, 1.4, 2, 0, 0, Math.PI * 2); ctx.ellipse(4, 5, 1.4, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawBird(bird) {
    const { x, y } = bird.position, r = bird.circleRadius || 18;
    ctx.save(); ctx.translate(x, y); ctx.rotate(bird.angle);
    ctx.shadowColor = '#85483355'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ed6856'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#b6463c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f5f0d7'; ctx.beginPath(); ctx.ellipse(2, 7, 10, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8e4'; ctx.beginPath(); ctx.arc(6, -4, 5.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26383b'; ctx.beginPath(); ctx.arc(8, -4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9b64d'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(24, 4); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#512e2a'; ctx.beginPath(); ctx.moveTo(-7, -r + 2); ctx.lineTo(-1, -r - 11); ctx.lineTo(3, -r + 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawPlacementPreview() {
    if (mode !== 'build' || !pointer.inside || pointer.x < 594 || pointer.x > 1110 || pointer.y > 552 || !inventory[selected]) return;
    const [w, h] = sizes[selected], wide = rotation ? h : w, tall = rotation ? w : h;
    if (pointer.x - wide / 2 < 592 || pointer.x + wide / 2 > 1110 || pointer.y + tall / 2 > 550) return;
    ctx.save(); ctx.globalAlpha = .45; ctx.setLineDash([6, 4]);
    const x = Math.max(594 + wide / 2, Math.min(1110 - wide / 2, pointer.x));
    const y = Math.max(tall / 2 + 55, Math.min(545 - tall / 2, pointer.y));
    ctx.translate(x, y); ctx.rotate(rotation); ctx.fillStyle = mats[selected].fill; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.restore();
  }
  function draw(now) {
    drawBackground(now);
    for (const body of blocks) if (Composite.get(engine.world, body.id, 'body')) drawBlock(body);
    for (const pig of pigs) drawPig(pig);
    if (activeBird && Composite.get(engine.world, activeBird.id, 'body')) drawBird(activeBird);
    drawPlacementPreview();
    if (aim && activeBird) {
      ctx.save(); ctx.setLineDash([5, 6]); ctx.strokeStyle = '#fff9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(activeBird.position.x, activeBird.position.y); ctx.lineTo(activeBird.position.x + (164 - activeBird.position.x) * .75, activeBird.position.y + (444 - activeBird.position.y) * .75); ctx.stroke(); ctx.restore();
    }
  }
  let previousFrame = performance.now();
  function frame(now) {
    const delta = Math.min(now - previousFrame, 1000 / 60); previousFrame = now;
    Engine.update(engine, delta);
    settleCheck(now); draw(now); requestAnimationFrame(frame);
  }
  newLevel(0);
  requestAnimationFrame(frame);
})();
