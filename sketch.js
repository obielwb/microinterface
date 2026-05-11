const PAN_BLUE = "#2563eb";
const INK = "#17202a";
const MUTED = "#667085";
const LINE = "#d8dee8";
const SURFACE = "#fffdf8";
const CANVAS_BG = "#f8fafc";
const GREEN = "#1f9d6f";
const AMBER = "#c77812";
const RED = "#c24137";
const GRAY = "#8590a2";

const STAGE_LABELS = [
  "Entrada da base",
  "Filtro de elegibilidade",
  "Classificacao por risco",
  "Motor de otimizacao",
  "Validacao das restricoes",
  "Comparacao de resultado",
];

const CLIENT_SEED = [
  { pd: 0.06, cp: 5200, propensity: 0.92, offered: 3600, eligible: true },
  { pd: 0.09, cp: 4100, propensity: 0.76, offered: 2800, eligible: true },
  { pd: 0.12, cp: 3600, propensity: 0.88, offered: 2500, eligible: true },
  { pd: 0.17, cp: 2900, propensity: 0.69, offered: 1600, eligible: true },
  { pd: 0.24, cp: 2400, propensity: 0.62, offered: 1700, eligible: true },
  { pd: 0.34, cp: 1800, propensity: 0.51, offered: 1300, eligible: true },
  { pd: 0.08, cp: 6200, propensity: 0.83, offered: 4600, eligible: true },
  { pd: 0.19, cp: 3400, propensity: 0.58, offered: 2100, eligible: true },
  { pd: 0.31, cp: 2100, propensity: 0.45, offered: 1200, eligible: false },
  { pd: 0.14, cp: 3900, propensity: 0.79, offered: 2400, eligible: true },
  { pd: 0.22, cp: 2500, propensity: 0.66, offered: 1800, eligible: true },
  { pd: 0.05, cp: 7000, propensity: 0.95, offered: 5200, eligible: true },
  { pd: 0.28, cp: 2600, propensity: 0.54, offered: 1400, eligible: false },
  { pd: 0.11, cp: 4300, propensity: 0.71, offered: 3200, eligible: true },
];

let clients = [];
let layoutPoints = {};
let stage = 0;
let riskBaseline = 0.0553;
let usageRate = 0.75;
let canvas;

function setup() {
  const holder = document.getElementById("sketch-holder");
  canvas = createCanvas(holder.clientWidth, holder.clientHeight);
  canvas.parent("sketch-holder");
  textFont("Inter, system-ui, sans-serif");
  wireControls();
  rebuildSimulation();
}

function draw() {
  background(CANVAS_BG);
  drawFrame();
  drawPipeline();
  drawStageVisuals();
  drawClients();
  // drawPortfolioPanel();
  drawStageNotes();

  // Animar posicoes dos clientes suavemente
  clients.forEach((client) => {
    client.x = lerp(client.x, client.tx, 0.08);
    client.y = lerp(client.y, client.ty, 0.08);
  });
}

function windowResized() {
  const holder = document.getElementById("sketch-holder");
  resizeCanvas(holder.clientWidth, holder.clientHeight);
  buildLayout();
  setClientTargets();
}

function wireControls() {
  const prevButton = document.getElementById("prev-button");
  const nextButton = document.getElementById("next-button");
  const resetButton = document.getElementById("reset-button");

  prevButton.addEventListener("click", () => {
    if (stage > 0) {
      stage -= 1;
      setClientTargets();
      updateDomStatus();
    }
  });

  nextButton.addEventListener("click", () => {
    if (stage < STAGE_LABELS.length - 1) {
      stage += 1;
      setClientTargets();
      updateDomStatus();
    }
  });

  resetButton.addEventListener("click", () => {
    stage = 0;
    rebuildSimulation();
  });
}

function rebuildSimulation(resetStage = true) {
  if (resetStage) {
    stage = 0;
  }
  buildLayout();
  clients = CLIENT_SEED.map((client, index) => makeClient(client, index));
  rebalancePortfolioRisk();
  setClientTargets();
  updateDomStatus();
}

function buildLayout() {
  const top = 78;
  const flowY = height * 0.44;
  const usableWidth = width - 76;
  const left = 38;
  const columns = [0.05, 0.22, 0.39, 0.57, 0.74, 0.91].map((ratio) => left + usableWidth * ratio);
  layoutPoints = {
    top,
    flowY,
    stageX: columns,
    resultY: height - 132,
  };
}

function makeClient(source, index) {
  const multiplier = getMultiplier(source.pd);
  const capacityCap = source.cp * multiplier;
  const rawOptimized = capacityCap * (0.72 + source.propensity * 0.34) * (1 - source.pd * 0.75);
  const portfolioPenalty = source.pd > riskBaseline ? 0.72 : 1.08;
  const optimized = source.eligible ? discretizeLimit(constrain(rawOptimized * portfolioPenalty, 0, 25000)) : 0;

  return {
    ...source,
    index,
    multiplier,
    optimized,
    expectedReturn: 0,
    expectedLoss: 0,
    x: -40 - index * 24,
    y: layoutPoints.flowY + map(index % 5, 0, 4, -88, 88),
    tx: 0,
    ty: 0,
    pulse: random(TWO_PI),
  };
}

function rebalancePortfolioRisk() {
  let guard = 0;
  while (getFinancialDefault() > riskBaseline && guard < 1200) {
    const candidates = clients
      .filter((client) => client.eligible && client.optimized > 0 && client.pd > riskBaseline)
      .sort((a, b) => b.pd - a.pd || b.optimized - a.optimized);

    if (candidates.length === 0) break;
    candidates[0].optimized = candidates[0].optimized <= 250 ? 0 : candidates[0].optimized - 50;
    guard += 1;
  }

  clients.forEach((client) => {
    client.expectedReturn = client.optimized * usageRate * 0.0175 * client.propensity * 12;
    client.expectedLoss = client.optimized * usageRate * 0.6 * client.pd;
  });
}

function getFinancialDefault() {
  const eligibleClients = clients.filter((client) => client.eligible);
  const optimizedLimit = eligibleClients.reduce((sum, client) => sum + client.optimized, 0);
  const pdWeighted = eligibleClients.reduce((sum, client) => sum + client.pd * client.optimized, 0);
  return optimizedLimit > 0 ? pdWeighted / optimizedLimit : 0;
}

function setClientTargets() {
  const eligibleOnly = clients.filter((c) => c.eligible);
  const ineligibleOnly = clients.filter((c) => !c.eligible);

  clients.forEach((client) => {
    const lane = client.index % 7;
    const laneOffset = map(lane, 0, 6, -86, 86);
    const riskLane = getRiskLane(client.pd);
    const eligibleIndex = eligibleOnly.indexOf(client);
    const ineligibleIndex = ineligibleOnly.indexOf(client);

    const targets = [];

    // Etapa 0 — Entrada: clientes chegam pela esquerda
    targets.push({
      x: layoutPoints.stageX[0],
      y: layoutPoints.flowY + laneOffset,
    });

    // Etapa 1 — Filtro: elegiveis no centro, inelegiveis descem
    if (client.eligible) {
      targets.push({
        x: layoutPoints.stageX[1],
        y: layoutPoints.flowY + laneOffset * 0.7,
      });
    } else {
      targets.push({
        x: layoutPoints.stageX[1],
        y: layoutPoints.flowY + 140,
      });
    }

    // Etapa 2 — Risco: separados por faixa de risco
    targets.push({
      x: layoutPoints.stageX[2],
      y: layoutPoints.flowY - 100 + riskLane * 50,
    });

    // Etapa 3 — Otimizacao: clientes ao redor do nucleo, com espaco para o visual central
    if (client.eligible) {
      const angle = (eligibleIndex / max(eligibleOnly.length, 1)) * TWO_PI - HALF_PI;
      const r = 110;
      targets.push({
        x: layoutPoints.stageX[3] + cos(angle) * r,
        y: layoutPoints.flowY + sin(angle) * r * 0.7,
      });
    } else {
      targets.push({
        x: layoutPoints.stageX[3] - 80,
        y: layoutPoints.flowY + 160,
      });
    }

    // Etapa 4 — Restricoes: clientes ficam a esquerda das gates
    if (client.eligible) {
      const row = eligibleIndex % 6;
      targets.push({
        x: layoutPoints.stageX[4] - 80,
        y: layoutPoints.flowY - 80 + row * 32,
      });
    } else {
      targets.push({
        x: layoutPoints.stageX[4] - 80,
        y: layoutPoints.flowY + 160,
      });
    }

    // Etapa 5 — Resultado: agrupar clientes por categoria de risco
    if (client.eligible) {
      const riskCategory = client.pd <= 0.15 ? 0 : client.pd <= 0.25 ? 1 : 2;
      const positions = [
        { x: layoutPoints.stageX[5] - 40, y: layoutPoints.flowY - 70 }, // Baixo
        { x: layoutPoints.stageX[5] + 30, y: layoutPoints.flowY - 10 },  // Médio
        { x: layoutPoints.stageX[5] + 10, y: layoutPoints.flowY + 80 },  // Alto
      ];
      
      const catClients = eligibleOnly.filter(c => (c.pd <= 0.15 ? 0 : c.pd <= 0.25 ? 1 : 2) === riskCategory);
      const catIndex = catClients.indexOf(client);
      
      const angle = (catIndex / max(catClients.length, 1)) * TWO_PI;
      const r = 25;

      targets.push({
        x: positions[riskCategory].x + cos(angle) * r,
        y: positions[riskCategory].y + sin(angle) * r,
      });
    } else {
      targets.push({
        x: layoutPoints.stageX[5] - 100,
        y: layoutPoints.flowY + 160,
      });
    }

    client.tx = targets[stage].x;
    client.ty = targets[stage].y;
    client.targets = targets;
  });
}

function drawFrame() {
  noStroke();
  fill(SURFACE);
  rect(18, 18, width - 36, height - 36, 8);
  stroke(LINE);
  noFill();
  rect(18.5, 18.5, width - 37, height - 37, 8);
}

function drawPipeline() {
  const labels = ["Base", "Filtro", "Risco", "Otimizacao", "Restricoes", "Resultado"];
  stroke(LINE);
  strokeWeight(2);
  for (let i = 0; i < layoutPoints.stageX.length - 1; i += 1) {
    line(layoutPoints.stageX[i] + 32, layoutPoints.top + 38, layoutPoints.stageX[i + 1] - 32, layoutPoints.top + 38);
  }

  labels.forEach((label, index) => {
    const x = layoutPoints.stageX[index];
    const active = index <= stage;
    const current = index === stage;
    stroke(active ? PAN_BLUE : LINE);
    strokeWeight(current ? 3.5 : active ? 2.5 : 2);
    fill(current ? "#dbeafe" : active ? "#e8f0ff" : "#f6f7f9");
    circle(x, layoutPoints.top + 38, 46);
    noStroke();
    fill(active ? PAN_BLUE : MUTED);
    textAlign(CENTER, CENTER);
    textSize(12);
    textStyle(BOLD);
    text(index + 1, x, layoutPoints.top + 38);
    fill(INK);
    textStyle(NORMAL);
    textSize(12);
    text(label, x, layoutPoints.top + 78);
  });
}

function drawClients() {
  clients.forEach((client) => {
    // Esconder inelegiveis a partir da etapa 2
    if (!client.eligible && stage >= 2) return;

    const riskColor = getRiskColor(client.pd, client.eligible);
    const radius = map(client.cp, 1800, 7000, 11, 22);
    const alpha = client.eligible || stage < 1 ? 255 : 115;
    const glow = 1 + sin(frameCount * 0.07 + client.pulse) * 0.08;

    noStroke();
    fill(red(riskColor), green(riskColor), blue(riskColor), alpha * 0.16);
    circle(client.x, client.y, radius * 3.2 * glow);
    fill(red(riskColor), green(riskColor), blue(riskColor), alpha);
    circle(client.x, client.y, radius * 2);

    fill("#ffffff");
    textAlign(CENTER, CENTER);
    textStyle(BOLD);
    textSize(10);
    text(`${Math.round(client.pd * 100)}`, client.x, client.y);
    textStyle(NORMAL);

  });
}

function drawStageVisuals() {
  if (stage === 3) drawOptimizationCore();
  if (stage === 4) drawRestrictionGates();
  if (stage === 5) drawProfitOptimization();
}

function drawOptimizationCore() {
  const x = layoutPoints.stageX[3];
  const y = layoutPoints.flowY;
  const pulse = 48 + sin(frameCount * 0.06) * 5;

  // Fundo semi-transparente para separar do conteudo
  noStroke();
  fill(255, 255, 255, 180);
  circle(x, y, pulse * 2.8);

  noFill();
  stroke(PAN_BLUE);
  strokeWeight(2);
  circle(x, y, pulse * 2);
  stroke(GREEN);
  strokeWeight(1.5);
  arc(x, y, pulse * 2.5, pulse * 2.5, frameCount * 0.02, frameCount * 0.02 + PI * 0.85);
  stroke(RED);
  strokeWeight(1.5);
  arc(x, y, pulse * 1.6, pulse * 1.6, -frameCount * 0.025, -frameCount * 0.025 + PI * 0.7);

  noStroke();
  fill(INK);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(14);
  text("max Z", x, y - 8);
  textStyle(NORMAL);
  textSize(11);
  fill(MUTED);
  text("retorno − perda", x, y + 10);
}

function drawRestrictionGates() {
  const x = layoutPoints.stageX[4];
  const y = layoutPoints.flowY - 100;
  const gates = ["R$200", "R$25k", "CP × M", "PD fin."];

  gates.forEach((gate, index) => {
    const gy = y + index * 48;
    const isPdFin = index === 3;
    const failing = isPdFin && getStats().financialDefault > riskBaseline;
    stroke(failing ? RED : GREEN);
    strokeWeight(2);
    fill("#ffffff");
    rect(x - 42, gy, 84, 32, 6);
    noStroke();
    fill(INK);
    textAlign(CENTER, CENTER);
    textSize(12);
    textStyle(BOLD);
    text(gate, x, gy + 16);
    textStyle(NORMAL);

    // Icone de status
    const iconX = x + 52;
    const iconY = gy + 16;
    fill(failing ? RED : GREEN);
    textSize(14);
    text(failing ? "✗" : "✓", iconX, iconY);
  });
}

function drawProfitOptimization() {
  const x = layoutPoints.stageX[5];
  const y = layoutPoints.flowY;

  const positions = [
    { x: x - 40, y: y - 70, label: "Baixo Risco\n+ Limite\n+ Lucro", color: GREEN },
    { x: x + 30, y: y - 10, label: "Risco Médio\nLimite Seguro", color: AMBER },
    { x: x + 10, y: y + 80, label: "Alto Risco\n- Limite\n- Perda", color: RED },
  ];

  positions.forEach(pos => {
    noFill();
    stroke(pos.color);
    strokeWeight(1);
    circle(pos.x, pos.y, 80);

    fill(MUTED);
    noStroke();
    textAlign(CENTER, TOP);
    textSize(10);
    textStyle(BOLD);
    text(pos.label, pos.x, pos.y + 45);
  });
}

function drawStageNotes() {
  const note = getStageNote();
  const x = 42;
  const y = 36;
  noStroke();
  fill(PAN_BLUE);
  textAlign(LEFT, TOP);
  textSize(12);
  textStyle(BOLD);
  text(STAGE_LABELS[stage], x, y);
  fill(MUTED);
  textStyle(NORMAL);
  textSize(13);
  text(note, x, y + 20, min(520, width - 84));
}

function getStageNote() {
  const stats = getStats();
  const notes = [
    "Clientes chegam com PD, capacidade de pagamento, propensao e limite ofertado atual.",
    "Perfis restritos saem do fluxo antes de qualquer recomendacao de limite.",
    "Cada cliente entra em uma faixa de risco, que define o multiplicador maximo sobre a capacidade.",
    "O motor procura o limite que aumenta interchange esperado e reduz perda esperada.",
    "Os limites passam por minimo operacional, teto, capacidade x risco e baseline financeiro.",
    `Carteira otimizada em limites e inadimplencia financeira.`,
  ];
  return notes[stage];
}

function getStats() {
  const eligibleClients = clients.filter((client) => client.eligible);
  const currentLimit = eligibleClients.reduce((sum, client) => sum + client.offered, 0);
  const optimizedLimit = eligibleClients.reduce((sum, client) => sum + client.optimized, 0);
  const returnTotal = eligibleClients.reduce((sum, client) => sum + max(0, client.expectedReturn - client.expectedLoss), 0);
  const pdWeighted = eligibleClients.reduce((sum, client) => sum + client.pd * client.optimized, 0);
  const financialDefault = optimizedLimit > 0 ? pdWeighted / optimizedLimit : 0;
  return { currentLimit, optimizedLimit, returnTotal, financialDefault };
}

function updateDomStatus() {
  document.getElementById("stage-label").textContent = STAGE_LABELS[stage];
  document.getElementById("portfolio-score").textContent =
    stage === 5
      ? `Carteira otimizada para maximização do lucro`
      : "Processando risco, retorno e capacidade de pagamento";

  // Atualizar botoes de navegacao
  document.getElementById("prev-button").disabled = stage === 0;
  document.getElementById("next-button").disabled = stage === STAGE_LABELS.length - 1;
  document.getElementById("step-indicator").textContent = `${stage + 1} / ${STAGE_LABELS.length}`;
}

function getMultiplier(pd) {
  if (pd <= 0.1) return 1.7;
  if (pd <= 0.15) return 1.4;
  if (pd <= 0.2) return 1.0;
  if (pd <= 0.3) return 0.6;
  return 0.3;
}

function getRiskLane(pd) {
  if (pd <= 0.1) return 0;
  if (pd <= 0.15) return 1;
  if (pd <= 0.2) return 2;
  if (pd <= 0.3) return 3;
  return 4;
}

function getRiskColor(pd, eligible) {
  if (!eligible && stage >= 1) return color(GRAY);
  if (pd <= 0.15) return color(GREEN);
  if (pd <= 0.25) return color(AMBER);
  return color(RED);
}

function discretizeLimit(value) {
  if (value < 200) return 0;
  return Math.round(value / 50) * 50;
}

function formatCurrency(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
