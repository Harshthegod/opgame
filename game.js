const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const startMenu = document.getElementById('startMenu');
const endScreen = document.getElementById('endScreen');
const playBtn = document.getElementById('playBtn');
const restartBtn = document.getElementById('restartBtn');
const modeNameEl = document.getElementById('modeName');
const zoneStatusEl = document.getElementById('zoneStatus');
const waveStatusEl = document.getElementById('waveStatus');
const timerStatusEl = document.getElementById('timerStatus');
const resourceStatsEl = document.getElementById('resourceStats');
const buildPanelEl = document.getElementById('buildPanel');
const endTitleEl = document.getElementById('endTitle');
const endSummaryEl = document.getElementById('endSummary');

const RNG = Math.random;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min, max) => min + RNG() * (max - min);

const presetConfig = {
  LOW: { particles: 20, shadowBlur: 0, drawClouds: false },
  MEDIUM: { particles: 45, shadowBlur: 6, drawClouds: true },
  HIGH: { particles: 80, shadowBlur: 12, drawClouds: true },
  ULTRA: { particles: 120, shadowBlur: 18, drawClouds: true },
};

const selectedState = {
  mode: 'solo',
  preset: 'HIGH',
};

const input = {
  keys: Object.create(null),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
};

const world = {
  width: 3400,
  height: 2400,
  time: 0,
  dayPhase: 0,
  matchLength: 180,
  safeZone: {
    x: 1700,
    y: 1200,
    r: 1100,
  },
  regions: [
    { name: 'Verdant Valley', x: 200, y: 260, w: 760, h: 760, color: '#3bbf6a' },
    { name: 'Neon District', x: 1060, y: 180, w: 760, h: 620, color: '#4b75ff' },
    { name: 'Frostfall Peaks', x: 2160, y: 180, w: 960, h: 620, color: '#b1d5ff' },
    { name: 'Sunscorch Desert', x: 2200, y: 1040, w: 900, h: 760, color: '#f3b35f' },
    { name: 'Skyport', x: 720, y: 1180, w: 980, h: 760, color: '#80d8ff' },
    { name: 'Crystal Caverns', x: 1400, y: 1500, w: 700, h: 610, color: '#77f5d5' },
    { name: 'Abandoned Facility', x: 300, y: 1220, w: 760, h: 760, color: '#8c86ff' },
    { name: 'Ancient Wilds', x: 1160, y: 760, w: 980, h: 900, color: '#68d687' },
  ],
  hub: { x: 1700, y: 1200, r: 160 },
  clouds: [],
  resources: [],
  buildings: [],
  projectiles: [],
  particles: [],
  bots: [],
  relics: [],
};

const game = {
  state: 'menu',
  selectedBuild: 'wall',
  buildOrder: ['wall', 'ramp', 'platform', 'barrier'],
  lastFrame: 0,
  matchTime: 0,
  winningTeam: null,
  player: null,
  mode: 'solo',
  preset: 'HIGH',
  wave: 0,
};

function resizeCanvas() {
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function addClouds() {
  world.clouds = Array.from({ length: 10 }, () => ({
    x: rand(0, world.width),
    y: rand(0, world.height * 0.5),
    r: rand(45, 120),
    speed: rand(8, 26),
    alpha: rand(0.08, 0.22),
  }));
}

function registerButtons() {
  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      selectedState.mode = button.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach((node) => node.classList.toggle('active', node === button));
    });
  });

  document.querySelectorAll('.preset-btn').forEach((button) => {
    button.addEventListener('click', () => {
      selectedState.preset = button.dataset.preset;
      document.querySelectorAll('.preset-btn').forEach((node) => node.classList.toggle('active', node === button));
    });
  });

  playBtn.addEventListener('click', () => {
    game.mode = selectedState.mode;
    game.preset = selectedState.preset;
    startRound();
  });

  restartBtn.addEventListener('click', () => {
    startRound();
  });
}

function startRound() {
  makeWorld();
  game.state = 'playing';
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  game.matchTime = 0;
  game.winningTeam = null;
  updateHud();
}

function createPlayer() {
  return {
    kind: 'player',
    name: 'You',
    x: 1700,
    y: 1200,
    radius: 18,
    health: 100,
    shield: 60,
    speed: 220,
    facing: 0,
    inventory: { wood: 14, metal: 12, crystal: 8, energy: 6 },
    kills: 0,
    cooldown: 0,
    dashCooldown: 0,
    isAlive: true,
    color: '#a9f6ff',
  };
}

function createBot(id) {
  const region = world.regions[id % world.regions.length];
  const isBrute = game.mode === 'survival' && game.wave >= 3 && id % 4 === 0;
  return {
    kind: 'bot',
    id,
    name: `Practice bot ${id + 1}`,
    x: rand(region.x + 80, region.x + region.w - 80),
    y: rand(region.y + 80, region.y + region.h - 80),
    radius: isBrute ? 19 : 14,
    health: (isBrute ? 145 : 80) + Math.max(0, game.wave - 1) * 7,
    shield: 0,
    speed: isBrute ? 82 : rand(110, 145) + Math.min(game.wave * 2, 34),
    facing: 0,
    fireCooldown: rand(0.5, 1.4),
    target: { x: world.hub.x, y: world.hub.y },
    wanderTimer: rand(1.5, 4),
    color: isBrute ? '#f49a63' : ['#ff8e72', '#ffd166', '#80ffb3', '#9d8cff'][id % 4],
    isBrute,
    isAlive: true,
  };
}

function makeWorld() {
  world.time = 0;
  world.dayPhase = 0;
  world.safeZone.x = 1700;
  world.safeZone.y = 1200;
  world.safeZone.r = 1100;
  world.resources = [];
  world.projectiles = [];
  world.particles = [];
  world.buildings = [];
  world.bots = [];
  game.player = createPlayer();

  for (let i = 0; i < 40; i += 1) {
    const region = world.regions[i % world.regions.length];
    const resourceType = ['wood', 'metal', 'crystal', 'energy'][i % 4];
    world.resources.push({
      x: rand(region.x + 60, region.x + region.w - 60),
      y: rand(region.y + 60, region.y + region.h - 60),
      type: resourceType,
      amount: 3,
      radius: 12,
    });
  }

  world.relics = [
    { x: 1700, y: 1200, name: 'Central Hub', color: '#7fe8ff', radius: 36 },
    { x: 420, y: 640, name: 'Verdant Ruin', color: '#8ff2b9', radius: 28 },
    { x: 2600, y: 650, name: 'Frost Research', color: '#d9ebff', radius: 30 },
    { x: 2600, y: 1750, name: 'Sun Temple', color: '#ffd98d', radius: 24 },
  ];

  if (game.mode === 'survival') {
    game.wave = 1;
    world.bots = createSurvivalWave();
  } else {
    game.wave = 0;
    const botCount = game.mode === 'solo' ? 12 : game.mode === 'duos' ? 15 : game.mode === 'squads' ? 18 : 14;
    for (let i = 0; i < botCount; i += 1) {
      world.bots.push(createBot(i));
    }
  }

  addClouds();
  game.selectedBuild = 'wall';
  buildPanelEl.innerHTML = '';
  ['wall', 'ramp', 'platform', 'barrier'].forEach((type, index) => {
    const item = document.createElement('div');
    item.className = `buildItem ${index === 0 ? 'active' : ''}`;
    item.textContent = `${type} · ${type === 'wall' ? 5 : type === 'ramp' ? 4 : type === 'platform' ? 6 : 3} mat`;
    item.dataset.type = type;
    buildPanelEl.appendChild(item);
  });
}

function createSurvivalWave() {
  const count = Math.min(3 + game.wave, 24);
  return Array.from({ length: count }, (_, id) => {
    const bot = createBot(id);
    const angle = rand(0, Math.PI * 2);
    const radius = rand(520, 760);
    bot.x = clamp(game.player.x + Math.cos(angle) * radius, 40, world.width - 40);
    bot.y = clamp(game.player.y + Math.sin(angle) * radius, 40, world.height - 40);
    bot.target = { x: game.player.x, y: game.player.y };
    return bot;
  });
}

function getBuildCost(type) {
  const costs = { wall: { wood: 4, metal: 2 }, ramp: { wood: 3, metal: 3 }, platform: { wood: 3, crystal: 2 }, barrier: { metal: 4, energy: 2 } };
  return costs[type] || { wood: 0 };
}

function canAfford(type) {
  const cost = getBuildCost(type);
  return Object.entries(cost).every(([key, value]) => game.player.inventory[key] >= value);
}

function deductCost(type) {
  const cost = getBuildCost(type);
  Object.entries(cost).forEach(([key, value]) => {
    game.player.inventory[key] -= value;
  });
}

function updateHud() {
  modeNameEl.textContent = game.mode === 'survival' ? 'RIFT SURVIVAL · LOCAL' : `${game.mode.toUpperCase()} PRACTICE · BOTS`;
  zoneStatusEl.textContent = game.mode === 'survival'
    ? 'Safe zone · stable'
    : `Safe zone ${Math.round(world.safeZone.r)}m`;
  waveStatusEl.textContent = game.mode === 'survival'
    ? `Wave ${game.wave} · ${world.bots.filter((bot) => bot.isAlive).length} remaining`
    : `${world.bots.filter((bot) => bot.isAlive).length} bots remaining`;
  const remaining = game.mode === 'survival'
    ? game.matchTime
    : Math.max(0, world.matchLength - game.matchTime);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(Math.floor(remaining % 60)).padStart(2, '0');
  timerStatusEl.textContent = game.mode === 'survival' ? `SURVIVED ${minutes}:${seconds}` : `${minutes}:${seconds}`;

  const statOrder = ['wood', 'metal', 'crystal', 'energy'];
  resourceStatsEl.innerHTML = statOrder.map((type) => {
    const colors = {
      wood: '#7adf88',
      metal: '#d3d5da',
      crystal: '#77f2ff',
      energy: '#ffdf6a',
    };
    return `
      <div class="resourceStat">
        <span class="dot" style="color:${colors[type]}; background:${colors[type]};"></span>
        <span>${type[0].toUpperCase() + type.slice(1)}: ${game.player.inventory[type]}</span>
      </div>
    `;
  }).join('');

  buildPanelEl.querySelectorAll('.buildItem').forEach((item) => {
    item.classList.toggle('active', item.dataset.type === game.selectedBuild);
  });
}

function worldToScreen(x, y) {
  const cx = canvas.width / (window.devicePixelRatio * 2);
  const cy = canvas.height / (window.devicePixelRatio * 2);
  return {
    x: x - game.player.x + cx,
    y: y - game.player.y + cy,
  };
}

function screenToWorld(x, y) {
  const cx = canvas.width / (window.devicePixelRatio * 2);
  const cy = canvas.height / (window.devicePixelRatio * 2);
  return {
    x: game.player.x + x - cx,
    y: game.player.y + y - cy,
  };
}

function handleKeydown(event) {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
  input.keys[key] = true;

  if (game.state !== 'playing') return;

  if (key === '1') game.selectedBuild = 'wall';
  if (key === '2') game.selectedBuild = 'ramp';
  if (key === '3') game.selectedBuild = 'platform';
  if (key === '4') game.selectedBuild = 'barrier';

  if (key === 'e') attemptCollect();
  if (key === 'b') attemptBuild();

  if (key === ' ') {
    if (game.player.dashCooldown <= 0) {
      const dashDir = { x: Math.cos(game.player.facing), y: Math.sin(game.player.facing) };
      game.player.x += dashDir.x * 70;
      game.player.y += dashDir.y * 70;
      game.player.x = clamp(game.player.x, 40, world.width - 40);
      game.player.y = clamp(game.player.y, 40, world.height - 40);
      game.player.dashCooldown = 1.4;
    }
  }
}

function handleKeyup(event) {
  input.keys[event.key.toLowerCase()] = false;
}

function handleMouseMove(event) {
  const rect = canvas.getBoundingClientRect();
  input.mouseX = event.clientX - rect.left;
  input.mouseY = event.clientY - rect.top;
}

function handlePointerDown() {
  if (game.state !== 'playing') return;
  input.mouseDown = true;
}

function handlePointerUp() {
  input.mouseDown = false;
}

function attemptBuild() {
  if (!game.player || !game.player.isAlive) return;
  const worldPoint = screenToWorld(input.mouseX, input.mouseY);
  const snappedX = Math.round(worldPoint.x / 32) * 32;
  const snappedY = Math.round(worldPoint.y / 32) * 32;

  if (!canAfford(game.selectedBuild)) return;

  const tx = snappedX;
  const ty = snappedY;
  const exists = world.buildings.some((item) => dist(item, { x: tx, y: ty }) < 25);
  if (exists) return;

  const building = {
    x: tx,
    y: ty,
    w: 32,
    h: 32,
    type: game.selectedBuild,
    health: game.selectedBuild === 'wall' ? 90 : game.selectedBuild === 'platform' ? 60 : game.selectedBuild === 'ramp' ? 70 : 80,
  };
  world.buildings.push(building);
  deductCost(game.selectedBuild);
  updateHud();
}

function attemptCollect() {
  if (!game.player || !game.player.isAlive) return;
  const nearest = world.resources
    .filter((resource) => dist(resource, game.player) < 48)
    .sort((a, b) => dist(a, game.player) - dist(b, game.player))[0];

  if (!nearest) return;
  game.player.inventory[nearest.type] += 2;
  nearest.amount -= 1;
  if (nearest.amount <= 0) {
    world.resources = world.resources.filter((resource) => resource !== nearest);
  }
  updateHud();
}

function fireProjectile(source, targetX, targetY, damage, color) {
  const dirX = targetX - source.x;
  const dirY = targetY - source.y;
  const length = Math.hypot(dirX, dirY) || 1;
  const speed = 520;
  world.projectiles.push({
    x: source.x,
    y: source.y,
    vx: (dirX / length) * speed,
    vy: (dirY / length) * speed,
    radius: source.kind === 'player' ? 5 : 4,
    damage,
    color,
    owner: source.kind,
    life: 1.6,
  });
}

function updatePlayer(dt) {
  const player = game.player;
  if (!player || !player.isAlive) return;

  let dx = 0;
  let dy = 0;
  if (input.keys.w || input.keys.arrowup) dy -= 1;
  if (input.keys.s || input.keys.arrowdown) dy += 1;
  if (input.keys.a || input.keys.arrowleft) dx -= 1;
  if (input.keys.d || input.keys.arrowright) dx += 1;

  if (dx || dy) {
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const speed = player.speed * (input.keys.shift ? 1.45 : 1);
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
  }

  player.x = clamp(player.x, 40, world.width - 40);
  player.y = clamp(player.y, 40, world.height - 40);

  const worldPoint = screenToWorld(input.mouseX, input.mouseY);
  player.facing = Math.atan2(worldPoint.y - player.y, worldPoint.x - player.x);

  if (input.mouseDown && player.cooldown <= 0) {
    fireProjectile(player, worldPoint.x, worldPoint.y, 18, '#9cf7ff');
    player.cooldown = 0.18;
  }

  player.cooldown = Math.max(0, player.cooldown - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);

  if (player.shield < 60) player.shield += dt * 4.5;
  if (player.shield > 60) player.shield = 60;
}

function updateBots(dt) {
  world.bots.forEach((bot) => {
    if (!bot.isAlive) return;

    const distToPlayer = Math.hypot(bot.x - game.player.x, bot.y - game.player.y);
    if (distToPlayer < 260) {
      bot.target.x = game.player.x;
      bot.target.y = game.player.y;
    } else {
      bot.wanderTimer -= dt;
      if (bot.wanderTimer <= 0) {
        bot.wanderTimer = rand(1.8, 4.2);
        bot.target.x = rand(200, world.width - 200);
        bot.target.y = rand(200, world.height - 200);
      }
    }

    const dx = bot.target.x - bot.x;
    const dy = bot.target.y - bot.y;
    const len = Math.hypot(dx, dy) || 1;
    if (len > 22) {
      bot.x += (dx / len) * bot.speed * dt;
      bot.y += (dy / len) * bot.speed * dt;
    }
    bot.x = clamp(bot.x, 30, world.width - 30);
    bot.y = clamp(bot.y, 30, world.height - 30);
    bot.facing = Math.atan2(game.player.y - bot.y, game.player.x - bot.x);

    bot.fireCooldown -= dt;
    if (distToPlayer < 230 && bot.fireCooldown <= 0) {
      fireProjectile(bot, game.player.x, game.player.y, 12, '#ff9e83');
      bot.fireCooldown = rand(0.8, 1.8);
    }
  });
}

function updateProjectiles(dt) {
  world.projectiles = world.projectiles.filter((projectile) => {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;

    const hitTarget = projectile.owner === 'player'
      ? world.bots.find((bot) => bot.isAlive && Math.hypot(bot.x - projectile.x, bot.y - projectile.y) < bot.radius + projectile.radius)
      : game.player && Math.hypot(game.player.x - projectile.x, game.player.y - projectile.y) < game.player.radius + projectile.radius;

    if (hitTarget) {
      if (projectile.owner === 'player') {
        hitTarget.health -= projectile.damage;
        spawnParticles(hitTarget.x, hitTarget.y, '#7ce6ff', 10);
        if (hitTarget.health <= 0) {
          hitTarget.isAlive = false;
          game.player.kills += 1;
          game.player.inventory.crystal += 1;
          game.player.inventory.energy += 1;
        }
      } else {
        const shieldAbsorb = Math.min(game.player.shield, projectile.damage);
        game.player.shield -= shieldAbsorb;
        const remainingDamage = projectile.damage - shieldAbsorb;
        game.player.health -= remainingDamage;
        spawnParticles(game.player.x, game.player.y, '#ff9a7a', 12);
      }
      return false;
    }

    if (projectile.x < 0 || projectile.x > world.width || projectile.y < 0 || projectile.y > world.height || projectile.life <= 0) {
      return false;
    }

    return true;
  });
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    world.particles.push({
      x,
      y,
      vx: rand(-120, 120),
      vy: rand(-120, 120),
      life: rand(0.3, 0.9),
      color,
      radius: rand(2, 6),
    });
  }
}

function updateParticles(dt) {
  world.particles = world.particles.filter((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    return particle.life > 0;
  });
}

function updateZone(dt) {
  if (game.mode === 'survival') return;
  const zone = world.safeZone;
  zone.r -= dt * 4.4;
  if (zone.r < 140) zone.r = 140;

  const distToCenter = Math.hypot(game.player.x - zone.x, game.player.y - zone.y);
  if (distToCenter > zone.r + 5) {
    const damage = 8 * dt;
    game.player.health -= damage;
    spawnParticles(game.player.x, game.player.y, '#ff816d', 4);
  }
}

function checkGameOver() {
  const livingBots = world.bots.filter((bot) => bot.isAlive).length;
  if (game.player.health <= 0) {
    game.state = 'ended';
    endTitleEl.textContent = 'Defeat';
    endSummaryEl.textContent = game.mode === 'survival'
      ? `The rift overwhelmed you on wave ${game.wave}. You held out for ${Math.floor(game.matchTime / 60)}m ${Math.floor(game.matchTime % 60)}s and cleared ${game.player.kills} creatures.`
      : `You fell in battle after ${game.player.kills} eliminations. The practice bots still control the island.`;
    endScreen.classList.remove('hidden');
    return true;
  }

  if (game.mode !== 'survival' && (livingBots === 0 || game.matchTime >= world.matchLength)) {
    game.state = 'ended';
    const victory = livingBots === 0 ? 'Victory' : 'Winner';
    endTitleEl.textContent = victory;
    endSummaryEl.textContent = livingBots === 0
      ? `You cleared the local practice match. Final eliminations: ${game.player.kills}.`
      : `You survived the final storm against practice bots. ${game.player.kills} eliminations secured the win.`;
    endScreen.classList.remove('hidden');
    return true;
  }

  return false;
}

function drawBackground() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.fillStyle = '#07191f';
  ctx.fillRect(0, 0, w, h);

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, '#0d2d36');
  gradient.addColorStop(1, '#081315');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const config = presetConfig[game.preset] || presetConfig.HIGH;
  const cameraX = game.player.x - w / (window.devicePixelRatio * 2);
  const cameraY = game.player.y - h / (window.devicePixelRatio * 2);
  const drawX = -cameraX;
  const drawY = -cameraY;

  for (let i = 0; i < world.regions.length; i += 1) {
    const region = world.regions[i];
    ctx.fillStyle = region.color;
    ctx.fillRect(region.x + drawX, region.y + drawY, region.w, region.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    ctx.strokeRect(region.x + drawX, region.y + drawY, region.w, region.h);
  }

  for (const cloud of world.clouds) {
    if (config.drawClouds) {
      cloud.x += cloud.speed * 0.016;
      if (cloud.x > world.width + 120) cloud.x = -200;
      const cx = cloud.x + drawX;
      const cy = cloud.y + drawY;
      ctx.fillStyle = `rgba(255,255,255,${cloud.alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, cloud.r * 0.75, 0, Math.PI * 2);
      ctx.arc(cx + cloud.r * 0.7, cy - 8, cloud.r * 0.55, 0, Math.PI * 2);
      ctx.arc(cx - cloud.r * 0.7, cy - 10, cloud.r * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(27, 118, 162, 0.3)';
  ctx.fillRect(0 + drawX, 0 + drawY, world.width, world.height);

  const ring = world.safeZone;
  ctx.beginPath();
  ctx.arc(ring.x + drawX, ring.y + drawY, ring.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(116, 232, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawLandmarks() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  world.relics.forEach((relic) => {
    const x = relic.x + drawX;
    const y = relic.y + drawY;
    ctx.fillStyle = relic.color;
    ctx.beginPath();
    ctx.arc(x, y, relic.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
  });

  // Draw a stylized hub and central plaza.
  const cx = world.hub.x + drawX;
  const cy = world.hub.y + drawY;
  ctx.fillStyle = 'rgba(135, 204, 255, 0.2)';
  ctx.beginPath();
  ctx.arc(cx, cy, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150, 255, 242, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawResourceNodes() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  world.resources.forEach((resource) => {
    const colorMap = { wood: '#7be88f', metal: '#d8dde6', crystal: '#7ae1ff', energy: '#ffd770' };
    const x = resource.x + drawX;
    const y = resource.y + drawY;
    ctx.beginPath();
    ctx.fillStyle = colorMap[resource.type];
    ctx.shadowBlur = 14;
    ctx.shadowColor = colorMap[resource.type];
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function drawBuildings() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  world.buildings.forEach((building) => {
    const x = building.x + drawX;
    const y = building.y + drawY;
    if (building.type === 'wall') {
      ctx.fillStyle = '#8ca5bf';
      ctx.fillRect(x - 16, y - 16, 32, 32);
    } else if (building.type === 'ramp') {
      ctx.fillStyle = '#ffbf69';
      ctx.beginPath();
      ctx.moveTo(x - 16, y + 16);
      ctx.lineTo(x + 16, y + 16);
      ctx.lineTo(x - 16, y - 16);
      ctx.closePath();
      ctx.fill();
    } else if (building.type === 'platform') {
      ctx.fillStyle = '#62d0ff';
      ctx.fillRect(x - 20, y - 8, 40, 16);
    } else {
      ctx.fillStyle = '#d7e6ff';
      ctx.fillRect(x - 16, y - 16, 32, 32);
      ctx.strokeStyle = '#7eb5ff';
      ctx.strokeRect(x - 16, y - 16, 32, 32);
    }
  });
}

function drawPlayers() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  const drawCharacter = (entity, isBot = false) => {
    const x = entity.x + drawX;
    const y = entity.y + drawY;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(entity.facing || 0);
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(6, -3, 18, 6);
    ctx.restore();

    if (isBot) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 15, y - entity.radius - 12, 30, 4);
      const width = (entity.health / (entity.isBrute ? 145 + Math.max(0, game.wave - 1) * 7 : 80 + Math.max(0, game.wave - 1) * 7)) * 30;
      ctx.fillStyle = '#7ef6b2';
      ctx.fillRect(x - 15, y - entity.radius - 12, width, 4);
    }
  };

  world.bots.filter((bot) => bot.isAlive).forEach((bot) => drawCharacter(bot, true));
  drawCharacter(game.player, false);
}

function drawProjectiles() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  world.projectiles.forEach((projectile) => {
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x + drawX, projectile.y + drawY, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawParticles() {
  const drawX = -game.player.x + canvas.width / (window.devicePixelRatio * 2);
  const drawY = -game.player.y + canvas.height / (window.devicePixelRatio * 2);

  world.particles.forEach((particle) => {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = clamp(particle.life, 0, 1);
    ctx.beginPath();
    ctx.arc(particle.x + drawX, particle.y + drawY, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawCrosshair() {
  const x = input.mouseX;
  const y = input.mouseY;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + 18, y);
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y - 8);
  ctx.moveTo(x, y + 8);
  ctx.lineTo(x, y + 18);
  ctx.stroke();
}

function drawMinimap() {
  const mapW = 180;
  const mapH = 140;
  const x = window.innerWidth - mapW - 18;
  const y = 18;

  ctx.fillStyle = 'rgba(5, 20, 26, 0.72)';
  ctx.fillRect(x, y, mapW, mapH);
  ctx.strokeStyle = 'rgba(157, 240, 255, 0.5)';
  ctx.strokeRect(x, y, mapW, mapH);

  const scaleX = mapW / world.width;
  const scaleY = mapH / world.height;
  const zone = world.safeZone;

  ctx.beginPath();
  ctx.arc(x + zone.x * scaleX, y + zone.y * scaleY, zone.r * scaleX, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(117, 240, 191, 0.9)';
  ctx.stroke();

  ctx.fillStyle = '#9ae8ff';
  ctx.fillRect(x + game.player.x * scaleX - 3, y + game.player.y * scaleY - 3, 6, 6);

  world.bots.filter((bot) => bot.isAlive).forEach((bot) => {
    ctx.fillStyle = '#ff9a7a';
    ctx.fillRect(x + bot.x * scaleX - 2, y + bot.y * scaleY - 2, 4, 4);
  });
}

function drawHudText() {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`HP ${Math.max(0, Math.round(game.player.health))}`, 24, window.innerHeight - 26);
  ctx.fillText(`Shield ${Math.max(0, Math.round(game.player.shield))}`, 150, window.innerHeight - 26);
  ctx.fillText(`Elims ${game.player.kills}`, 310, window.innerHeight - 26);
  if (game.mode === 'survival') {
    ctx.fillText(`WAVE ${game.wave}`, 420, window.innerHeight - 26);
  }

  const zone = world.safeZone;
  ctx.fillText(`Zone Center ${Math.round(zone.x)}, ${Math.round(zone.y)}`, window.innerWidth - 240, window.innerHeight - 26);
}

function updateFrame(dt) {
  if (game.state !== 'playing') return;

  world.time += dt;
  game.matchTime += dt;
  world.dayPhase = (world.dayPhase + dt * 0.05) % (Math.PI * 2);

  updatePlayer(dt);
  updateBots(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updateZone(dt);

  const livingBots = world.bots.filter((bot) => bot.isAlive).length;
  if (game.mode === 'survival' && livingBots === 0) {
    game.wave += 1;
    game.player.health = Math.min(100, game.player.health + 12);
    game.player.shield = Math.min(60, game.player.shield + 15);
    game.player.inventory.energy += 2;
    game.player.inventory.crystal += 1;
    world.bots = createSurvivalWave();
  }

  if (game.player.health <= 0 || (game.mode !== 'survival' && (livingBots === 0 || game.matchTime >= world.matchLength))) {
    checkGameOver();
  }

  updateHud();
}

function render() {
  drawBackground();
  drawLandmarks();
  drawResourceNodes();
  drawBuildings();
  drawPlayers();
  drawProjectiles();
  drawParticles();
  drawCrosshair();
  drawMinimap();
  drawHudText();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - (loop.last || timestamp)) / 1000, 0.033);
  loop.last = timestamp;
  updateFrame(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('keydown', handleKeydown);
window.addEventListener('keyup', handleKeyup);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mousedown', handlePointerDown);
window.addEventListener('mouseup', handlePointerUp);
window.addEventListener('blur', () => {
  input.keys = Object.create(null);
  input.mouseDown = false;
});

registerButtons();
resizeCanvas();
addClouds();
makeWorld();
updateHud();
requestAnimationFrame(loop);
