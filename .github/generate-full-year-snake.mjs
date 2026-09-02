import fs from "node:fs";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("GITHUB_USERNAME veya GITHUB_TOKEN bulunamadı.");
}

const query = `
query($login: String!) {
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
  body: JSON.stringify({
    query,
    variables: {
      login: username,
    },
  }),
});

const json = await response.json();

if (json.errors) {
  console.error(json.errors);
  throw new Error("GitHub contribution verileri alınamadı.");
}

const calendar =
  json.data.user.contributionsCollection.contributionCalendar;

const weeks = calendar.weeks;

const CELL = 10;
const GAP = 3;
const STEP = CELL + GAP;

const ROWS = 7;
const COLS = weeks.length;

const WIDTH = COLS * STEP;
const HEIGHT = ROWS * STEP;

const DURATION = 22;

// --------------------------------------------------
// Contribution hücreleri
// --------------------------------------------------

const cells = [];

weeks.forEach((week, x) => {
  week.contributionDays.forEach((day, y) => {
    cells.push({
      x,
      y,
      count: day.contributionCount,
      color: day.color,
      date: day.date,
    });
  });
});

// --------------------------------------------------
// Full-year serpentine route
//
// row 0: --->>
// row 1: <<---
// row 2: --->>
// ...
// --------------------------------------------------

const route = [];

for (let y = 0; y < ROWS; y++) {
  if (y % 2 === 0) {
    for (let x = 0; x < COLS; x++) {
      route.push({ x, y });
    }
  } else {
    for (let x = COLS - 1; x >= 0; x--) {
      route.push({ x, y });
    }
  }
}

const routeLength = route.length;

const xValues = route
  .map((p) => p.x * STEP)
  .join(";");

const yValues = route
  .map((p) => p.y * STEP)
  .join(";");

// Contribution hücresinin snake tarafından
// kaçıncı sırada ziyaret edildiğini buluyoruz.

const routeIndexes = new Map();

route.forEach((p, index) => {
  routeIndexes.set(`${p.x}:${p.y}`, index);
});

// --------------------------------------------------
// SVG
// --------------------------------------------------

let svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 ${WIDTH} ${HEIGHT}"
  width="${WIDTH}"
  height="${HEIGHT}"
>

<style>

.empty {
  fill: #161b22;
}

@media (prefers-color-scheme: light) {
  .empty {
    fill: #ebedf0;
  }
}

.snake {
  fill: #39d353;
}

</style>

<g id="contributions">
`;

// --------------------------------------------------
// Contribution grid
// --------------------------------------------------

for (const cell of cells) {
  const px = cell.x * STEP;
  const py = cell.y * STEP;

  const routeIndex =
    routeIndexes.get(`${cell.x}:${cell.y}`) ?? 0;

  const visitTime =
    (routeIndex / routeLength) * DURATION;

  const active = cell.count > 0;

  svg += `
  <rect
    x="${px}"
    y="${py}"
    width="${CELL}"
    height="${CELL}"
    rx="2"
    class="${active ? "" : "empty"}"
    fill="${active ? cell.color : undefined}"
  >
  `;

  // Sadece contribution olan hücreler yeniyor.
  if (active) {
    svg += `
    <animate
      attributeName="opacity"
      values="1;0;0;1"
      keyTimes="0;0.02;0.96;1"
      begin="${visitTime.toFixed(3)}s"
      dur="${DURATION}s"
      repeatCount="indefinite"
    />
    `;
  }

  svg += `</rect>`;
}

svg += `
</g>

<g id="snake">
`;

// --------------------------------------------------
// Snake body
// --------------------------------------------------

const snakeLength = 6;

for (let i = snakeLength - 1; i >= 0; i--) {
  const size = CELL - i * 0.65;
  const offset = (CELL - size) / 2;

  svg += `
  <rect
    class="snake"
    width="${size}"
    height="${size}"
    rx="${size / 3}"
    x="${offset}"
    y="${offset}"
    opacity="${1 - i * 0.10}"
  >

    <animate
      attributeName="x"
      values="${route
        .map((p) => p.x * STEP + offset)
        .join(";")}"
      dur="${DURATION}s"
      begin="-${(i * DURATION / routeLength).toFixed(3)}s"
      repeatCount="indefinite"
      calcMode="linear"
    />

    <animate
      attributeName="y"
      values="${route
        .map((p) => p.y * STEP + offset)
        .join(";")}"
      dur="${DURATION}s"
      begin="-${(i * DURATION / routeLength).toFixed(3)}s"
      repeatCount="indefinite"
      calcMode="linear"
    />

  </rect>
  `;
}

svg += `
</g>

</svg>
`;

fs.mkdirSync("dist", {
  recursive: true,
});

fs.writeFileSync(
  "dist/full-year-snake.svg",
  svg,
  "utf8"
);

console.log(
  `Generated full-year snake for ${username}`
);

console.log(
  `Total contributions: ${calendar.totalContributions}`
);

console.log(
  `Grid: ${COLS} weeks × ${ROWS} days`
);
