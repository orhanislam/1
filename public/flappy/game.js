(function () {
  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlayText');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');

  const CSS_WIDTH = canvas.width;
  const CSS_HEIGHT = canvas.height;
  canvas.style.width = CSS_WIDTH + 'px';
  canvas.style.height = CSS_HEIGHT + 'px';
  canvas.width = Math.floor(CSS_WIDTH * DPR);
  canvas.height = Math.floor(CSS_HEIGHT * DPR);
  ctx.scale(DPR, DPR);

  const WIDTH = CSS_WIDTH;
  const HEIGHT = CSS_HEIGHT;

  let rafId = null;
  let running = false;
  let gameOver = false;
  let frame = 0;
  let score = 0;
  let best = Number(localStorage.getItem('flappy_best') || 0);
  bestEl.textContent = String(best);

  const world = {
    gravity: 0.45,
    pipeSpeed: 2.2,
    pipeInterval: 90,
    gap: 150,
    groundHeight: 80
  };

  const bird = {
    x: WIDTH * 0.28,
    y: HEIGHT * 0.5,
    radius: 14,
    vy: 0,
    lift: -7.8
  };

  /** @type {{x:number, top:number, bottom:number, width:number, passed:boolean}[]} */
  let pipes = [];

  function resetGameState() {
    pipes = [];
    score = 0;
    frame = 0;
    bird.y = HEIGHT * 0.5;
    bird.vy = 0;
    running = false;
    gameOver = false;
    scoreEl.textContent = '0';
  }

  function spawnPipe() {
    const margin = 40;
    const maxTop = HEIGHT - world.groundHeight - world.gap - margin;
    const top = Math.max(20, Math.floor(Math.random() * maxTop));
    pipes.push({ x: WIDTH + 40, top, bottom: top + world.gap, width: 64, passed: false });
  }

  function flap() {
    if (!running && !gameOver) {
      startGame();
    }
    if (!gameOver) {
      bird.vy = bird.lift;
    }
  }

  function startGame() {
    overlay.classList.add('hidden');
    startBtn.hidden = true;
    restartBtn.hidden = true;
    running = true;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    gameOver = true;
    running = false;
    if (score > best) {
      best = score;
      localStorage.setItem('flappy_best', String(best));
      bestEl.textContent = String(best);
    }
    overlayText.textContent = `Game Over — Score ${score}`;
    startBtn.hidden = true;
    restartBtn.hidden = false;
    overlay.classList.remove('hidden');
  }

  function update() {
    frame++;

    // Bird physics
    bird.vy += world.gravity;
    bird.y += bird.vy;

    // Spawn pipes
    if (frame % world.pipeInterval === 0) spawnPipe();

    // Move pipes
    for (const p of pipes) {
      p.x -= world.pipeSpeed;
      // Score when passed
      if (!p.passed && p.x + p.width < bird.x - bird.radius) {
        p.passed = true;
        score++;
        scoreEl.textContent = String(score);
      }
    }

    // Remove off-screen pipes
    if (pipes.length && pipes[0].x + pipes[0].width < -10) pipes.shift();

    // Collisions with ground/ceiling
    const ceiling = 0;
    const groundY = HEIGHT - world.groundHeight;
    if (bird.y - bird.radius < ceiling) {
      bird.y = ceiling + bird.radius;
      bird.vy = 0;
    }
    if (bird.y + bird.radius > groundY) {
      bird.y = groundY - bird.radius;
      endGame();
    }

    // Collisions with pipes
    for (const p of pipes) {
      const inX = bird.x + bird.radius > p.x && bird.x - bird.radius < p.x + p.width;
      if (inX) {
        const hitsTop = bird.y - bird.radius < p.top;
        const hitsBottom = bird.y + bird.radius > p.bottom;
        if (hitsTop || hitsBottom) {
          endGame();
          break;
        }
      }
    }
  }

  function drawBackground() {
    // Sky gradient is via CSS; draw hills and ground
    ctx.save();
    // Distant hills
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.ellipse(WIDTH * 0.3, HEIGHT - 90, 160, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(WIDTH * 0.7, HEIGHT - 70, 190, 48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ground
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, HEIGHT - world.groundHeight, WIDTH, world.groundHeight);

    // Ground stripes
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let x = 0; x < WIDTH; x += 28) {
      ctx.fillRect(x, HEIGHT - world.groundHeight + 12, 16, 6);
    }
    ctx.restore();
  }

  function drawPipes() {
    for (const p of pipes) {
      ctx.save();
      ctx.fillStyle = '#065f46';
      // Top pipe
      ctx.fillRect(p.x, 0, p.width, p.top);
      // Bottom pipe
      ctx.fillRect(p.x, p.bottom, p.width, HEIGHT - world.groundHeight - p.bottom);
      // Lips
      ctx.fillStyle = '#047857';
      ctx.fillRect(p.x - 4, p.top - 12, p.width + 8, 12);
      ctx.fillRect(p.x - 4, p.bottom, p.width + 8, 12);
      ctx.restore();
    }
  }

  function drawBird() {
    ctx.save();
    // Body
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
    ctx.fill();
    // Wing
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(bird.x - 6, bird.y + 2, bird.radius * 0.6, Math.PI * 0.2, Math.PI * 1.7);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bird.x + 6, bird.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(bird.x + 7, bird.y - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(bird.x + 8, bird.y + 2);
    ctx.lineTo(bird.x + 20, bird.y + 0);
    ctx.lineTo(bird.x + 8, bird.y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawBackground();
    drawPipes();
    drawBird();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    if (running) update();
    draw();
  }

  // Input
  function onKey(e) {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (gameOver) return; // wait for restart button/tap
      flap();
    }
  }
  function onPointer() {
    if (gameOver) return; // wait for restart button/tap
    flap();
  }

  startBtn.addEventListener('click', () => { if (!running) { startGame(); flap(); } });
  restartBtn.addEventListener('click', () => { resetGameState(); overlayText.textContent = 'Tap or press Space to flap!'; startGame(); flap(); });
  window.addEventListener('keydown', onKey, { passive: false });
  canvas.addEventListener('mousedown', onPointer);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointer(); }, { passive: false });

  // Initial state
  resetGameState();
  overlay.classList.remove('hidden');
  startBtn.hidden = false;
  restartBtn.hidden = true;
  if (!rafId) rafId = requestAnimationFrame(loop);
})();