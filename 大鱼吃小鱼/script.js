const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startButton = document.getElementById('startButton');
const playerLevelEl = document.getElementById('playerLevel');
const gameBounds = { width: canvas.width, height: canvas.height };

const images = {
  player: '主鱼.png',
  enemy1: '1.png',
  enemy2: '2.png',
  enemy3: '3.png',
  enemy4: '4.png',
};
const loadedImages = {};
const enemies = [];
const particles = [];
let mouse = { x: gameBounds.width / 2, y: gameBounds.height / 2 };
let score = 0;
let level = 1;
let player = null;
let lastSpawnTime = 0;
let gameState = 'ready';
let animationId = null;
let framePending = false;

const MAX_ENEMIES = 6;
const SPAWN_INTERVAL = 1400;
const MAX_ENEMY_AGE = 9000;
const MAX_PLAYER_LEVEL = 4;
const PLAYER_START_RADIUS = 28;
const PLAYER_START_SPEED = 0.085;
const PLAYER_GROWTH = 0.825;
const LEVEL_SCORE_BASE = 260;
const EAT_SIZE_RATIO = 1.2;

const sizeMap = {
  1: { radius: 24, image: images.enemy1 },
  2: { radius: 38, image: images.enemy2 },
  3: { radius: 54, image: images.enemy3 },
  4: { radius: 70, image: images.enemy4 },
};

const bubbles = [];
const BUBBLE_COUNT = 14;

function createBubble() {
  return {
    x: Math.random() * gameBounds.width,
    y: gameBounds.height + Math.random() * 80,
    radius: 4 + Math.random() * 8,
    alpha: 0.08 + Math.random() * 0.14,
    speed: 0.18 + Math.random() * 0.18,
  };
}

function initBubbles() {
  bubbles.length = 0;
  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    bubbles.push(createBubble());
  }
}

function updateBubbles(deltaTime) {
  bubbles.forEach((bubble) => {
    bubble.y -= bubble.speed * deltaTime;
    bubble.alpha -= 0.0009 * deltaTime;
    if (bubble.y < -30 || bubble.alpha <= 0.03) {
      Object.assign(bubble, createBubble());
      bubble.y = gameBounds.height + Math.random() * 40;
    }
  });
}

function drawBubbles() {
  bubbles.forEach((bubble) => {
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${bubble.alpha})`;
    ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function resizeCanvas() {
  const ratio = canvas.width / canvas.height;
  const maxWidth = Math.min(window.innerWidth - 32, 1080);
  const calcHeight = Math.min(window.innerHeight - 32, 640);
  let width = maxWidth;
  let height = Math.round(width / ratio);
  if (height > calcHeight) {
    height = calcHeight;
    width = Math.round(height * ratio);
  }
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadImages(callback) {
  const keys = Object.keys(images);
  let loaded = 0;
  keys.forEach((key) => {
    const img = new Image();
    img.src = images[key];
    img.onload = () => {
      loadedImages[key] = img;
      loaded += 1;
      if (loaded === keys.length) callback();
    };
    img.onerror = () => {
      console.error('无法加载图片：', images[key]);
      loaded += 1;
      if (loaded === keys.length) callback();
    };
  });
}

function normalizeAngle(angle) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function shortestAngleDiff(source, target) {
  let diff = normalizeAngle(target - source);
  if (diff > Math.PI) diff -= Math.PI * 2;
  return diff;
}

function createPlayer() {
  return {
    x: gameBounds.width / 2,
    y: gameBounds.height / 2,
    radius: PLAYER_START_RADIUS,
    speed: PLAYER_START_SPEED,
    image: loadedImages.player,
    angle: 0,
    level: 1,
  };
}

function updatePlayerLevelBySize() {
  if (!player) return;
  let sizeLevel = 1;
  for (let rank = 1; rank <= MAX_PLAYER_LEVEL; rank += 1) {
    if (sizeMap[rank].radius <= player.radius * EAT_SIZE_RATIO) {
      sizeLevel = rank;
    }
  }
  player.level = sizeLevel;
}

function updateHud() {
  updatePlayerLevelBySize();
  scoreEl.textContent = score;
  levelEl.textContent = level;
  playerLevelEl.textContent = player.level;
}

function shrinkPlayerGrowth() {
  const growth = Math.max(0, player.radius - PLAYER_START_RADIUS);
  player.radius = PLAYER_START_RADIUS + growth / 2;
  updatePlayerLevelBySize();
  player.x = clamp(player.x, player.radius, gameBounds.width - player.radius);
  player.y = clamp(player.y, player.radius, gameBounds.height - player.radius);
}

function sendEnemyAway(enemy) {
  enemy.leaving = true;
  enemy.targetAngle = Math.atan2(enemy.y - player.y, enemy.x - player.x);
  enemy.turnTimer = 200 + Math.random() * 220;
  enemy.bounceTimer = 1200;
}

function pickEnemyRank() {
  const roll = Math.random();
  if (roll < 0.46) return 1;
  if (roll < 0.70) return 2;
  if (roll < 0.88) return 3;
  return 4;
}

function createEnemy(rank = null) {
  const enemyRank = rank || pickEnemyRank();
  const size = sizeMap[enemyRank];
  const edge = Math.random() > 0.5 ? 'horizontal' : 'vertical';
  const x = edge === 'horizontal' ? (Math.random() > 0.5 ? -size.radius : gameBounds.width + size.radius) : Math.random() * gameBounds.width;
  const y = edge === 'vertical' ? (Math.random() > 0.5 ? -size.radius : gameBounds.height + size.radius) : Math.random() * gameBounds.height;
  const baseSpeed = 0.5 + enemyRank * 0.1 + Math.random() * 0.7 + (level - 1) * 0.06;
  const speed = baseSpeed * (Math.random() < 0.35 ? 1.35 : 1);
  const angle = Math.random() * Math.PI * 2;
  return {
    rank: enemyRank,
    radius: size.radius,
    image: loadedImages[`enemy${enemyRank}`],
    x,
    y,
    speed,
    angle,
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed,
    age: 0,
    leaving: false,
    turnTimer: 5200 + Math.random() * 2800,
    turnSpeed: 0.015 + Math.random() * 0.012,
    targetAngle: null,
    bounceTimer: 0,
  };
}

function updatePlayer(deltaTime) {
  const dx = mouse.x - player.x;
  const dy = mouse.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > 4) {
    player.angle = Math.atan2(dy, dx);
  }
  player.x += dx * player.speed * deltaTime;
  player.y += dy * player.speed * deltaTime;
  player.x = clamp(player.x, player.radius, gameBounds.width - player.radius);
  player.y = clamp(player.y, player.radius, gameBounds.height - player.radius);
}

function updateEnemies(deltaTime) {
  enemies.forEach((enemy) => {
    enemy.age += deltaTime * 16;
    enemy.turnTimer -= deltaTime * 16;
    enemy.bounceTimer = Math.max(0, enemy.bounceTimer - deltaTime * 16);
    if (enemy.age >= MAX_ENEMY_AGE && !enemy.leaving) {
      enemy.leaving = true;
      const distLeft = enemy.x;
      const distRight = gameBounds.width - enemy.x;
      const distTop = enemy.y;
      const distBottom = gameBounds.height - enemy.y;
      if (distLeft <= distRight && distLeft <= distTop && distLeft <= distBottom) {
        enemy.targetAngle = Math.PI + (Math.random() - 0.5) * 0.3;
      } else if (distRight <= distLeft && distRight <= distTop && distRight <= distBottom) {
        enemy.targetAngle = 0 + (Math.random() - 0.5) * 0.3;
      } else if (distTop <= distLeft && distTop <= distRight && distTop <= distBottom) {
        enemy.targetAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      } else {
        enemy.targetAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      }
      enemy.turnTimer = 200 + Math.random() * 220;
    }
    if (!enemy.leaving && enemy.turnTimer <= 0) {
      enemy.turnTimer = 5200 + Math.random() * 2800;
      enemy.targetAngle = Math.random() * Math.PI * 2;
    }
    if (!enemy.leaving && enemy.bounceTimer <= 0 && (enemy.x < enemy.radius || enemy.x > gameBounds.width - enemy.radius || enemy.y < enemy.radius || enemy.y > gameBounds.height - enemy.radius)) {
      enemy.targetAngle = Math.atan2(gameBounds.height / 2 - enemy.y, gameBounds.width / 2 - enemy.x) + (Math.random() - 0.5) * 0.8;
      enemy.turnTimer = 600 + Math.random() * 500;
      enemy.bounceTimer = 1200;
    }
    if (enemy.targetAngle != null) {
      const diff = shortestAngleDiff(enemy.angle, enemy.targetAngle);
      const step = enemy.turnSpeed * deltaTime * 3;
      if (Math.abs(diff) < step) {
        enemy.angle = enemy.targetAngle;
        enemy.targetAngle = null;
      } else {
        enemy.angle = normalizeAngle(enemy.angle + Math.sign(diff) * step);
      }
      enemy.dx = Math.cos(enemy.angle) * enemy.speed;
      enemy.dy = Math.sin(enemy.angle) * enemy.speed;
    }
    enemy.x += enemy.dx * deltaTime;
    enemy.y += enemy.dy * deltaTime;
    if (enemy.x < -enemy.radius * 2 || enemy.x > gameBounds.width + enemy.radius * 2 || enemy.y < -enemy.radius * 2 || enemy.y > gameBounds.height + enemy.radius * 2) {
      Object.assign(enemy, createEnemy());
    }
  });
}

function checkCollisions() {
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];
    if (enemy.leaving) continue;
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (dist < player.radius + enemy.radius) {
      if (enemy.radius <= player.radius * EAT_SIZE_RATIO) {
        if (enemy.rank === 4) {
          score += enemy.rank * 10;
          const burstX = enemy.x;
          const burstY = enemy.y;
          enemies.splice(i, 1);
          winGame(burstX, burstY);
          return;
        }
        score += enemy.rank * 10;
        player.radius = Math.min(120, player.radius + enemy.rank * PLAYER_GROWTH);
        updatePlayerLevelBySize();
        if (score >= level * LEVEL_SCORE_BASE) {
          level += 1;
          player.speed = Math.min(0.14, player.speed + 0.004);
        }
        enemies.splice(i, 1);
        enemies.push(createEnemy());
      } else {
        shrinkPlayerGrowth();
        sendEnemyAway(enemy);
      }
    }
  }
}

function drawSprite(img, x, y, radius, angle = 0) {
  if (!img) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const size = radius * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.drawImage(img, -radius, -radius, size, size);
  ctx.restore();
}

function createVictoryParticle(x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = 1.2 + Math.random() * 3.2;
  const colors = ['#f8e16c', '#7dd3fc', '#ffffff', '#4fd1c5'];
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 110 + Math.random() * 45,
    maxLife: 155,
    radius: 3 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
  };
}

function updateParticles(deltaTime) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= deltaTime * 9;
    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.vx *= 0.98;
    p.vy *= 0.98;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  particles.forEach((p) => {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function render() {
  ctx.clearRect(0, 0, gameBounds.width, gameBounds.height);
  ctx.fillStyle = 'rgba(2, 14, 30, 0.18)';
  ctx.fillRect(0, 0, gameBounds.width, gameBounds.height);
  drawBubbles();
  enemies.forEach((enemy) => drawSprite(enemy.image, enemy.x, enemy.y, enemy.radius, enemy.angle));
  drawSprite(player.image, player.x, player.y, player.radius, player.angle);
  drawParticles();
}

function maybeSpawnEnemy(timestamp) {
  if (timestamp - lastSpawnTime < SPAWN_INTERVAL) return;
  lastSpawnTime = timestamp;
  if (enemies.length < MAX_ENEMIES) {
    enemies.push(createEnemy());
  }
}

function requestGameFrame() {
  if (framePending) return;
  framePending = true;
  animationId = requestAnimationFrame(gameLoop);
}

function gameLoop(timestamp) {
  framePending = false;
  if (gameState !== 'running' && gameState !== 'won') return;
  const deltaTime = 1.3;
  updateBubbles(deltaTime);
  updateParticles(deltaTime);
  if (gameState === 'running') {
    updatePlayer(deltaTime);
    updateEnemies(deltaTime);
    checkCollisions();
    if (gameState === 'running') {
      maybeSpawnEnemy(timestamp);
    }
  }
  render();
  updateHud();
  if (gameState === 'won' && particles.length === 0) {
    animationId = null;
    return;
  }
  requestGameFrame();
}

function startGame() {
  if (animationId) cancelAnimationFrame(animationId);
  framePending = false;
  score = 0;
  level = 1;
  particles.length = 0;
  player = createPlayer();
  enemies.length = 0;
  for (let i = 0; i < MAX_ENEMIES; i += 1) {
    enemies.push(createEnemy());
  }
  initBubbles();
  lastSpawnTime = performance.now() - SPAWN_INTERVAL;
  gameState = 'running';
  overlay.classList.add('hidden');
  updateHud();
  requestGameFrame();
}

function pauseGame() {
  if (gameState !== 'running') return;
  gameState = 'paused';
  overlayTitle.textContent = '已暂停';
  overlayText.textContent = '按空格继续游戏';
  startButton.textContent = '继续游戏';
  overlay.classList.remove('hidden');
  if (animationId) cancelAnimationFrame(animationId);
  framePending = false;
}

function resumeGame() {
  gameState = 'running';
  overlay.classList.add('hidden');
  requestGameFrame();
}

function winGame(x = player.x, y = player.y) {
  gameState = 'won';
  overlayTitle.textContent = '';
  overlayText.textContent = '';
  startButton.textContent = '';
  overlay.classList.add('hidden');
  for (let i = 0; i < 90; i += 1) {
    particles.push(createVictoryParticle(
      x + (Math.random() - 0.5) * 32,
      y + (Math.random() - 0.5) * 32
    ));
  }
  updateHud();
  requestGameFrame();
}

function endGame() {
  gameState = 'over';
  overlayTitle.textContent = '游戏结束';
  overlayText.textContent = `你的得分：${score}，等级：${level}`;
  startButton.textContent = '再来一次';
  overlay.classList.remove('hidden');
  if (animationId) cancelAnimationFrame(animationId);
  framePending = false;
}

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = gameBounds.width / rect.width;
  const scaleY = gameBounds.height / rect.height;
  mouse.x = (event.clientX - rect.left) * scaleX;
  mouse.y = (event.clientY - rect.top) * scaleY;
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  event.preventDefault();
  if (gameState === 'running') {
    pauseGame();
  } else if (gameState === 'paused') {
    resumeGame();
  } else if (gameState === 'ready' || gameState === 'over' || gameState === 'won') {
    startGame();
  }
});

window.addEventListener('resize', resizeCanvas);

startButton.addEventListener('click', () => {
  if (gameState === 'ready' || gameState === 'over' || gameState === 'won') {
    startGame();
  } else if (gameState === 'paused') {
    resumeGame();
  }
});

loadImages(() => {
  resizeCanvas();
  overlay.classList.remove('hidden');
  overlayTitle.textContent = '大鱼吃小鱼';
  overlayText.textContent = '用鼠标移动主鱼，吃掉图中的最大鱼即可胜利。';
  startButton.textContent = '开始游戏';
  const goalFish = document.getElementById('goalFish');
  if (goalFish) {
    goalFish.src = images.enemy4;
  }
});
