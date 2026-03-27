import { Player } from "./types";
import { PracticeConfig } from "./constraints";
import { TeamColors } from "./colors";
import { splitIntoGroups } from "@/components/PracticePanel";

// ── Age-appropriate coaching instructions per station ──

interface StationGuide {
  setup: string;
  drills: string[];
  coachQuote: string;
}

function getStationGuide(stationName: string, ageRange: string): StationGuide {
  const young = ageRange <= "7-8";
  const key = stationName.toLowerCase();

  if (key.includes("throwing") || key.includes("accuracy")) {
    return young ? {
      setup: "Set up targets (buckets/cones) at 15-20 feet. Groups of 2-3, one ball each.",
      drills: [
        "Point your glove at the target, step and throw — 10 reps each",
        "\"Bucket Challenge\" — how many can your group get in?",
        "Move back 5 feet after every 3 hits",
      ],
      coachQuote: "\"See the target, step to the target, throw to the target. Every throw on purpose — no lazy ones!\"",
    } : {
      setup: "Targets at 30-45 feet. Partners or relay lines.",
      drills: [
        "Crow hop and throw — emphasize momentum toward target, 10 reps",
        "Quick release drill — catch and throw in under 2 seconds",
        "Long toss — start close, back up 5 feet each round",
      ],
      coachQuote: "\"Get your feet moving toward the target. Quick transfer — glove to hand. Follow your throw!\"",
    };
  }

  if (key.includes("fielding") || key.includes("grounder")) {
    return young ? {
      setup: "Spread out in a line 15 feet from coach. Roll grounders by hand.",
      drills: [
        "\"Alligator chomp\" — top hand closes on the ball, 8 reps each",
        "Roll left, roll right — move feet first, then field",
        "\"Ready position!\" — feet wide, hands out, butt down. Hold it!",
      ],
      coachQuote: "\"Get in front of it, field it clean, and make a strong throw. Call the base before you catch it!\"",
    } : {
      setup: "Infield positions. Coach hits grounders with a bat or fungo.",
      drills: [
        "Forehand/backhand drill — 5 each side, focus on footwork",
        "Field and throw to first — full play, emphasize quick transfer",
        "Short hop drill — coach bounces ball in front of fielder, 6 reps",
      ],
      coachQuote: "\"Charge the ball — don't let it play you. Field it out front, not between your feet!\"",
    };
  }

  if (key.includes("fly") || key.includes("pop")) {
    return young ? {
      setup: "Open area. Coach tosses pop-ups by hand (underhand). Groups of 3-4.",
      drills: [
        "\"Call it!\" — yell \"I got it!\" before every catch, 6 reps each",
        "Drop step drill — first step is back, then look up",
        "Tennis ball toss — easier to catch, builds confidence",
      ],
      coachQuote: "\"Call it loud! I want to hear you! Get under it — don't reach.\"",
    } : {
      setup: "Outfield area. Coach hits fly balls with fungo.",
      drills: [
        "Drop step and go — first step is back on every fly ball, 6 reps",
        "Communication drill — two fielders, must call it or it's a do-over",
        "Crow hop after the catch — practice the throw back in",
      ],
      coachQuote: "\"First step back! Then find the ball. Call it early, call it loud. Catch and throw — hit the cutoff.\"",
    };
  }

  if (key.includes("hitting") || key.includes("tee") || key.includes("batting")) {
    return young ? {
      setup: "3-4 tee stations, groups of 3-4 rotating. Whiffle or safety balls OK.",
      drills: [
        "Sequence only: STANCE → LOAD → SWING. That's it — 8-10 swings each",
        "ZERO corrections during swings — only say \"Stance, load, swing\" or \"I liked that one!\"",
        "Make it a contest: \"Who can hit it past that cone?\"",
      ],
      coachQuote: "\"Stance... load... swing! That's all I want. Who can hit it past that cone? Let's go!\"",
    } : {
      setup: "Tee stations and/or soft toss. Rotate every 8-10 swings.",
      drills: [
        "Tee work — inside/outside/middle placement, 3 swings each spot",
        "Soft toss from the side — timing and contact point, 8 reps",
        "Two-strike approach — choke up, shorten swing, put it in play",
      ],
      coachQuote: "\"Drive through the ball. Stay back — let it get to you. Good barrel!\"",
    };
  }

  if (key.includes("base") && key.includes("run")) {
    return young ? {
      setup: "Full bases set up. All kids start at home plate.",
      drills: [
        "\"Touch and go\" — run through first base, don't slow down, 3 reps",
        "\"Round it!\" — practice rounding first on a double",
        "Freeze tag on bases — coach yells \"FREEZE\" and kids must be on a base",
      ],
      coachQuote: "\"Run THROUGH the bag, not TO the bag. Fast feet! Don't look back!\"",
    } : {
      setup: "Full diamond. Practice base-to-base with game situations.",
      drills: [
        "Primary and secondary leads — 5 reps from first, 5 from second",
        "Read the ball off the bat — go/no-go decisions from second base",
        "First-to-third on a single — read the outfielder's arm",
      ],
      coachQuote: "\"See the ball, read the play, then go. Aggressive turns — make them throw.\"",
    };
  }

  if (key.includes("bunt")) {
    return {
      setup: young ? "Tees or soft toss. Show proper stance first." : "Live soft toss from 20 feet.",
      drills: [
        young ? "\"Catch the ball with the bat\" — deadening the ball, 8 reps" : "Sacrifice bunt — get it down the line, 6 reps",
        "Target cones along the baselines — aim and bunt",
        "Bunt for a base hit — push bunt past the pitcher, 4 reps",
      ],
      coachQuote: "\"Bend your knees, not your back. Angle the bat where you want it to go. Soft hands!\"",
    };
  }

  if (key.includes("catch") || key.includes("block")) {
    return {
      setup: "Catcher's gear on. Coach rolls/bounces balls from 15 feet.",
      drills: [
        "Blocking drill — drop to knees, keep ball in front, 8 reps",
        young ? "Framing drill — catch and squeeze, don't stab" : "Pop-up footwork — rip mask, find ball, get under it",
        "Throwing to second — receive, transfer, throw, 5 reps",
      ],
      coachQuote: "\"Keep it in front of you — that's the job. Quick hands on the transfer!\"",
    };
  }

  if (key.includes("pitch") || key.includes("mechanic")) {
    return {
      setup: young ? "No mound needed. 25-30 feet from a target/net." : "Flat ground or mound. 40-46 feet.",
      drills: [
        young ? "\"Balance point\" — lift knee, hold 2 seconds, throw. 6 reps" : "Full windup — slow motion, then build speed. 8 reps",
        young ? "Wall drill — stand sideways, throw without hitting wall" : "Towel drill — full motion, snap the towel to target",
        "Bullpen — 10-15 pitches with a target, track strikes",
      ],
      coachQuote: "\"Balance... then go. Throw downhill. Follow through — finish your pitch!\"",
    };
  }

  if (key.includes("soft toss")) {
    return {
      setup: "Tosser kneels to the side at 45 degrees. Net or fence as backstop.",
      drills: [
        "Front toss from behind L-screen, 10 swings",
        "High/low toss — mix locations, hitter adjusts, 8 swings",
        "Rapid fire — quick feed, hitter resets between each, 6 swings",
      ],
      coachQuote: "\"See the ball, hit the ball. Stay through the zone — don't pull off!\"",
    };
  }

  if (key.includes("defensive") || key.includes("decision")) {
    return {
      setup: "All kids in infield positions — coach rolls grounders from home plate.",
      drills: [
        "Before EVERY ball: ask \"Where's your throw going?\" — kid points and says the base",
        "Rounds 1-6: always throw to first base — build the habit",
        "Rounds 7-12: add an imaginary runner — any fast decision is a good decision",
        "SILENCE during the play — no coaching mid-rep",
      ],
      coachQuote: "\"Before every single ball — where's it going? Point to it, say it. Then we play.\"",
    };
  }

  // Generic fallback
  return {
    setup: "Set up equipment and organize groups.",
    drills: [
      "Warm-up reps at 50% speed, then build up",
      "Competitive element — keep score between groups",
      "Finish with game-speed reps",
    ],
    coachQuote: "\"Good effort! Let's go, energy up!\"",
  };
}

function getWarmupGuide(ageRange: string): StationGuide {
  const young = ageRange <= "7-8";
  return young ? {
    setup: "Full team together in the outfield.",
    drills: [
      "Yell \"BASEBALL READY!\" — kids snap into position (feet wide, knees bent, hands out, eyes up). \"RELAX!\" Repeat 6-8x, get faster each time",
      "Add a jog — blow the whistle and kids freeze in baseball-ready wherever they are",
      "Partner throwing — start at 15 feet, back up every 5 throws",
    ],
    coachQuote: "\"Baseball ready... RELAX! Baseball ready... RELAX! Let's go, faster! Who can get into position the fastest?\"",
  } : {
    setup: "Full team on the foul line.",
    drills: [
      "Dynamic stretching — high knees, butt kicks, karaoke, 40 feet each",
      "Light jog, build to 75% sprint over 60 feet",
      "Partner throwing — start close, work out to long toss distance",
    ],
    coachQuote: "\"Get loose, not lazy. Build your throws — don't start airing it out. Move your feet when you throw.\"",
  };
}

function getScrimmageGuide(ageRange: string): StationGuide {
  const young = ageRange <= "7-8";
  return young ? {
    setup: "Split into two teams. Hit off tee, real bases, keep score.",
    drills: [
      "Before each batter: every fielder points and answers \"Where's it going?\"",
      "THE RULE: coaches say NOTHING during the play — no \"throw it here!\", nothing",
      "After each play: \"What did you see?\" — don't correct, let them process",
      "If a kid freezes: \"You got the ball — that's the hard part! Where would it have gone?\"",
    ],
    coachQuote: "\"You guys are running this. I'm not going to tell you where to throw. Figure it out. That's real baseball.\"",
  } : {
    setup: "Two teams, full rules. Coach pitch or player pitch depending on level.",
    drills: [
      "Situational play — set up specific game scenarios (runner on 2nd, 1 out, etc.)",
      "Every fielder communicates before the pitch — \"I've got third!\"",
      "3 outs or 5 batters per side, then flip — keep it moving",
    ],
    coachQuote: "\"This is game time. Good swings, talk in the field, make smart throws. Let's go!\"",
  };
}

// ── Generate practice plan as styled HTML in a print window ──

export async function generatePracticePDF(
  players: Player[],
  practice: PracticeConfig,
  teamName: string,
  logoDataUrl: string | null | undefined,
  colors: TeamColors
): Promise<{ save: () => void }> {
  const enabledStations = practice.stations.filter((s) => s.enabled);
  const activeStations = enabledStations.slice(0, practice.stationCount);
  const drillMinutes = practice.durationMinutes - practice.warmupMinutes - practice.scrimmageMinutes - 5;
  const perStation = practice.stationCount > 0 ? Math.floor(drillMinutes / practice.stationCount) : 0;
  const groups = splitIntoGroups(players, practice.stationCount);
  const scrimmageTeams = practice.scrimmageMinutes > 0 ? splitIntoGroups(players, 2) : [];

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Build schedule blocks
  let clock = 0;
  const sections: string[] = [];

  // Warm-up
  const warmup = getWarmupGuide(practice.ageRange);
  sections.push(renderSection(
    "WARM-UP",
    `0:${String(clock).padStart(2, "0")}–0:${String(clock + practice.warmupMinutes).padStart(2, "0")}`,
    "(All Together)",
    warmup,
    colors,
  ));
  clock += practice.warmupMinutes;

  // Station header with rotation table
  sections.push(renderRotationTable(activeStations, groups, practice, clock, perStation, colors));

  // Individual station details
  for (let i = 0; i < practice.stationCount; i++) {
    const station = activeStations[i] || { name: `Station ${i + 1}` };
    const endMin = clock + perStation;
    const guide = getStationGuide(station.name, practice.ageRange);
    sections.push(renderSection(
      `STATION ${i + 1} — ${station.name.toUpperCase()}`,
      `0:${String(clock).padStart(2, "0")}–0:${String(endMin).padStart(2, "0")}`,
      undefined,
      guide,
      colors,
    ));
    clock = endMin;
  }

  // Scrimmage
  if (practice.scrimmageMinutes > 0) {
    clock += 2; // water break
    const scrimmage = getScrimmageGuide(practice.ageRange);
    sections.push(renderSection(
      "SCRIMMAGE",
      `0:${String(clock).padStart(2, "0")}–${practice.durationMinutes >= 60 ? "1:00" : `0:${String(clock + practice.scrimmageMinutes).padStart(2, "0")}`}`,
      practice.scrimmageMinutes > 0 ? "(Team A vs Team B)" : undefined,
      scrimmage,
      colors,
    ));
  }

  // Cool-down
  sections.push(renderSection(
    "COOL-DOWN & HUDDLE",
    "5 min",
    undefined,
    {
      setup: "Stretch circle as a full team.",
      drills: [
        "Coach shoutouts — 1 specific thing each kid did well today",
        "Team cheer to close it out!",
      ],
      coachQuote: `"I'm proud of every one of you today. You worked hard and lifted each other up. That's ${teamName} baseball. Hands in!"`,
    },
    colors,
  ));

  // Coach cheat sheet
  sections.push(renderCheatSheet(colors));

  // Build full HTML
  const stationSummary = activeStations.map(s => s.name).join(" / ");
  const subtitle = `${practice.durationMinutes} Minutes · Warm-Up / ${stationSummary}${practice.scrimmageMinutes > 0 ? " + Scrimmage" : ""}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${teamName} — Practice Plan</title>
<style>
  @page { margin: 12mm 14mm; size: letter; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11px;
    line-height: 1.5;
    color: #333;
    max-width: 210mm;
    margin: 0 auto;
  }
  .header { text-align: center; margin-bottom: 8px; }
  .header img.pennant { height: 60px; margin-bottom: 4px; }
  .title-row { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 2px; }
  .title-row img.logo { height: 28px; width: 28px; object-fit: contain; }
  .title-row h1 { font-size: 20px; font-weight: 800; color: ${colors.primary}; letter-spacing: 0.5px; }
  .accent-line { height: 3px; background: ${colors.secondary}; margin: 0 40px 6px; }
  .subtitle { text-align: center; font-size: 11px; color: #666; margin-bottom: 4px; }
  .teams { margin-bottom: 8px; font-size: 10px; }
  .teams strong { color: ${colors.primary}; }

  .section { margin-bottom: 10px; page-break-inside: avoid; }
  .section-header {
    background: ${colors.primary};
    color: white;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 800;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 2px;
  }
  .section-header .time { font-weight: 600; font-size: 11px; opacity: 0.85; }
  .section-header .sub { font-weight: 400; font-size: 10px; opacity: 0.7; }
  .section-body { padding: 6px 10px 4px; border-left: 3px solid ${colors.secondary}; margin-left: 2px; }
  .setup { font-style: italic; color: #555; margin-bottom: 4px; font-size: 10.5px; }
  .drills { margin: 0; padding-left: 14px; }
  .drills li { margin-bottom: 2px; font-size: 10.5px; }
  .quote {
    margin-top: 5px;
    padding: 4px 8px;
    background: ${colors.primary}11;
    border-radius: 3px;
    font-style: italic;
    color: ${colors.primary};
    font-size: 10px;
    font-weight: 600;
  }

  .rotation-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
  .rotation-table th {
    background: ${colors.primary};
    color: white;
    padding: 3px 6px;
    font-size: 8px;
    text-transform: uppercase;
    font-weight: 700;
  }
  .rotation-table td { padding: 2px 6px; border: 1px solid #ddd; text-align: center; }
  .rotation-table tr:nth-child(even) td { background: #f8f9fb; }

  .groups-inline { display: flex; gap: 8px; margin: 6px 0; }
  .group-box { flex: 1; border: 1px solid #ddd; border-radius: 3px; padding: 4px 6px; font-size: 9px; }
  .group-box strong { display: block; font-size: 8px; color: ${colors.primary}; text-transform: uppercase; margin-bottom: 2px; }

  .cheat-sheet { page-break-inside: avoid; margin-top: 8px; }
  .cheat-sheet h3 {
    background: ${colors.primary};
    color: white;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 800;
    border-radius: 2px;
    margin-bottom: 4px;
  }
  .cheat-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .cheat-table th { text-align: left; padding: 4px 8px; background: #f0f0f0; font-size: 9px; color: #666; }
  .cheat-table td { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .cheat-table .say { color: ${colors.primary}; font-weight: 600; }
  .cheat-table .avoid { color: #999; font-style: italic; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <img class="pennant" src="/logo.png" alt="">
  </div>
  <div class="title-row">
    ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="">` : ""}
    <h1>${teamName.toUpperCase()} — PRACTICE PLAN</h1>
  </div>
  <div class="accent-line"></div>
  <div class="subtitle">${dateStr} | ${subtitle}</div>

  ${scrimmageTeams.length === 2 ? `
  <div class="teams">
    <strong>SCRIMMAGE TEAM A</strong> ${scrimmageTeams[0].map(p => p.name).join(", ")}<br>
    <strong>SCRIMMAGE TEAM B</strong> ${scrimmageTeams[1].map(p => p.name).join(", ")}
  </div>` : ""}

  ${sections.join("\n")}

  <!-- Player Groups Reference -->
  <div class="groups-inline">
    ${groups.map((g, i) => `
      <div class="group-box">
        <strong>Group ${i + 1}</strong>
        ${g.map(p => p.name).join(", ")}
      </div>
    `).join("")}
  </div>

  ${players.some(p => p.absent) ? `
  <div style="font-size: 9px; color: #aaa; margin-top: 4px;">
    Absent: ${players.filter(p => p.absent).map(p => p.name).join(", ")}
  </div>` : ""}
</body>
</html>`;

  return {
    save: () => {
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      // Auto-trigger print after content loads
      win.onload = () => {
        setTimeout(() => win.print(), 300);
      };
    },
  };
}

function renderSection(
  title: string,
  time: string,
  subtitle: string | undefined,
  guide: StationGuide,
  colors: TeamColors,
): string {
  return `
  <div class="section">
    <div class="section-header">
      <span>${title} ${subtitle ? `<span class="sub">${subtitle}</span>` : ""}</span>
      <span class="time">${time}</span>
    </div>
    <div class="section-body">
      <div class="setup">${guide.setup}</div>
      <ul class="drills">
        ${guide.drills.map(d => `<li>${d}</li>`).join("")}
      </ul>
      <div class="quote">${guide.coachQuote}</div>
    </div>
  </div>`;
}

function renderRotationTable(
  stations: { name: string }[],
  groups: Player[][],
  practice: PracticeConfig,
  startClock: number,
  perStation: number,
  colors: TeamColors,
): string {
  const rows: string[] = [];
  for (let rot = 0; rot < practice.stationCount; rot++) {
    const clock = startClock + rot * perStation;
    const cells = groups.map((_, g) => {
      const stIdx = (g + rot) % practice.stationCount;
      return `<td>${stations[stIdx]?.name || "?"}</td>`;
    }).join("");
    rows.push(`<tr><td style="font-weight:700;color:${colors.primary}">${rot + 1} (${clock}')</td>${cells}</tr>`);
  }

  return `
  <div class="section">
    <div class="section-header">
      <span>STATION ROTATIONS</span>
      <span class="time">${practice.stationCount} stations × ${perStation} min</span>
    </div>
    <table class="rotation-table">
      <tr><th>Round</th>${groups.map((_, i) => `<th>Group ${i + 1}</th>`).join("")}</tr>
      ${rows.join("")}
    </table>
  </div>`;
}

function renderCheatSheet(colors: TeamColors): string {
  return `
  <div class="cheat-sheet">
    <h3>COACH CHEAT SHEET</h3>
    <table class="cheat-table">
      <tr><th>SITUATION</th><th>SAY THIS</th><th>NOT THIS</th></tr>
      <tr>
        <td>Before at-bat</td>
        <td class="say">Stance, load, swing. You got this.</td>
        <td class="avoid">Don't adjust their hands/feet/stance</td>
      </tr>
      <tr>
        <td>Before each play</td>
        <td class="say">Where's it going? (then be quiet)</td>
        <td class="avoid">Don't yell instructions during live play</td>
      </tr>
      <tr>
        <td>After a mistake</td>
        <td class="say">What did you see on that play?</td>
        <td class="avoid">Don't correct mechanics mid-swing</td>
      </tr>
      <tr>
        <td>After a freeze</td>
        <td class="say">You got the ball! Where would it have gone?</td>
        <td class="avoid">Don't say "you should have..." — ask "what did you see?"</td>
      </tr>
      <tr>
        <td>After a good play</td>
        <td class="say">Nobody told you what to do and you figured it out!</td>
        <td class="avoid">Don't over-praise — be specific about what was good</td>
      </tr>
    </table>
  </div>`;
}
