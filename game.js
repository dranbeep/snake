const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const levelEl = document.querySelector("#level");
const comboEl = document.querySelector("#combo");
const shieldEl = document.querySelector("#shield");
const waveEl = document.querySelector("#wave");
const overlay = document.querySelector("#overlay");
const overlayKicker = document.querySelector("#overlay-kicker");
const overlayTitle = document.querySelector("#overlay-title");
const startBtn = document.querySelector("#start-btn");
const pauseBtn = document.querySelector("#pause-btn");
const restartBtn = document.querySelector("#restart-btn");
const speedSelect = document.querySelector("#speed");

const cells = 20;
const tile = canvas.width / cells;
const bestKey = "snake-best-score";
const headScale = 1.62;
const comboWindow = 4800;
const foodsPerLevel = 9;
const headImage = new Image();
const specialImage = new Image();

const vectors = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const specialTypes = [
  { type: "gold", color: "#ffbf47", score: 40, label: "金果" },
  { type: "ice", color: "#7ed7ff", score: 10, label: "冰果" },
  { type: "lightning", color: "#d4f35a", score: 15, label: "闪电" },
  { type: "shield", color: "#54a8ff", score: 15, label: "护盾" },
  { type: "reverse", color: "#c77dff", score: 25, label: "反向" },
  { type: "phase", color: "#f4f7fb", score: 20, label: "穿透" },
  { type: "avatar", color: "#ff7ac8", score: 120, label: "情侣合体", rare: true },
];

let snake;
let food;
let specials;
let obstacles;
let boss;
let direction;
let nextDirection;
let score;
let best = Number(localStorage.getItem(bestKey) || 0);
let level;
let eaten;
let combo;
let comboUntil;
let shield;
let phaseUntil;
let speedUntil;
let slowUntil;
let doubleUntil;
let reverseUntil;
let loveUntil;
let specialNoticeUntil;
let specialNoticeText;
let avatarGuaranteedLevel;
let shockwaves;
let shockwaveCharges;
let shieldFlashUntil;
let debrisParticles;
let running = false;
let paused = false;
let animationFrame = null;
let lastStep = 0;
let lastSpecialAt = 0;
let bossStep = 0;

headImage.src = "snake-head.jpg";
headImage.addEventListener("load", draw);
headImage.addEventListener("error", draw);
specialImage.src = "special.png";
specialImage.addEventListener("load", draw);
specialImage.addEventListener("error", draw);
bestEl.textContent = best;

function resetState() {
  snake = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  score = 0;
  level = 1;
  eaten = 0;
  combo = 0;
  comboUntil = 0;
  shield = 0;
  phaseUntil = 0;
  speedUntil = 0;
  slowUntil = 0;
  doubleUntil = 0;
  reverseUntil = 0;
  loveUntil = 0;
  specialNoticeUntil = 0;
  specialNoticeText = "";
  avatarGuaranteedLevel = false;
  shockwaves = [];
  shockwaveCharges = 0;
  shieldFlashUntil = 0;
  debrisParticles = [];
  specials = [];
  obstacles = [];
  boss = null;
  bossStep = 0;
  food = spawnFreeCell();
  updateHud();
  draw();
}

function startGame() {
  resetState();
  running = true;
  paused = false;
  lastStep = performance.now();
  lastSpecialAt = performance.now();
  hideOverlay();
  startAnimation();
}

function startAnimation() {
  cancelAnimationFrame(animationFrame);
  const animate = (now) => {
    update(now);
    draw();
    animationFrame = requestAnimationFrame(animate);
  };
  animationFrame = requestAnimationFrame(animate);
}

function update(now) {
  if (!running || paused) {
    return;
  }

  cleanupSpecials(now);
  maybeSpawnSpecial(now);
  updateShockwaves(now);
  updateDebris(now);

  const speed = getStepSpeed(now);
  if (now - lastStep < speed) {
    return;
  }

  lastStep = now;
  step(now);
}

function step(now) {
  direction = nextDirection;
  const head = snake[0];
  const newHead = wrapCell(add(head, direction));

  const hitSelf = hitsSnake(newHead);
  const obstacleIndex = obstacles.findIndex((part) => sameCell(part, newHead));
  if (hitSelf && now >= phaseUntil) {
    if (shield > 0) {
      shield -= 1;
    } else {
      endGame("撞到自己");
      return;
    }
  }
  if (obstacleIndex >= 0 && now >= phaseUntil) {
    if (shield > 0) {
      shield -= 1;
      obstacles.splice(obstacleIndex, 1);
    } else {
      endGame("撞到障碍");
      return;
    }
  }

  if (boss && sameCell(newHead, boss)) {
    if (shield > 0) {
      shield -= 1;
      boss = spawnFreeCell();
    } else {
      endGame("被追上了");
      return;
    }
  }

  snake.unshift(newHead);
  let grew = false;

  if (sameCell(newHead, food)) {
    ateFood(now, 10);
    food = spawnFreeCell();
    grew = true;
  }

  const specialIndex = specials.findIndex((item) => sameCell(newHead, item));
  if (specialIndex >= 0) {
    ateSpecial(specials[specialIndex], now);
    specials.splice(specialIndex, 1);
    grew = true;
  }

  if (!grew) {
    snake.pop();
  }

  moveBoss(now);
  updateHud();
}

function ateFood(now, baseScore) {
  eaten += 1;
  combo = now < comboUntil ? combo + 1 : 1;
  comboUntil = now + comboWindow;
  addScore(baseScore, now);
  maybeGrowObstacles();

  const nextLevel = 1 + Math.floor(eaten / foodsPerLevel);
  if (nextLevel > level) {
    level = nextLevel;
    rebuildObstacles();
    maybeGuaranteeAvatar(now);
    if (level >= 5 && !boss) {
      boss = spawnFreeCell();
    }
  }
}

function ateSpecial(item, now) {
  combo = now < comboUntil ? combo + 1 : 1;
  comboUntil = now + comboWindow;
  addScore(item.score, now);

  if (item.type === "ice") {
    slowUntil = now + 4500;
  } else if (item.type === "lightning") {
    speedUntil = now + 4500;
    doubleUntil = now + 4500;
  } else if (item.type === "shield") {
    shield = Math.min(3, shield + 1);
    showShieldGain(now, "护盾 +1");
  } else if (item.type === "reverse") {
    reverseUntil = now + 5000;
  } else if (item.type === "phase") {
    phaseUntil = now + 4500;
  } else if (item.type === "avatar") {
    triggerAvatarPower(now);
  }
}

function triggerAvatarPower(now) {
  addScore(120, now);
  shield = Math.min(5, shield + 1);
  shockwaveCharges = Math.min(3, shockwaveCharges + 1);
  doubleUntil = now + 8000;
  loveUntil = now + 8000;
  showShieldGain(now, "护盾 +1");
  specialNoticeUntil = now + 2600;
  specialNoticeText = "情侣合体  冲击波 +1";
  updateHud();
}

function showShieldGain(now, text) {
  shieldFlashUntil = now + 1800;
  specialNoticeUntil = Math.max(specialNoticeUntil, now + 1300);
  specialNoticeText = text;
}

function triggerShockwave(now) {
  if (!running || paused || shockwaveCharges <= 0) {
    return;
  }

  shockwaveCharges -= 1;
  const head = snake[0];
  shockwaves.push({
    x: head.x * tile + tile / 2,
    y: head.y * tile + tile / 2,
    start: now,
    duration: 760,
    maxRadius: canvas.width * 1.15,
  });
  specialNoticeUntil = now + 1300;
  specialNoticeText = "冲击波";
  updateHud();
}

function updateShockwaves(now) {
  shockwaves.forEach((wave) => {
    const progress = Math.min(1, (now - wave.start) / wave.duration);
    const radius = easeOutCubic(progress) * wave.maxRadius;
    obstacles = obstacles.filter((item) => {
      const center = cellCenter(item);
      const hitDistance = Math.hypot(center.cx - wave.x, center.cy - wave.y);
      if (hitDistance <= radius) {
        spawnDebris(center.cx, center.cy, wave.x, wave.y, now);
        return false;
      }
      return true;
    });
  });
  shockwaves = shockwaves.filter((wave) => now - wave.start < wave.duration + 180);
}

function spawnDebris(cx, cy, originX, originY, now) {
  const baseAngle = Math.atan2(cy - originY, cx - originX);
  for (let i = 0; i < 9; i += 1) {
    const angle = baseAngle + (Math.random() - 0.5) * 1.8;
    const speed = 1.6 + Math.random() * 3.4;
    debrisParticles.push({
      x: cx + (Math.random() - 0.5) * 16,
      y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 0.28,
      rotation: Math.random() * Math.PI,
      start: now,
      life: 620 + Math.random() * 360,
      color: Math.random() > 0.45 ? "#74808b" : "#3e4855",
    });
  }
}

function updateDebris(now) {
  debrisParticles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.965;
    particle.vy = particle.vy * 0.965 + 0.035;
    particle.rotation += particle.spin;
  });
  debrisParticles = debrisParticles.filter((particle) => now - particle.start < particle.life);
}

function addScore(points, now) {
  const comboBonus = Math.min(5, combo);
  const doubleBonus = now < doubleUntil ? 2 : 1;
  score += points * comboBonus * doubleBonus;
  if (score > best) {
    best = score;
    localStorage.setItem(bestKey, String(best));
  }
}

function setDirection(dir) {
  const now = performance.now();
  const actualDir = now < reverseUntil ? reverseDirectionName(dir) : dir;
  const wanted = vectors[actualDir];
  if (!wanted || (wanted.x + direction.x === 0 && wanted.y + direction.y === 0)) {
    return;
  }
  nextDirection = wanted;
}

function reverseDirectionName(dir) {
  const map = { up: "down", down: "up", left: "right", right: "left" };
  return map[dir] || dir;
}

function moveBoss(now) {
  if (!boss || level < 5) {
    return;
  }

  bossStep += 1;
  if (bossStep % Math.max(3, 8 - Math.min(level, 5)) !== 0) {
    return;
  }

  const head = snake[0];
  const choices = [
    { x: Math.sign(head.x - boss.x), y: 0 },
    { x: 0, y: Math.sign(head.y - boss.y) },
    vectors.up,
    vectors.down,
    vectors.left,
    vectors.right,
  ].filter((candidate) => candidate.x !== 0 || candidate.y !== 0);

  const next = choices
    .map((candidate) => add(boss, candidate))
    .filter((cell) => !isOutsideBoard(cell) && !hitsObstacle(cell))
    .sort((a, b) => distance(a, head) - distance(b, head))[0];

  if (next) {
    boss = next;
  }

  if (sameCell(boss, head)) {
    endGame("被追上了");
  }
}

function rebuildObstacles() {
  const target = getObstacleTarget();
  while (obstacles.length < target) {
    obstacles.push(spawnFreeCell());
  }
}

function maybeGrowObstacles() {
  const target = getObstacleTarget();
  const shouldAdd = eaten >= 4 && eaten % 2 === 0;
  if (shouldAdd && obstacles.length < target) {
    obstacles.push(spawnFreeCell());
  }
}

function getObstacleTarget() {
  return Math.min(18, Math.max(2, level * 2 + Math.floor(eaten / 10)));
}

function maybeGuaranteeAvatar(now) {
  if (level !== 2 || avatarGuaranteedLevel) {
    return;
  }

  avatarGuaranteedLevel = true;
  spawnAvatarSpecial(now);
}

function spawnAvatarSpecial(now) {
  if (specials.some((item) => item.type === "avatar")) {
    return;
  }

  if (specials.length >= 4) {
    const removableIndex = specials.findIndex((item) => item.type !== "avatar");
    if (removableIndex >= 0) {
      specials.splice(removableIndex, 1);
    } else {
      specials.shift();
    }
  }

  const template = specialTypes.find((item) => item.type === "avatar");
  specials.push({
    ...spawnFreeCell(),
    ...template,
    expiresAt: now + 7200,
  });
  specialNoticeUntil = now + 2400;
  specialNoticeText = "头像果出现";
}

function maybeSpawnSpecial(now) {
  if (specials.length >= 4 || now - lastSpecialAt < 3300) {
    return;
  }

  lastSpecialAt = now;
  if (Math.random() > 0.5) {
    return;
  }

  const pool =
    Math.random() < 0.1
      ? specialTypes.filter((item) => item.type === "avatar")
      : specialTypes.filter((item) => !item.rare);
  const template = pool[Math.floor(Math.random() * pool.length)];
  specials.push({
    ...spawnFreeCell(),
    ...template,
    expiresAt: now + (template.type === "gold" ? 6500 : template.type === "avatar" ? 5600 : 8200),
  });

  if (template.type === "avatar") {
    specialNoticeUntil = now + 2200;
    specialNoticeText = "头像果出现";
  }
}

function cleanupSpecials(now) {
  specials = specials.filter((item) => item.expiresAt > now);
  if (combo > 0 && now > comboUntil) {
    combo = 0;
  }
}

function getStepSpeed(now) {
  let speed = Number(speedSelect.value) - Math.min(32, (level - 1) * 4);
  if (now < speedUntil) {
    speed *= 0.68;
  }
  if (now < slowUntil) {
    speed *= 1.45;
  }
  return Math.max(48, speed);
}

function spawnFreeCell() {
  let spot;
  do {
    spot = {
      x: Math.floor(Math.random() * cells),
      y: Math.floor(Math.random() * cells),
    };
  } while (!isCellFree(spot));
  return spot;
}

function isCellFree(cell) {
  return (
    !snake?.some((part) => sameCell(part, cell)) &&
    !sameCell(food, cell) &&
    !specials?.some((item) => sameCell(item, cell)) &&
    !obstacles?.some((item) => sameCell(item, cell)) &&
    !sameCell(boss, cell)
  );
}

function isMoveSafe(cell) {
  return !isOutsideBoard(cell) && !hitsSnake(cell) && !hitsObstacle(cell) && !sameCell(boss, cell);
}

function wrapCell(point) {
  return {
    x: (point.x + cells) % cells,
    y: (point.y + cells) % cells,
  };
}

function isOutsideBoard(point) {
  return point.x < 0 || point.x >= cells || point.y < 0 || point.y >= cells;
}

function hitsSnake(point) {
  return snake.some((part) => sameCell(part, point));
}

function hitsObstacle(point) {
  return obstacles.some((part) => sameCell(part, point));
}

function sameCell(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function endGame(reason) {
  running = false;
  cancelAnimationFrame(animationFrame);
  showOverlay(reason, `得分 ${score}`);
}

function togglePause() {
  if (!running) {
    return;
  }
  paused = !paused;
  pauseBtn.querySelector("span").textContent = paused ? "▶" : "Ⅱ";
  if (paused) {
    showOverlay("已暂停", "按空格继续");
  } else {
    hideOverlay();
    lastStep = performance.now();
  }
}

function showOverlay(kicker, title) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  startBtn.textContent = running ? "继续游戏" : "再来一局";
  overlay.classList.add("is-visible");
}

function hideOverlay() {
  overlay.classList.remove("is-visible");
  pauseBtn.querySelector("span").textContent = "Ⅱ";
}

function updateHud() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = level;
  comboEl.textContent = combo > 1 ? `x${Math.min(5, combo)}` : "x1";
  shieldEl.textContent = shield;
  waveEl.textContent = shockwaveCharges;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawObstacles();
  drawDebris();
  drawFood();
  drawSpecials();
  drawBoss();
  drawSnake();
  drawShockwaves();
  drawEffectOverlays();
}

function drawBoard() {
  ctx.fillStyle = "#121820";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      if ((i + j + level) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
        ctx.fillRect(i * tile, j * tile, tile, tile);
      }
    }
  }

  drawPortalEdges();
}

function drawPortalEdges() {
  const pulse = 0.45 + Math.sin(performance.now() / 220) * 0.18;
  const color = getDominantEffectColor();
  ctx.fillStyle = rgba(color, pulse);
  ctx.fillRect(0, 0, canvas.width, 4);
  ctx.fillRect(0, canvas.height - 4, canvas.width, 4);
  ctx.fillRect(0, 0, 4, canvas.height);
  ctx.fillRect(canvas.width - 4, 0, 4, canvas.height);

  if (color !== "84, 168, 255") {
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  }
}

function drawObstacles() {
  obstacles.forEach((item) => {
    const x = item.x * tile + 4;
    const y = item.y * tile + 4;
    const crack = (item.x * 17 + item.y * 11) % 9;
    ctx.fillStyle = "#3e4855";
    roundRect(x, y, tile - 8, tile - 8, 6);
    ctx.fill();
    ctx.strokeStyle = "#74808b";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(x + 5, y + 6, tile - 18, 3);
    ctx.strokeStyle = "rgba(7, 16, 20, 0.45)";
    ctx.beginPath();
    ctx.moveTo(x + 8 + crack, y + 11);
    ctx.lineTo(x + 15, y + 17 + crack * 0.4);
    ctx.lineTo(x + 10 + crack * 0.8, y + 24);
    ctx.stroke();
  });
}

function drawDebris() {
  const now = performance.now();
  debrisParticles.forEach((particle) => {
    const age = (now - particle.start) / particle.life;
    const alpha = Math.max(0, 1 - age);

    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    ctx.fillStyle = "rgba(244, 247, 251, 0.26)";
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, 1.4);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function drawShockwaves() {
  const now = performance.now();
  shockwaves.forEach((wave) => {
    const progress = Math.min(1, (now - wave.start) / wave.duration);
    const radius = easeOutCubic(progress) * wave.maxRadius;
    const fade = 1 - progress;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(84, 168, 255, ${0.85 * fade})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(212, 243, 90, ${0.55 * fade})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, Math.max(0, radius - 18), 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 22; i += 1) {
      const angle = (i / 22) * Math.PI * 2 + now / 260;
      const sparkRadius = radius + Math.sin(now / 80 + i) * 10;
      const x = wave.x + Math.cos(angle) * sparkRadius;
      const y = wave.y + Math.sin(angle) * sparkRadius;
      ctx.fillStyle = `rgba(244, 247, 251, ${0.7 * fade})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2 + fade * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawSnake() {
  snake.forEach((part, index) => {
    if (index === 0) {
      drawHead(part);
      return;
    }

    const inset = 5;
    const x = part.x * tile + inset;
    const y = part.y * tile + inset;
    const size = tile - inset * 2;
    const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
    gradient.addColorStop(0, "#55d878");
    gradient.addColorStop(1, "#1fa463");

    ctx.fillStyle = gradient;
    roundRect(x, y, size, size, 8);
    ctx.fill();
  });
}

function drawHead(part) {
  const centerX = part.x * tile + tile / 2;
  const centerY = part.y * tile + tile / 2;
  const size = tile * headScale;
  const baseAngle = directionToAngle(direction);
  const angle = baseAngle;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);

  if (headImage.complete && headImage.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(headImage, -size / 2, -size / 2, size, size);
    ctx.restore();

    ctx.strokeStyle = shield > 0 ? "#54a8ff" : "#d4f35a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    drawFallbackHead(size);
  }

  ctx.restore();

  drawHeadEffectAura(centerX, centerY, size);
  drawShieldFlash(centerX, centerY, size);
}

function directionToAngle(vector) {
  if (vector.y === -1) {
    return 0;
  }
  if (vector.x === 1) {
    return Math.PI / 2;
  }
  if (vector.y === 1) {
    return Math.PI;
  }
  return -Math.PI / 2;
}

function drawFallbackHead(size) {
  const gradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "#d4f35a");
  gradient.addColorStop(1, "#54a8ff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawFood() {
  drawOrb(food, "#ff5d5d", 10, "#ffbf47");
}

function drawSpecials() {
  const now = performance.now();
  specials.forEach((item) => {
    const blink = item.expiresAt - now < 1600 && Math.floor(now / 120) % 2 === 0;
    if (blink) {
      return;
    }
    if (item.type === "avatar") {
      drawAvatarSpecial(item);
    } else {
      drawSpecialOrb(item);
    }
  });
}

function drawSpecialOrb(item) {
  if (item.type === "shield") {
    drawShieldItem(item);
    return;
  }
  if (item.type === "lightning") {
    drawLightningItem(item);
    return;
  }
  if (item.type === "reverse") {
    drawReverseItem(item);
    return;
  }
  if (item.type === "phase") {
    drawPhaseItem(item);
    return;
  }
  if (item.type === "ice") {
    drawIceItem(item);
    return;
  }
  drawOrb(item, item.color, item.type === "gold" ? 12 : 10, "#ffffff");
}

function drawShieldItem(item) {
  const { cx, cy } = cellCenter(item);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "#54a8ff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#54a8ff";
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(12, -7);
  ctx.lineTo(9, 8);
  ctx.quadraticCurveTo(0, 15, -9, 8);
  ctx.lineTo(-12, -7);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f4f7fb";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawLightningItem(item) {
  const { cx, cy } = cellCenter(item);
  drawOrb(item, "#d4f35a", 11, "#ffffff");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#071014";
  ctx.beginPath();
  ctx.moveTo(-1, -13);
  ctx.lineTo(9, -13);
  ctx.lineTo(2, -2);
  ctx.lineTo(10, -2);
  ctx.lineTo(-5, 14);
  ctx.lineTo(-1, 2);
  ctx.lineTo(-9, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawReverseItem(item) {
  const { cx, cy } = cellCenter(item);
  drawOrb(item, "#c77dff", 11, "#ffffff");
  ctx.save();
  ctx.fillStyle = "#071014";
  ctx.font = "900 18px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("↔", cx, cy + 1);
  ctx.restore();
}

function drawPhaseItem(item) {
  const { cx, cy } = cellCenter(item);
  ctx.save();
  ctx.shadowColor = "#f4f7fb";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#f4f7fb";
  ctx.beginPath();
  ctx.arc(cx, cy, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#74808b";
  ctx.lineWidth = 3;
  for (let offset = -12; offset <= 12; offset += 8) {
    ctx.beginPath();
    ctx.moveTo(cx + offset - 10, cy + 12);
    ctx.lineTo(cx + offset + 12, cy - 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawIceItem(item) {
  const { cx, cy } = cellCenter(item);
  drawOrb(item, "#7ed7ff", 11, "#ffffff");
  ctx.save();
  ctx.strokeStyle = "#f4f7fb";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i += 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.moveTo(5, -4);
    ctx.lineTo(9, 0);
    ctx.lineTo(5, 4);
    ctx.moveTo(-5, -4);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-5, 4);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawAvatarSpecial(item) {
  const now = performance.now();
  const cx = item.x * tile + tile / 2;
  const cy = item.y * tile + tile / 2;
  const size = tile * (1.24 + Math.sin(now / 150) * 0.06);
  const ring = tile * 0.86;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(now / 420);
  ctx.strokeStyle = "#ff7ac8";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (specialImage.complete && specialImage.naturalWidth > 0) {
    ctx.drawImage(specialImage, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = "#ff7ac8";
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  }
  ctx.restore();

  ctx.strokeStyle = "#f4f7fb";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBoss() {
  if (!boss) {
    return;
  }
  const cx = boss.x * tile + tile / 2;
  const cy = boss.y * tile + tile / 2;
  ctx.fillStyle = "#ff5d5d";
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#071014";
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 3, 2, 0, Math.PI * 2);
  ctx.arc(cx + 4, cy - 3, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawOrb(cell, color, radius, shine) {
  const { cx, cy } = cellCenter(cell);
  const pulse = 1 + Math.sin(Date.now() / 160) * 0.05;

  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
  ctx.fill();
}

function cellCenter(cell) {
  return {
    cx: cell.x * tile + tile / 2,
    cy: cell.y * tile + tile / 2,
  };
}

function drawEffectOverlays() {
  const now = performance.now();
  const effects = getActiveEffects(now);

  drawEffectBanner(effects, now);
  drawEffectPills(effects, now);
  drawShockwaveReadyPrompt(now);

  if (now < specialNoticeUntil) {
    drawSpecialNotice();
  }
}

function getActiveEffects(now) {
  const effects = [];
  if (now < speedUntil) {
    effects.push({ text: "闪电 x2", color: "#d4f35a", rgb: "212, 243, 90", until: speedUntil });
  }
  if (now < slowUntil) {
    effects.push({ text: "冰冻减速", color: "#7ed7ff", rgb: "126, 215, 255", until: slowUntil });
  }
  if (now < reverseUntil) {
    effects.push({ text: "方向反转", color: "#c77dff", rgb: "199, 125, 255", until: reverseUntil });
  }
  if (now < phaseUntil) {
    effects.push({ text: "穿透障碍", color: "#f4f7fb", rgb: "244, 247, 251", until: phaseUntil });
  }
  if (now < loveUntil) {
    effects.push({ text: "情侣合体", color: "#ff7ac8", rgb: "255, 122, 200", until: loveUntil, major: true });
  }
  return effects;
}

function drawEffectBanner(effects, now) {
  if (effects.length === 0) {
    return;
  }

  const primary = effects.find((effect) => effect.major) || effects[0];
  const remaining = Math.max(0, Math.ceil((primary.until - now) / 1000));
  const text = `${primary.text} ${remaining}s`;
  const width = Math.max(210, text.length * 20 + 42);
  const height = primary.major ? 58 : 48;
  const x = canvas.width / 2 - width / 2;
  const y = 18 + Math.sin(now / 140) * 2;

  ctx.save();
  ctx.fillStyle = `rgba(7, 16, 20, ${primary.major ? 0.9 : 0.82})`;
  roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = primary.color;
  ctx.lineWidth = primary.major ? 4 : 3;
  ctx.stroke();
  ctx.shadowColor = primary.color;
  ctx.shadowBlur = primary.major ? 26 : 14;
  ctx.fillStyle = primary.color;
  ctx.font = `${primary.major ? "900 28px" : "800 22px"} Microsoft YaHei, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, y + (primary.major ? 38 : 31));
  ctx.restore();
}

function drawEffectPills(effects, now) {
  effects.slice(0, 5).forEach((effect, index) => {
    const remaining = Math.max(0, Math.ceil((effect.until - now) / 1000));
    const text = `${effect.text} ${remaining}s`;
    const x = 14;
    const y = canvas.height - 20 - (index + 1) * 34;
    const width = Math.max(136, text.length * 13 + 24);

    ctx.fillStyle = "rgba(7, 16, 20, 0.82)";
    roundRect(x, y, width, 26, 8);
    ctx.fill();
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = effect.color;
    ctx.font = "700 14px Microsoft YaHei, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(text, x + 12, y + 18);
  });
}

function drawHeadEffectAura(centerX, centerY, size) {
  const now = performance.now();
  const effects = getActiveEffects(now);
  if (effects.length === 0) {
    return;
  }

  const primary = effects.find((effect) => effect.major) || effects[0];
  const radius = size * (0.76 + Math.sin(now / 130) * 0.07);

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = rgba(primary.rgb, 0.78);
  ctx.lineWidth = primary.major ? 4 : 3;
  ctx.setLineDash(primary.major ? [5, 7] : [10, 6]);
  ctx.rotate(now / 420);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (primary.major) {
    drawLoveParticles(now, size);
  } else {
    drawEffectSparks(now, size, primary);
  }

  ctx.restore();
}

function drawShieldFlash(centerX, centerY, size) {
  const now = performance.now();
  if (now >= shieldFlashUntil) {
    return;
  }

  const progress = 1 - (shieldFlashUntil - now) / 1800;
  const alpha = 1 - progress;
  const radius = size * (0.82 + progress * 0.7);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(84, 168, 255, ${0.9 * alpha})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(84, 168, 255, ${0.16 * alpha})`;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.86, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLoveParticles(now, size) {
  for (let i = 0; i < 8; i += 1) {
    const angle = now / 340 + (i * Math.PI * 2) / 8;
    const radius = size * (0.7 + (i % 3) * 0.09);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    drawHeart(x, y, 4.8 + Math.sin(now / 150 + i) * 1.2, "#ff7ac8");
  }
}

function drawEffectSparks(now, size, effect) {
  for (let i = 0; i < 6; i += 1) {
    const angle = -now / 380 + (i * Math.PI * 2) / 6;
    const radius = size * 0.72;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeart(x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 10, size / 10);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-9, -4, -5, -12, 0, -7);
  ctx.bezierCurveTo(5, -12, 9, -4, 0, 3);
  ctx.fill();
  ctx.restore();
}

function drawSpecialNotice() {
  const now = performance.now();
  const text = specialNoticeText || "特别道具";
  const width = Math.max(250, text.length * 28 + 58);
  const x = canvas.width / 2 - width / 2;
  const y = canvas.height / 2 - 42 + Math.sin(now / 120) * 3;

  ctx.save();
  ctx.fillStyle = "rgba(7, 16, 20, 0.88)";
  roundRect(x, y, width, 84, 8);
  ctx.fill();
  ctx.strokeStyle = "#ff7ac8";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#ff7ac8";
  ctx.shadowColor = "#ff7ac8";
  ctx.shadowBlur = 22;
  ctx.font = "900 34px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, y + 53);
  ctx.restore();
}

function drawShockwaveReadyPrompt(now) {
  if (!running || paused || shockwaveCharges <= 0) {
    return;
  }

  const pulse = 0.68 + Math.sin(now / 110) * 0.22;
  const text = `按 Ctrl 释放冲击波 x${shockwaveCharges}`;
  const width = 268;
  const height = 44;
  const x = canvas.width / 2 - width / 2;
  const y = canvas.height - 68;

  ctx.save();
  ctx.fillStyle = "rgba(7, 16, 20, 0.86)";
  roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = `rgba(84, 168, 255, ${pulse})`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.shadowColor = "#54a8ff";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#54a8ff";
  ctx.font = "900 22px Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, y + 29);
  ctx.restore();
}

function getDominantEffectColor() {
  const now = performance.now();
  if (now < loveUntil) {
    return "255, 122, 200";
  }
  if (now < reverseUntil) {
    return "199, 125, 255";
  }
  if (now < speedUntil) {
    return "212, 243, 90";
  }
  if (now < slowUntil) {
    return "126, 215, 255";
  }
  if (now < phaseUntil) {
    return "244, 247, 251";
  }
  return "84, 168, 255";
}

function rgba(rgb, alpha) {
  return `rgba(${rgb}, ${alpha})`;
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
  };

  if (event.key in keyMap) {
    event.preventDefault();
    setDirection(keyMap[event.key]);
  }

  if (event.key === "Control" && !event.repeat) {
    event.preventDefault();
    triggerShockwave(performance.now());
  }

  if (event.code === "Space") {
    event.preventDefault();
    if (running) {
      togglePause();
    } else {
      startGame();
    }
  }
});

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.dir));
});

startBtn.addEventListener("click", () => {
  if (running && paused) {
    togglePause();
  } else if (!running) {
    startGame();
  }
});

pauseBtn.addEventListener("click", togglePause);
restartBtn.addEventListener("click", startGame);
speedSelect.addEventListener("change", () => {
  lastStep = performance.now();
});

resetState();
