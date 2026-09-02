import fs from "node:fs";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("GITHUB_USERNAME or GITHUB_TOKEN is missing.");
}

const query = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
              color
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "full-year-github-snake",
  },
  body: JSON.stringify({ query, variables: { login: username } }),
});

if (!response.ok) {
  throw new Error(`GitHub API request failed with status ${response.status}.`);
}

const json = await response.json();

if (json.errors?.length) {
  throw new Error(`GitHub GraphQL error: ${json.errors[0].message}`);
}

const calendar = json.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  throw new Error(`Contribution calendar was not found for ${username}.`);
}

const weeks = calendar.weeks;
const CELL = 10;
const GAP = 3;
const STEP = CELL + GAP;
const ROWS = 7;
const COLS = weeks.length;
const WIDTH = COLS * STEP - GAP;
const HEIGHT = ROWS * STEP - GAP;
const DURATION = 26;

const cells = weeks.flatMap((week, x) =>
  week.contributionDays.map((day) => ({
    x,
    y: new Date(`${day.date}T00:00:00Z`).getUTCDay(),
    count: day.contributionCount,
    color: day.color,
    date: day.date,
  })),
);

// Visit every day-sized position in a left-to-right, then right-to-left route.
const route = [];

for (let y = 0; y < ROWS; y += 1) {
  if (y % 2 === 0) {
    for (let x = 0; x < COLS; x += 1) route.push({ x, y });
  } else {
    for (let x = COLS - 1; x >= 0; x -= 1) route.push({ x, y });
  }
}

// Return along the bottom and left edges so the animation loops without a jump.
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
      `${index === 0 ? "M" : "L"} ${point.x * STEP + CELL / 2} ${
        point.y * STEP + CELL / 2
      }`,
  )
  .join(" ");

let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img">
  <title>Full year GitHub contribution snake for ${username}</title>
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
    .empty { fill: #103b2c; }
    .snake { fill: #39d353; }
    .snake-head { filter: url(#snake-glow); }
    .snake-rest { display: none; fill: #39d353; }
    @media (prefers-color-scheme: light) {
      .empty { fill: #d9f2e2; }
    }
    @media (prefers-reduced-motion: reduce) {
      .snake { display: none; }
      .snake-rest { display: block; }
    }
  </style>
  <g id="contributions">`;

for (const cell of cells) {
  const active = cell.count > 0;
  const routeIndex = routeIndexes.get(`${cell.x}:${cell.y}`);
  const visitTime = (routeIndex / motionRoute.length) * DURATION;
  const fill = active ? ` fill="${cell.color}"` : "";

  svg += `
    <rect x="${cell.x * STEP}" y="${cell.y * STEP}" width="${CELL}" height="${CELL}" rx="2" class="${active ? "active" : "empty"}"${fill} data-date="${cell.date}">`;

  if (active) {
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

svg += `
  </g>
  <circle class="snake-rest" cx="${CELL / 2}" cy="${CELL / 2}" r="4.6" />
</svg>
`;

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/full-year-snake.svg", svg, "utf8");

console.log(`Generated full-year snake for ${username}.`);
console.log(`Total contributions: ${calendar.totalContributions}.`);
console.log(`Grid: ${COLS} weeks x ${ROWS} days (${route.length} positions).`);
console.log(`Loop: ${motionRoute.length} positions with ${snakeLength} body points.`);
