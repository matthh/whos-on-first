import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Player } from "./types";
import { PracticeConfig } from "./constraints";
import { TeamColors, hexToRgb } from "./colors";
import { splitIntoGroups } from "@/components/PracticePanel";

let pennantCache: string | null = null;

async function loadPennant(): Promise<string | null> {
  if (pennantCache) return pennantCache;
  try {
    const res = await fetch("/logo.png");
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        pennantCache = reader.result as string;
        resolve(pennantCache);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Age-appropriate coaching instructions ──

interface StationGuide {
  setup: string;
  drills: string[];
  coachQuote: string;
}

function getStationGuide(name: string, age: string): StationGuide {
  const young = age <= "7-8";
  const k = name.toLowerCase();

  if (k.includes("throwing") || k.includes("accuracy")) return young ? {
    setup: "Targets (buckets/cones) at 15-20 ft. Groups of 2-3.",
    drills: ["Point glove at target, step and throw — 10 reps", "\"Bucket Challenge\" — how many in?", "Move back 5 ft after every 3 hits"],
    coachQuote: "\"See the target, step to the target, throw to the target. Every throw on purpose!\"",
  } : {
    setup: "Targets at 30-45 ft. Partners or relay lines.",
    drills: ["Crow hop and throw — momentum toward target, 10 reps", "Quick release — catch and throw under 2 sec", "Long toss — start close, back up each round"],
    coachQuote: "\"Get your feet moving toward the target. Quick transfer — glove to hand!\"",
  };

  if (k.includes("fielding") || k.includes("grounder")) return young ? {
    setup: "Line 15 ft from coach. Roll grounders by hand.",
    drills: ["\"Alligator chomp\" — top hand closes on ball, 8 reps", "Roll left, roll right — feet first, then field", "\"Ready position!\" — feet wide, hands out, butt down"],
    coachQuote: "\"Get in front of it, field it clean, make a strong throw!\"",
  } : {
    setup: "Infield positions. Coach hits grounders with fungo.",
    drills: ["Forehand/backhand — 5 each side, focus on footwork", "Field and throw to first — full play, quick transfer", "Short hop drill — coach bounces ball, 6 reps"],
    coachQuote: "\"Charge the ball — don't let it play you. Field it out front!\"",
  };

  if (k.includes("fly") || k.includes("pop")) return young ? {
    setup: "Open area. Coach tosses pop-ups underhand. Groups of 3-4.",
    drills: ["\"Call it!\" — yell \"I got it!\" before every catch, 6 reps", "Drop step drill — first step back, then look up", "Tennis ball toss — easier to catch, builds confidence"],
    coachQuote: "\"Call it loud! Get under it — don't reach!\"",
  } : {
    setup: "Outfield area. Coach hits fly balls with fungo.",
    drills: ["Drop step and go — first step back, 6 reps", "Communication drill — two fielders, must call it", "Crow hop after catch — practice the throw back in"],
    coachQuote: "\"First step back! Call it early, call it loud!\"",
  };

  if (k.includes("hitting") || k.includes("tee") || k.includes("batting")) return young ? {
    setup: "3-4 tee stations, groups of 3-4. Whiffle balls OK.",
    drills: ["STANCE > LOAD > SWING — that's it. 8-10 swings each", "ZERO corrections — only say \"Stance, load, swing!\"", "Contest: \"Who can hit it past that cone?\""],
    coachQuote: "\"Stance... load... swing! That's all I want. Let's go!\"",
  } : {
    setup: "Tee stations and/or soft toss. Rotate every 8-10 swings.",
    drills: ["Tee work — inside/outside/middle, 3 swings each spot", "Soft toss from the side — timing and contact, 8 reps", "Two-strike approach — choke up, shorten swing"],
    coachQuote: "\"Drive through the ball. Stay back — let it get to you!\"",
  };

  if (k.includes("base") && k.includes("run")) return young ? {
    setup: "Full bases. All kids start at home plate.",
    drills: ["\"Touch and go\" — run through first, don't slow down, 3 reps", "\"Round it!\" — practice rounding first on a double", "Freeze tag — coach yells FREEZE, must be on a base"],
    coachQuote: "\"Run THROUGH the bag, not TO the bag. Fast feet!\"",
  } : {
    setup: "Full diamond. Base-to-base with game situations.",
    drills: ["Primary/secondary leads — 5 reps from 1st, 5 from 2nd", "Read the ball off the bat — go/no-go from 2nd", "First-to-third on a single — read the OF arm"],
    coachQuote: "\"See the ball, read the play, then go. Aggressive turns!\"",
  };

  if (k.includes("bunt")) return {
    setup: young ? "Tees or soft toss. Show stance first." : "Live soft toss from 20 ft.",
    drills: [young ? "\"Catch the ball with the bat\" — deaden it, 8 reps" : "Sacrifice bunt — down the line, 6 reps", "Target cones along baselines", "Bunt for a hit — push past the pitcher, 4 reps"],
    coachQuote: "\"Bend your knees, not your back. Angle the bat where you want it!\"",
  };

  if (k.includes("catch") || k.includes("block")) return {
    setup: "Catcher's gear on. Coach bounces balls from 15 ft.",
    drills: ["Blocking — drop to knees, keep ball in front, 8 reps", young ? "Framing — catch and squeeze, don't stab" : "Pop-up footwork — rip mask, find ball", "Throw to second — receive, transfer, throw, 5 reps"],
    coachQuote: "\"Keep it in front — that's the job. Quick hands!\"",
  };

  if (k.includes("pitch") || k.includes("mechanic")) return {
    setup: young ? "No mound. 25-30 ft from target." : "Flat ground or mound. 40-46 ft.",
    drills: [young ? "Balance point — lift knee, hold 2 sec, throw, 6 reps" : "Full windup — slow motion then build, 8 reps", young ? "Wall drill — sideways, throw without hitting wall" : "Towel drill — full motion, snap to target", "Bullpen — 10-15 pitches, track strikes"],
    coachQuote: "\"Balance... then go. Throw downhill. Follow through!\"",
  };

  if (k.includes("soft toss")) return {
    setup: "Tosser kneels at 45 degrees. Net/fence as backstop.",
    drills: ["Front toss from behind L-screen, 10 swings", "High/low toss — mix locations, 8 swings", "Rapid fire — quick feed, reset between, 6 swings"],
    coachQuote: "\"See the ball, hit the ball. Stay through the zone!\"",
  };

  if (k.includes("defensive") || k.includes("decision")) return {
    setup: "All kids in infield positions — coach rolls grounders from HP.",
    drills: ["Before EVERY ball: \"Where's your throw going?\" — point and say the base", "Rounds 1-6: always throw to 1B — build the habit", "Rounds 7-12: add imaginary runner — fast decision = good decision"],
    coachQuote: "\"Where's it going? Point to it, say it. Then we play.\"",
  };

  return {
    setup: "Set up equipment and organize groups.",
    drills: ["Warm-up reps at 50%, build up", "Keep score between groups", "Finish with game-speed reps"],
    coachQuote: "\"Good effort! Energy up!\"",
  };
}

function getWarmupGuide(age: string): StationGuide {
  return age <= "7-8" ? {
    setup: "Full team together in the outfield.",
    drills: [
      "\"BASEBALL READY!\" — snap into position (feet wide, knees bent, hands out). Repeat 6-8x, faster each time",
      "Jog + freeze — blow whistle, kids freeze in baseball-ready wherever they are",
      "Partner throwing — start at 15 ft, back up every 5 throws",
    ],
    coachQuote: "\"Baseball ready... RELAX! Again! Faster! Who's the fastest?\"",
  } : {
    setup: "Full team on the foul line.",
    drills: [
      "Dynamic stretching — high knees, butt kicks, karaoke, 40 ft each",
      "Build to 75% sprint over 60 ft",
      "Partner throwing — start close, work to long toss distance",
    ],
    coachQuote: "\"Get loose, not lazy. Build your throws — move your feet!\"",
  };
}

function getScrimmageGuide(age: string): StationGuide {
  return age <= "7-8" ? {
    setup: "Team A bats, Team B fields. Hit off tee, real bases, keep score.",
    drills: [
      "Before each batter: every fielder points and answers \"Where's it going?\"",
      "THE RULE: coaches say NOTHING during the play — no \"throw it here!\", nothing",
      "After each play: \"What did you see?\" — don't correct, let them process",
      "If a kid freezes: \"You got the ball — that's the hard part! Where would it have gone?\"",
    ],
    coachQuote: "\"You guys are running this. Figure it out. That's real baseball.\"",
  } : {
    setup: "Two teams, full rules. Coach pitch or player pitch.",
    drills: [
      "Situational play — set up game scenarios (runner on 2nd, 1 out)",
      "Every fielder communicates before the pitch",
      "3 outs or 5 batters per side, then flip — keep it moving",
    ],
    coachQuote: "\"Game time. Good swings, talk in the field, smart throws. Let's go!\"",
  };
}

// ── PDF Generation ──

type RGB = [number, number, number];

function sectionHeader(doc: jsPDF, y: number, text: string, timeText: string, primary: RGB, pageW: number): number {
  const margin = 12;
  const w = pageW - margin * 2;
  doc.setFillColor(...primary);
  doc.rect(margin, y, w, 6, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(text, margin + 2, y + 4.2);
  doc.text(timeText, pageW - margin - 2, y + 4.2, { align: "right" });
  return y + 7;
}

function sectionBody(doc: jsPDF, y: number, guide: StationGuide, secondary: RGB, pageW: number, pageH: number): number {
  const margin = 12;
  const bodyX = margin + 3;
  const maxW = pageW - margin - bodyX - 2;
  const startY = y;

  // Setup line
  doc.setFontSize(7);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(90, 90, 90);
  const setupLines = doc.splitTextToSize(guide.setup, maxW);
  doc.text(setupLines, bodyX, y + 3);
  y += setupLines.length * 2.8 + 2;

  // Drills
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(7);
  for (const drill of guide.drills) {
    if (y > pageH - 10) break;
    const lines = doc.splitTextToSize(`\u2022 ${drill}`, maxW);
    doc.text(lines, bodyX + 1, y + 2.5);
    y += lines.length * 2.8 + 0.5;
  }
  y += 1;

  // Coach quote
  if (y < pageH - 10) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bolditalic");
    doc.setTextColor(...secondary);
    const quoteLines = doc.splitTextToSize(guide.coachQuote, maxW - 4);
    doc.text(quoteLines, bodyX + 1, y + 2.5);
    y += quoteLines.length * 2.5 + 2;
  }

  // Left accent border
  doc.setDrawColor(...secondary);
  doc.setLineWidth(1);
  doc.line(margin + 1, startY, margin + 1, y);

  return y + 1;
}

export async function generatePracticePDF(
  players: Player[],
  practice: PracticeConfig,
  teamName: string,
  logoDataUrl: string | null | undefined,
  colors: TeamColors
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const primary = hexToRgb(colors.primary) as RGB;
  const secondary = hexToRgb(colors.secondary) as RGB;
  const margin = 12;

  let y = 8;

  // ── Header ──
  const pennant = await loadPennant();
  if (pennant) {
    try {
      const lw = 40, lh = lw * (1292 / 2521);
      doc.addImage(pennant, "PNG", (pageW - lw) / 2, y, lw, lh);
      y += lh + 2;
    } catch { /* skip */ }
  }

  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, "PNG", margin, y - 1, 6, 6); } catch { /* skip */ }
  }

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  const title = `${teamName.toUpperCase()} \u2014 PRACTICE PLAN`;
  doc.text(title, pageW / 2, y + 4, { align: "center" });

  doc.setDrawColor(...secondary);
  doc.setLineWidth(1);
  doc.line(25, y + 6.5, pageW - 25, y + 6.5);
  y += 10;

  // Subtitle
  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const enabledStations = practice.stations.filter(s => s.enabled);
  const activeStations = enabledStations.slice(0, practice.stationCount);
  const drillMin = practice.durationMinutes - practice.warmupMinutes - practice.scrimmageMinutes - 5;
  const perStation = practice.stationCount > 0 ? Math.floor(drillMin / practice.stationCount) : 0;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`${dateStr}  |  ${practice.durationMinutes} min  |  Ages ${practice.ageRange}  |  ${players.length} players`, pageW / 2, y, { align: "center" });
  y += 3;
  doc.setFontSize(7);
  const stSummary = activeStations.map(s => s.name).join(" / ");
  doc.text(`${practice.warmupMinutes}min Warm-Up / ${stSummary}${practice.scrimmageMinutes > 0 ? ` + ${practice.scrimmageMinutes}min Scrimmage` : ""}`, pageW / 2, y, { align: "center" });
  y += 4;

  // Scrimmage teams
  const groups = splitIntoGroups(players, practice.stationCount);
  if (practice.scrimmageMinutes > 0) {
    const teams = splitIntoGroups(players, 2);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primary);
    doc.text("SCRIMMAGE TEAM A", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(teams[0].map(p => p.name).join(", "), margin + 30, y);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primary);
    doc.text("SCRIMMAGE TEAM B", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(teams[1].map(p => p.name).join(", "), margin + 30, y);
    y += 4;
  }

  // ── WARM-UP ──
  let clock = 0;
  y = sectionHeader(doc, y, "WARM-UP", `0:00\u20130:${String(practice.warmupMinutes).padStart(2, "0")}  (All Together)`, primary, pageW);
  y = sectionBody(doc, y, getWarmupGuide(practice.ageRange), secondary, pageW, pageH);
  clock += practice.warmupMinutes;

  // ── ROTATION TABLE ──
  y = sectionHeader(doc, y, "STATION ROTATIONS", `${practice.stationCount} stations \u00D7 ${perStation} min`, primary, pageW);

  const rotHead = ["Round", ...groups.map((_, i) => `Group ${i + 1}`)];
  const rotRows: string[][] = [];
  for (let r = 0; r < practice.stationCount; r++) {
    const c = clock + r * perStation;
    rotRows.push([`${r + 1} (${c}')`, ...groups.map((_, g) => activeStations[(g + r) % practice.stationCount]?.name || "?")]);
  }

  autoTable(doc, {
    startY: y,
    head: [rotHead],
    body: rotRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2, halign: "center", overflow: "visible" },
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5 },
    columnStyles: { 0: { fontStyle: "bold", textColor: primary } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) + 2;

  // ── STATION DETAILS ──
  for (let i = 0; i < practice.stationCount; i++) {
    const station = activeStations[i] || { name: `Station ${i + 1}` };
    const end = clock + perStation;

    if (y > pageH - 35) { doc.addPage(); y = 10; }

    y = sectionHeader(doc, y, `STATION ${i + 1}: ${station.name.toUpperCase()}`, `${clock}'\u2013${end}'`, primary, pageW);
    y = sectionBody(doc, y, getStationGuide(station.name, practice.ageRange), secondary, pageW, pageH);
    clock = end;
  }

  // ── SCRIMMAGE ──
  if (practice.scrimmageMinutes > 0) {
    clock += 2; // water break
    if (y > pageH - 35) { doc.addPage(); y = 10; }
    y = sectionHeader(doc, y, "SCRIMMAGE", `${clock}'\u2013${clock + practice.scrimmageMinutes}'  (Team A vs Team B)`, primary, pageW);
    y = sectionBody(doc, y, getScrimmageGuide(practice.ageRange), secondary, pageW, pageH);
  }

  // ── COOL-DOWN ──
  if (y > pageH - 30) { doc.addPage(); y = 10; }
  y = sectionHeader(doc, y, "COOL-DOWN & HUDDLE", "5 min", primary, pageW);
  y = sectionBody(doc, y, {
    setup: "Stretch circle as a full team.",
    drills: ["Coach shoutouts — 1 specific thing each kid did well", "Team cheer to close it out!"],
    coachQuote: `"I'm proud of every one of you. You worked hard. That's ${teamName} baseball. Hands in!"`,
  }, secondary, pageW, pageH);

  // ── COACH CHEAT SHEET ──
  if (y > pageH - 30) { doc.addPage(); y = 10; }

  y = sectionHeader(doc, y, "COACH CHEAT SHEET", "Say This / Not This", primary, pageW);

  autoTable(doc, {
    startY: y,
    head: [["SITUATION", "SAY THIS", "NOT THIS"]],
    body: [
      ["Before at-bat", "Stance, load, swing. You got this.", "Don't adjust hands/feet/stance"],
      ["Before each play", "Where's it going? (then be quiet)", "Don't yell instructions during live play"],
      ["After a mistake", "What did you see on that play?", "Don't correct mechanics mid-swing"],
      ["After a freeze", "You got the ball! Where would it have gone?", "Don't say \"you should have...\""],
      ["After a good play", "Nobody told you what to do and you figured it out!", "Don't over-praise — be specific"],
    ],
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 6, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2, overflow: "visible" },
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 28 },
      1: { textColor: primary, fontStyle: "bold" },
      2: { textColor: [160, 160, 160], fontStyle: "italic" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) + 2;

  // ── GROUPS (compact at bottom) ──
  if (y > pageH - 20) { doc.addPage(); y = 10; }

  const grpHead = groups.map((_, i) => `Group ${i + 1}`);
  const maxLen = Math.max(...groups.map(g => g.length));
  const grpRows: string[][] = [];
  for (let r = 0; r < maxLen; r++) {
    grpRows.push(groups.map(g => g[r]?.name || ""));
  }

  autoTable(doc, {
    startY: y,
    head: [grpHead],
    body: grpRows,
    theme: "grid",
    margin: { left: margin, right: margin },
    styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2, halign: "center", overflow: "visible" },
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5 },
    bodyStyles: { textColor: [50, 50, 50] },
  });

  // Absent
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) + 2;
  const absent = players.filter(p => p.absent);
  if (absent.length > 0) {
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(160, 160, 160);
    doc.text(`Absent: ${absent.map(p => p.name).join(", ")}`, margin, y);
  }

  return doc;
}
