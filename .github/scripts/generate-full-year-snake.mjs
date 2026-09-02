import fs from "node:fs";

const snapshotUrl = new URL("../data/contribution-snapshot.json", import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(snapshotUrl, "utf8"));
const username = process.env.GITHUB_USERNAME || snapshot.username;

const ROWS = 7;
const COLS = snapshot.levels[0]?.length;

if (
  snapshot.levels.length !== ROWS ||
  !COLS ||
  snapshot.levels.some((row) => row.length !== COLS || /[^0-4-]/.test(row))
) {
  throw new Error("Contribution snapshot must contain seven equal 0-4 level rows.");
}

const CELL = 10;
const GAP = 3;
const STEP = CELL + GAP;
const GRID_X = 30;
const GRID_Y = 23;
const GRID_WIDTH = COLS * STEP - GAP;
const GRID_HEIGHT = ROWS * STEP - GAP;
const WIDTH = GRID_X + GRID_WIDTH;
const HEIGHT = GRID_Y + GRID_HEIGHT + 22;
const DURATION = 26;

const startDate = new Date(`${snapshot.startDate}T00:00:00Z`);
const endDate = new Date(`${snapshot.endDate}T00:00:00Z`);

if (startDate.getUTCDay() !== 0 || Number.isNaN(startDate.valueOf())) {
  throw new Error("Snapshot startDate must be a valid Sunday.");
}

const dateAt = (x, y) => {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + x * ROWS + y);
  return date;
};

const cells = [];

for (let y = 0; y < ROWS; y += 1) {
  for (let x = 0; x < COLS; x += 1) {
    const marker = snapshot.levels[y][x];
    const date = dateAt(x, y);

    if (marker === "-" || date > endDate) continue;

    cells.push({
      x,
      y,
      level: Number(marker),
      date: date.toISOString().slice(0, 10),
    });
  }
}

const activeDays = cells.filter((cell) => cell.level > 0).length;

// Traverse the complete calendar in alternating left-to-right rows.
const route = [];

for (let y = 0; y < ROWS; y += 1) {
  if (y % 2 === 0) {
    for (let x = 0; x < COLS; x += 1) route.push({ x, y });
  } else {
    for (let x = COLS - 1; x >= 0; x -= 1) route.push({ x, y });
  }
}

// Close the route along the bottom and left edges for a seamless loop.
const motionRoute = [...route];

for (let x = COLS - 2; x >= 0; x -= 1) {
  motionRoute.push({ x, y: ROWS - 1 });
}

for (let y = ROWS - 2; y >= 0; y -= 1) {
  motionRoute.push({ x: 0, y });
}

const routeIndexes = new Map(
  route.map((point, index) => [`${point.x}:${point.y}`, index]),
);
const motionPath = motionRoute
  .map(
    (point, index) =>
      `${index === 0 ? "M" : "L"} ${GRID_X + point.x * STEP + CELL / 2} ${
        GRID_Y + point.y * STEP + CELL / 2
      }`,
  )
  .join(" ");

const monthLabels = [];
let previousMonth = -1;

for (let x = 0; x < COLS - 2; x += 1) {
  for (let y = 0; y < ROWS; y += 1) {
    const date = dateAt(x, y);
    const month = date.getUTCMonth();

    if (date <= endDate && date.getUTCDate() <= 7 && month !== previousMonth) {
      monthLabels.push({
        x,
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          timeZone: "UTC",
        }).format(date),
      });
      previousMonth = month;
      break;
    }
  }
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img">
  <title>${snapshot.totalContributions} contributions in the last year for ${username}</title>
  <defs>
    <path id="snake-route" d="${motionPath}" />
    <filter id="snake-glow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="1.8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <style>
    text { font: 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: #8b949e; }
    .month { font-weight: 600; fill: #c9d1d9; }
    .level-0 { fill: #161b22; }
    .level-1 { fill: #0e4429; }
    .level-2 { fill: #006d32; }
    .level-3 { fill: #26a641; }
    .level-4 { fill: #39d353; }
    .snake { fill: #39d353; }
    .snake-head { filter: url(#snake-glow); }
    .snake-rest { display: none; fill: #39d353; }
    @media (prefers-color-scheme: light) {
      text { fill: #57606a; }
      .month { fill: #24292f; }
      .level-0 { fill: #ebedf0; }
      .level-1 { fill: #9be9a8; }
      .level-2 { fill: #40c463; }
      .level-3 { fill: #30a14e; }
      .level-4 { fill: #216e39; }
    }
    @media (prefers-reduced-motion: reduce) {
      .snake { display: none; }
      .snake-rest { display: block; }
    }
  </style>
  <g id="labels">`;

for (const month of monthLabels) {
  svg += `
    <text class="month" x="${GRID_X + month.x * STEP}" y="11">${month.label}</text>`;
}

for (const [row, label] of [
  [1, "Mon"],
  [3, "Wed"],
  [5, "Fri"],
]) {
  svg += `
    <text x="0" y="${GRID_Y + row * STEP + CELL - 1}">${label}</text>`;
}

svg += `
  </g>
  <g id="contributions">`;

for (const cell of cells) {
  const routeIndex = routeIndexes.get(`${cell.x}:${cell.y}`);
  const visitTime = (routeIndex / motionRoute.length) * DURATION;

  svg += `
    <rect x="${GRID_X + cell.x * STEP}" y="${GRID_Y + cell.y * STEP}" width="${CELL}" height="${CELL}" rx="2" class="level-${cell.level}" data-date="${cell.date}" data-level="${cell.level}">`;

  if (cell.level > 0) {
    svg += `
      <animate attributeName="opacity" values="1;0.18;1;1" keyTimes="0;0.012;0.05;1" begin="${visitTime.toFixed(3)}s" dur="${DURATION}s" repeatCount="indefinite" />`;
  }

  svg += "</rect>";
}

svg += `
  </g>
  <g id="snake">`;

const snakeLength = 14;

for (let index = snakeLength - 1; index >= 0; index -= 1) {
  const radius = 4.6 - index * 0.18;
  const opacity = 1 - index * 0.045;
  const lag = (index * DURATION) / motionRoute.length;
  const begin = index === 0 ? "0s" : `-${(DURATION - lag).toFixed(3)}s`;
  const className = index === 0 ? "snake snake-head" : "snake snake-body";

  svg += `
    <circle class="${className}" cx="0" cy="0" r="${radius.toFixed(2)}" opacity="${opacity.toFixed(2)}">
      <animateMotion dur="${DURATION}s" begin="${begin}" repeatCount="indefinite" calcMode="linear">
        <mpath href="#snake-route" xlink:href="#snake-route" />
      </animateMotion>
      <animate attributeName="r" values="${radius.toFixed(2)};${(radius * 0.82).toFixed(2)};${radius.toFixed(2)}" dur="1.1s" begin="-${(index * 0.07).toFixed(2)}s" repeatCount="indefinite" />
    </circle>`;
}

const legendX = WIDTH - 119;
const footerY = HEIGHT - 5;

svg += `
  </g>
  <circle class="snake-rest" cx="${GRID_X + CELL / 2}" cy="${GRID_Y + CELL / 2}" r="4.6" />
  <g id="footer">
    <text x="${GRID_X}" y="${footerY}">${snapshot.totalContributions} contributions in the last year</text>
    <text x="${legendX}" y="${footerY}">Less</text>
    <rect x="${legendX + 25}" y="${footerY - 9}" width="9" height="9" rx="2" class="level-0" />
    <rect x="${legendX + 37}" y="${footerY - 9}" width="9" height="9" rx="2" class="level-1" />
    <rect x="${legendX + 49}" y="${footerY - 9}" width="9" height="9" rx="2" class="level-2" />
    <rect x="${legendX + 61}" y="${footerY - 9}" width="9" height="9" rx="2" class="level-3" />
    <rect x="${legendX + 73}" y="${footerY - 9}" width="9" height="9" rx="2" class="level-4" />
    <text x="${legendX + 86}" y="${footerY}">More</text>
  </g>
</svg>
`;

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/full-year-snake.svg", svg, "utf8");

console.log(`Generated contribution snapshot snake for ${username}.`);
console.log(`Total contributions: ${snapshot.totalContributions}.`);
console.log(`Active days: ${activeDays}.`);
console.log(`Grid: ${COLS} weeks x ${ROWS} days (${route.length} positions).`);
console.log(`Loop: ${motionRoute.length} positions with ${snakeLength} body points.`);
