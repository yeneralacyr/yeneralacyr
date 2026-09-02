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
const DURATION = 22;

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

const routeIndexes = new Map(
  route.map((point, index) => [`${point.x}:${point.y}`, index]),
);
const xValues = route.map((point) => point.x * STEP).join(";");
const yValues = route.map((point) => point.y * STEP).join(";");

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img">
  <title>Full year GitHub contribution snake for ${username}</title>
  <style>
    .empty { fill: #161b22; }
    .snake { fill: #39d353; }
    @media (prefers-color-scheme: light) {
      .empty { fill: #ebedf0; }
    }
  </style>
  <g id="contributions">`;

for (const cell of cells) {
  const active = cell.count > 0;
  const routeIndex = routeIndexes.get(`${cell.x}:${cell.y}`);
  const visitTime = (routeIndex / route.length) * DURATION;
  const fill = active ? ` fill="${cell.color}"` : "";

  svg += `
    <rect x="${cell.x * STEP}" y="${cell.y * STEP}" width="${CELL}" height="${CELL}" rx="2" class="${active ? "active" : "empty"}"${fill} data-date="${cell.date}">`;

  if (active) {
    svg += `
      <animate attributeName="opacity" values="1;0;0;1" keyTimes="0;0.02;0.96;1" begin="${visitTime.toFixed(3)}s" dur="${DURATION}s" repeatCount="indefinite" />`;
  }

  svg += "</rect>";
}

svg += `
  </g>
  <g id="snake">`;

const snakeLength = 6;

for (let index = snakeLength - 1; index >= 0; index -= 1) {
  const size = CELL - index * 0.65;
  const offset = (CELL - size) / 2;
  const delay = (index * DURATION) / route.length;

  svg += `
    <rect class="snake" width="${size}" height="${size}" rx="${size / 3}" x="${offset}" y="${offset}" opacity="${1 - index * 0.1}">
      <animate attributeName="x" values="${xValues}" dur="${DURATION}s" begin="${delay.toFixed(3)}s" repeatCount="indefinite" calcMode="linear" />
      <animate attributeName="y" values="${yValues}" dur="${DURATION}s" begin="${delay.toFixed(3)}s" repeatCount="indefinite" calcMode="linear" />
    </rect>`;
}

svg += `
  </g>
</svg>
`;

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/full-year-snake.svg", svg, "utf8");

console.log(`Generated full-year snake for ${username}.`);
console.log(`Total contributions: ${calendar.totalContributions}.`);
console.log(`Grid: ${COLS} weeks x ${ROWS} days (${route.length} positions).`);
