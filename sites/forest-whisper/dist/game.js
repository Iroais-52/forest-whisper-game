(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const startPanel = document.querySelector('#start-panel');
  const startBtn = document.querySelector('#start-btn');
  const soundBtn = document.querySelector('#sound-btn');
  const restartBtn = document.querySelector('#restart-btn');
  const againBtn = document.querySelector('#again-btn');
  const ending = document.querySelector('#ending');
  const message = document.querySelector('#message');
  const progressFill = document.querySelector('#progress-fill');

  const WORLD_W = 4800;
  const BASE_H = 900;
  const GRAVITY = 1750;
  const MOVE_SPEED = 255;
  const JUMP_SPEED = 650;
  const DPR_LIMIT = 2;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let scale = 1;
  let started = false;
  let finished = false;
  let lastTime = performance.now();
  let cameraX = 0;
  let elapsed = 0;
  let messageTimer = 0;
  let soundEnabled = true;
  let audio = null;
  let birdTimer = 2.2;

  const input = { left: false, right: false, jump: false, jumpPressed: false };
  const player = { x: 190, y: 560, prevY: 560, vx: 0, vy: 0, radius: 18, grounded: false, facing: 1, step: 0 };

  const branches = [
    { x1: -80, x2: 760, y1: 660, y2: 610, thick: 68 },
    { x1: 700, x2: 1190, y1: 610, y2: 662, thick: 58 },
    { x1: 1300, x2: 1940, y1: 650, y2: 558, thick: 64 },
    { x1: 1880, x2: 2445, y1: 558, y2: 626, thick: 72 },
    { x1: 2550, x2: 3260, y1: 620, y2: 515, thick: 64 },
    { x1: 3200, x2: 3920, y1: 515, y2: 650, thick: 78 },
    { x1: 3860, x2: 4820, y1: 650, y2: 545, thick: 82 }
  ];

  const story = [
    { x: 630, text: '风从很远的地方来，也会在你身边停一会儿。' },
    { x: 1500, text: '有些路，不必急着走完。' },
    { x: 2190, text: '树影晃动的时候，森林正在呼吸。' },
    { x: 2920, text: '迷路也没关系，微光会认得你。' },
    { x: 3780, text: '再往前一点，天就亮了。' }
  ].map(item => ({ ...item, seen: false }));

  const fireflies = Array.from({ length: 90 }, (_, i) => ({
    x: (i * 431 + 97) % WORLD_W,
    y: 170 + ((i * 181) % 430),
    phase: (i * 1.77) % (Math.PI * 2),
    speed: 0.5 + (i % 7) * 0.06,
    size: 1.3 + (i % 4) * 0.55
  }));

  const motes = [];
  const bg = new Image();
  bg.src = './assets/forest-bg.png';

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
    width = window.innerWidth;
    height = window.innerHeight;
    scale = height / BASE_H;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function groundAt(x) {
    for (const b of branches) {
      if (x >= b.x1 && x <= b.x2) {
        const t = (x - b.x1) / (b.x2 - b.x1);
        return b.y1 + (b.y2 - b.y1) * t;
      }
    }
    return null;
  }

  function resetGame() {
    player.x = 190;
    player.y = 560;
    player.prevY = 560;
    player.vx = 0;
    player.vy = 0;
    player.grounded = false;
    cameraX = 0;
    finished = false;
    ending.hidden = true;
    story.forEach(item => { item.seen = false; });
    hideMessage();
    progressFill.style.width = '0%';
  }

  function begin() {
    if (!started) {
      started = true;
      startPanel.classList.add('is-hidden');
      setTimeout(() => { startPanel.hidden = true; }, 750);
    }
    if (soundEnabled) startAudio();
  }

  function update(dt) {
    elapsed += dt;
    if (!started || finished) return;

    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const targetVx = direction * MOVE_SPEED;
    const response = player.grounded ? 11 : 4.5;
    player.vx += (targetVx - player.vx) * Math.min(1, response * dt);
    if (direction) player.facing = direction;

    if (input.jumpPressed && player.grounded) {
      player.vy = -JUMP_SPEED;
      player.grounded = false;
      burst(player.x, player.y + player.radius, 9, '#dce995');
    }
    input.jumpPressed = false;

    player.prevY = player.y;
    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(25, Math.min(WORLD_W - 20, player.x));

    const ground = groundAt(player.x);
    if (ground !== null && player.vy >= 0 && player.prevY + player.radius <= ground + 24 && player.y + player.radius >= ground) {
      player.y = ground - player.radius;
      player.vy = 0;
      player.grounded = true;
    } else if (ground === null || player.y + player.radius < ground - 2) {
      player.grounded = false;
    }

    if (player.y > BASE_H + 120) {
      const checkpoint = player.x < 1250 ? 190 : player.x < 2500 ? 1335 : player.x < 3800 ? 2580 : 3900;
      player.x = checkpoint;
      const respawnGround = groundAt(checkpoint) || 620;
      player.y = respawnGround - 80;
      player.vx = 0;
      player.vy = 0;
      burst(player.x, player.y, 18, '#f7edab');
    }

    player.step += Math.abs(player.vx) * dt * 0.06;
    const visibleWorldW = width / scale;
    const targetCamera = Math.max(0, Math.min(WORLD_W - visibleWorldW, player.x - visibleWorldW * 0.38));
    cameraX += (targetCamera - cameraX) * Math.min(1, 3.1 * dt);

    story.forEach(item => {
      if (!item.seen && Math.abs(player.x - item.x) < 45) {
        item.seen = true;
        showMessage(item.text);
        burst(item.x, (groundAt(item.x) || 600) - 55, 30, '#eff5a5');
        chime();
      }
    });

    messageTimer -= dt;
    if (messageTimer <= 0) hideMessage();
    updateMotes(dt);
    progressFill.style.width = `${Math.max(0, Math.min(100, (player.x / 4560) * 100))}%`;
    try { localStorage.setItem('forest-whisper-progress', String(Math.round(player.x))); } catch (_) {}

    if (player.x > 4560) {
      finished = true;
      ending.hidden = false;
      showMessage('');
      chime(true);
    }

    birdTimer -= dt;
    if (birdTimer <= 0) {
      birdTimer = 5 + Math.random() * 9;
      birdCall();
    }
  }

  function updateMotes(dt) {
    for (let i = motes.length - 1; i >= 0; i -= 1) {
      const p = motes[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 12 * dt;
      if (p.life <= 0) motes.splice(i, 1);
    }
  }

  function burst(x, y, count, color) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 80;
      motes.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.8 + Math.random() * 1.6, max: 2.4, color, size: 1 + Math.random() * 3 });
    }
  }

  function showMessage(text) {
    message.textContent = text;
    if (!text) return hideMessage();
    message.classList.add('show');
    messageTimer = 4.8;
  }

  function hideMessage() { message.classList.remove('show'); }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(scale, scale);
    const viewW = width / scale;

    drawBackground(viewW);
    drawMist(viewW);
    drawDistantTrees(viewW);

    ctx.save();
    ctx.translate(-cameraX, 0);
    drawLightShafts();
    drawFireflies();
    drawBranches();
    drawShrubs();
    drawMotes();
    drawPlayer();
    ctx.restore();

    drawVignette(viewW);
    ctx.restore();
  }

  function drawBackground(viewW) {
    const drift = cameraX * 0.075;
    if (bg.complete && bg.naturalWidth) {
      const ratio = Math.max((viewW + 120) / bg.naturalWidth, BASE_H / bg.naturalHeight);
      const dw = bg.naturalWidth * ratio;
      const dh = bg.naturalHeight * ratio;
      const repeatSpan = Math.max(1, dw - viewW);
      const sx = -((drift % repeatSpan) + 60);
      ctx.drawImage(bg, sx, (BASE_H - dh) * 0.5, dw, dh);
      if (sx + dw < viewW) ctx.drawImage(bg, sx + dw - 2, (BASE_H - dh) * 0.5, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, BASE_H);
      g.addColorStop(0, '#78cbb0');
      g.addColorStop(0.52, '#2a7764');
      g.addColorStop(1, '#0d2b25');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, BASE_H);
    }
    ctx.fillStyle = 'rgba(4, 29, 25, 0.1)';
    ctx.fillRect(0, 0, viewW, BASE_H);
  }

  function drawMist(viewW) {
    const mist = ctx.createLinearGradient(0, 160, 0, 780);
    mist.addColorStop(0, 'rgba(188, 244, 211, 0)');
    mist.addColorStop(0.55, 'rgba(170, 228, 199, 0.12)');
    mist.addColorStop(1, 'rgba(17, 72, 61, 0.24)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, viewW, BASE_H);

    ctx.save();
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 470 - cameraX * 0.14 + elapsed * 5) % (viewW + 700)) - 350;
      const g = ctx.createRadialGradient(x, 610, 0, x, 610, 310);
      g.addColorStop(0, '#d9f9df');
      g.addColorStop(1, 'rgba(217,249,223,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 310, 300, 620, 620);
    }
    ctx.restore();
  }

  function drawDistantTrees(viewW) {
    ctx.save();
    ctx.translate(-(cameraX * 0.18) % 520, 0);
    ctx.fillStyle = 'rgba(8, 54, 45, 0.22)';
    for (let i = -1; i < Math.ceil(viewW / 260) + 3; i++) {
      const x = i * 260;
      const w = 44 + (i & 1) * 28;
      ctx.beginPath();
      ctx.moveTo(x - w, BASE_H);
      ctx.bezierCurveTo(x - 45, 580, x - 16, 290, x, 72);
      ctx.bezierCurveTo(x + 30, 300, x + 52, 600, x + w, BASE_H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLightShafts() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const shafts = [560, 1740, 2980, 4210];
    shafts.forEach((x, i) => {
      const g = ctx.createLinearGradient(x, 40, x + 170, 720);
      g.addColorStop(0, `rgba(248, 245, 170, ${0.12 + i * 0.008})`);
      g.addColorStop(1, 'rgba(248, 245, 170, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 70, 0);
      ctx.lineTo(x + 54, 0);
      ctx.lineTo(x + 300, 760);
      ctx.lineTo(x + 80, 760);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function drawFireflies() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const f of fireflies) {
      const x = f.x + Math.sin(elapsed * f.speed + f.phase) * 18;
      const y = f.y + Math.cos(elapsed * (f.speed * 0.8) + f.phase) * 13;
      const glow = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * 1.8 + f.phase));
      ctx.fillStyle = `rgba(238, 246, 151, ${glow})`;
      ctx.shadowColor = '#effa99';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, f.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBranches() {
    for (const b of branches) {
      const dx = b.x2 - b.x1;
      const dy = b.y2 - b.y1;
      const length = Math.hypot(dx, dy);
      const nx = -dy / length;
      const ny = dx / length;
      const t = b.thick;
      const bark = ctx.createLinearGradient(b.x1, b.y1 - t, b.x1, b.y1 + t);
      bark.addColorStop(0, '#193d31');
      bark.addColorStop(0.22, '#102d27');
      bark.addColorStop(1, '#071b19');
      ctx.fillStyle = bark;
      ctx.beginPath();
      ctx.moveTo(b.x1 + nx * 4, b.y1 + ny * 4);
      ctx.bezierCurveTo(b.x1 + dx * 0.3, b.y1 + dy * 0.3 - 11, b.x1 + dx * 0.7, b.y1 + dy * 0.7 + 10, b.x2 + nx * 2, b.y2 + ny * 2);
      ctx.lineTo(b.x2 + nx * t, b.y2 + ny * t);
      ctx.bezierCurveTo(b.x1 + dx * 0.68 + nx * t, b.y1 + dy * 0.68 + ny * t + 16, b.x1 + dx * 0.28 + nx * t, b.y1 + dy * 0.28 + ny * t, b.x1 + nx * t, b.y1 + ny * t);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(101, 157, 105, 0.32)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x1 + 10, b.y1 - 3);
      ctx.lineTo(b.x2 - 10, b.y2 - 3);
      ctx.stroke();

      for (let x = b.x1 + 35; x < b.x2 - 20; x += 48) {
        const g = groundAt(x);
        const h = 4 + ((x * 17) % 12);
        ctx.strokeStyle = 'rgba(131, 191, 120, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, g - 2);
        ctx.quadraticCurveTo(x - 4, g - h * 0.55, x + ((x % 3) - 1) * 5, g - h);
        ctx.stroke();
      }
    }
  }

  function drawShrubs() {
    ctx.save();
    ctx.fillStyle = 'rgba(9, 37, 31, 0.78)';
    for (let i = 0; i < 56; i++) {
      const x = i * 93 + 20;
      const y = 760 + Math.sin(i * 1.9) * 35;
      ctx.beginPath();
      ctx.ellipse(x, y, 82 + (i % 3) * 22, 58, -0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMotes() {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    motes.forEach(p => {
      const alpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPlayer() {
    const walk = player.grounded && Math.abs(player.vx) > 8 ? Math.sin(player.step) : 0;
    const bob = player.grounded ? Math.abs(walk) * 2 : 0;
    const x = player.x;
    const y = player.y - bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(player.facing, 1);

    ctx.globalCompositeOperation = 'screen';
    const aura = ctx.createRadialGradient(0, -8, 1, 0, -8, 46);
    aura.addColorStop(0, 'rgba(245,238,151,0.32)');
    aura.addColorStop(1, 'rgba(245,238,151,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-48, -58, 96, 96);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = '#17251f';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, 12);
    ctx.lineTo(-8 + walk * 5, 27);
    ctx.moveTo(6, 12);
    ctx.lineTo(8 - walk * 5, 27);
    ctx.stroke();

    const cloak = ctx.createLinearGradient(0, -15, 0, 18);
    cloak.addColorStop(0, '#d95b45');
    cloak.addColorStop(1, '#7e2d2d');
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(-13, -13);
    ctx.quadraticCurveTo(-18, 3, -15, 18);
    ctx.quadraticCurveTo(0, 24, 15, 18);
    ctx.quadraticCurveTo(18, 0, 11, -13);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f2cdb1';
    ctx.beginPath();
    ctx.arc(0, -20, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c2f29';
    ctx.beginPath();
    ctx.arc(-1, -23, 10, Math.PI * 1.05, Math.PI * 2.03);
    ctx.lineTo(9, -22);
    ctx.quadraticCurveTo(2, -35, -10, -28);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#f08b5d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(7, -12);
    ctx.quadraticCurveTo(23, -7 + walk * 2, 31, 1 + walk * 3);
    ctx.stroke();

    ctx.fillStyle = '#fff1a5';
    ctx.shadowColor = '#fff1a5';
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.arc(13, 1, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawVignette(viewW) {
    const g = ctx.createRadialGradient(viewW * 0.5, BASE_H * 0.45, BASE_H * 0.1, viewW * 0.5, BASE_H * 0.45, Math.max(viewW, BASE_H) * 0.68);
    g.addColorStop(0, 'rgba(1,12,11,0)');
    g.addColorStop(0.7, 'rgba(1,12,11,0.08)');
    g.addColorStop(1, 'rgba(1,12,11,0.65)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, BASE_H);
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function startAudio() {
    if (audio) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      audio.master.gain.setTargetAtTime(0.13, audio.ctx.currentTime, 0.2);
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.13;
    master.connect(ac.destination);

    const buffer = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 1.8;
    }
    const wind = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const windGain = ac.createGain();
    wind.buffer = buffer;
    wind.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 760;
    windGain.gain.value = 0.72;
    wind.connect(filter).connect(windGain).connect(master);
    wind.start();

    const padGain = ac.createGain();
    padGain.gain.value = 0.06;
    padGain.connect(master);
    [174.61, 261.63].forEach((frequency, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.value = i ? 0.3 : 0.42;
      osc.connect(gain).connect(padGain);
      osc.start();
    });
    audio = { ctx: ac, master };
  }

  function chime(final = false) {
    if (!audio || !soundEnabled) return;
    const t = audio.ctx.currentTime;
    const notes = final ? [523.25, 659.25, 783.99] : [392, 523.25];
    notes.forEach((frequency, index) => {
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, t + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.12, t + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + index * 0.12 + 1.3);
      osc.connect(gain).connect(audio.master);
      osc.start(t + index * 0.12);
      osc.stop(t + index * 0.12 + 1.35);
    });
  }

  function birdCall() {
    if (!audio || !soundEnabled || !started) return;
    const t = audio.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1150 + i * 140, t + i * 0.09);
      osc.frequency.exponentialRampToValueAtTime(1650 + i * 120, t + i * 0.09 + 0.07);
      gain.gain.setValueAtTime(0.001, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.045, t + i * 0.09 + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.12);
      osc.connect(gain).connect(audio.master);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.13);
    }
  }

  function bindHold(button, key) {
    const down = event => { event.preventDefault(); begin(); input[key] = true; };
    const up = event => { event.preventDefault(); input[key] = false; };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
  }

  window.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'A', 'd', 'D', 'w', 'W'].includes(event.key)) event.preventDefault();
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') input.left = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') input.right = true;
    if (event.key === 'ArrowUp' || event.key === ' ' || event.key.toLowerCase() === 'w') {
      if (!input.jump) input.jumpPressed = true;
      input.jump = true;
    }
    if (!started && ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'a', 'A', 'd', 'D', 'w', 'W'].includes(event.key)) begin();
  });

  window.addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') input.left = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') input.right = false;
    if (event.key === 'ArrowUp' || event.key === ' ' || event.key.toLowerCase() === 'w') input.jump = false;
  });

  startBtn.addEventListener('click', begin);
  restartBtn.addEventListener('click', () => { resetGame(); begin(); });
  againBtn.addEventListener('click', () => { resetGame(); begin(); });
  soundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundBtn.textContent = `声音：${soundEnabled ? '开' : '关'}`;
    if (soundEnabled) startAudio();
    else if (audio) audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.16);
  });

  bindHold(document.querySelector('#left-btn'), 'left');
  bindHold(document.querySelector('#right-btn'), 'right');
  const jumpBtn = document.querySelector('#jump-btn');
  jumpBtn.addEventListener('pointerdown', event => {
    event.preventDefault();
    begin();
    if (!input.jump) input.jumpPressed = true;
    input.jump = true;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => jumpBtn.addEventListener(type, event => { event.preventDefault(); input.jump = false; }));

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); });
  resize();
  resetGame();
  requestAnimationFrame(frame);
})();
