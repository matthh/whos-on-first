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

// ── Age-appropriate coaching instructions per station ──

interface StationGuide {
  setup: string;
  drills: string[];
  coachCues: string[];
  avoidSaying: string[];
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
      coachCues: [
        "\"Point, step, throw!\"",
        "\"Eyes on the target\"",
        "\"Nice! I saw you step toward it that time\"",
      ],
      avoidSaying: ["Don't correct arm angle", "Don't say \"you're throwing wrong\""],
    } : {
      setup: "Targets at 30-45 feet. Partners or relay lines.",
      drills: [
        "Crow hop and throw — emphasize momentum toward target, 10 reps",
        "Quick release drill — catch and throw in under 2 seconds",
        "Long toss — start close, back up 5 feet each round",
      ],
      coachCues: [
        "\"Get your feet moving toward the target\"",
        "\"Quick transfer — glove to hand\"",
        "\"Follow your throw\"",
      ],
      avoidSaying: ["Don't overcoach arm mechanics", "Keep it fun — accuracy over velocity"],
    };
  }

  if (key.includes("fielding") || key.includes("grounder")) {
    return young ? {
      setup: "Spread out in a line 15 feet from coach. Roll grounders by hand.",
      drills: [
        "\"Alligator chomp\" — top hand closes on the ball, 8 reps each",
        "Roll left, roll right — move feet first, then field",
        "\"Ready position!\" — feet wide, hands out, butt down",
      ],
      coachCues: [
        "\"Get in front of it!\"",
        "\"Hands out, watch it in\"",
        "\"Good — you moved your feet first!\"",
      ],
      avoidSaying: ["Don't say \"use two hands\" every time — let them feel it", "No criticism on missed balls — \"almost!\" works"],
    } : {
      setup: "Infield positions. Coach hits grounders with a bat or fungo.",
      drills: [
        "Forehand/backhand drill — 5 each side, focus on footwork",
        "Field and throw to first — full play, emphasize quick transfer",
        "Short hop drill — coach bounces ball in front of fielder, 6 reps",
      ],
      coachCues: [
        "\"Charge the ball — don't let it play you\"",
        "\"Field it out front, not between your feet\"",
        "\"Where's the throw going? Know before it's hit\"",
      ],
      avoidSaying: ["Don't correct during the rep — wait until after", "Don't yell instructions mid-play"],
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
      coachCues: [
        "\"Call it loud! I want to hear you!\"",
        "\"Get under it — don't reach\"",
        "\"Good call! That's how teammates communicate\"",
      ],
      avoidSaying: ["Don't toss too high for young kids", "No \"you should have caught that\""],
    } : {
      setup: "Outfield area. Coach hits fly balls with fungo.",
      drills: [
        "Drop step and go — first step is back on every fly ball, 6 reps",
        "Communication drill — two fielders, must call it or it's a do-over",
        "Crow hop after the catch — practice the throw back in",
      ],
      coachCues: [
        "\"First step back! Then find the ball\"",
        "\"Call it early, call it loud\"",
        "\"Catch and throw — hit the cutoff\"",
      ],
      avoidSaying: ["Don't overcorrect routes — reps build instinct", "Don't criticize drops — \"track it next time\""],
    };
  }

  if (key.includes("hitting") || key.includes("tee") || key.includes("batting")) {
    return young ? {
      setup: "3-4 tee stations, groups of 3-4 rotating. Whiffle or safety balls OK.",
      drills: [
        "STANCE → LOAD → SWING — that's the only sequence. 8-10 swings each",
        "\"Hit it past the cone\" — distance challenge keeps it fun",
        "ZERO corrections during swings — only say \"Stance, load, swing!\"",
      ],
      coachCues: [
        "\"Stance... load... swing! That's all I want\"",
        "\"I liked that one!\"",
        "\"Who can hit it past that cone?\"",
      ],
      avoidSaying: ["Don't adjust hands/feet/stance", "Don't say \"keep your eye on the ball\" (they know)"],
    } : {
      setup: "Tee stations and/or soft toss. Rotate every 8-10 swings.",
      drills: [
        "Tee work — inside/outside/middle placement, 3 swings each spot",
        "Soft toss from the side — timing and contact point, 8 reps",
        "Two-strike approach — choke up, shorten swing, put it in play",
      ],
      coachCues: [
        "\"Drive through the ball\"",
        "\"Stay back — let it get to you\"",
        "\"Good barrel! That's a line drive\"",
      ],
      avoidSaying: ["Don't overload with mechanics — pick ONE thing", "Don't correct mid-swing"],
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
      coachCues: [
        "\"Run THROUGH the bag, not TO the bag\"",
        "\"Look at first base coach — what's the signal?\"",
        "\"Fast feet! Don't look back!\"",
      ],
      avoidSaying: ["Don't yell \"run faster\" — teach technique instead", "Don't make slow kids feel bad — everyone improves"],
    } : {
      setup: "Full diamond. Practice base-to-base with game situations.",
      drills: [
        "Primary and secondary leads — 5 reps from first, 5 from second",
        "Read the ball off the bat — go/no-go decisions from second base",
        "First-to-third on a single — read the outfielder's arm",
      ],
      coachCues: [
        "\"See the ball, read the play, then go\"",
        "\"Aggressive turns — make them throw\"",
        "\"Know the situation before the pitch\"",
      ],
      avoidSaying: ["Don't criticize a kid who gets thrown out trying — praise the aggression"],
    };
  }

  if (key.includes("bunt")) {
    return {
      setup: young ? "Tees or soft toss. Show proper stance first." : "Live soft toss from 20 feet.",
      drills: [
        young ? "\"Catch the ball with the bat\" — deadening the ball, 8 reps" : "Sacrifice bunt — get it down the first or third base line, 6 reps",
        young ? "Target cones along the baselines — aim and bunt" : "Squeeze play simulation — must bunt any pitch in the zone",
        "Bunt for a base hit — push bunt past the pitcher, 4 reps",
      ],
      coachCues: ["\"Bend your knees, not your back\"", "\"Angle the bat where you want it to go\"", "\"Soft hands — catch it, don't hit it\""],
      avoidSaying: ["Don't make it boring — keep it competitive", "Don't over-rep — 8-10 bunts is plenty"],
    };
  }

  if (key.includes("catch") || key.includes("block")) {
    return {
      setup: "Catcher's gear on. Coach rolls/bounces balls from 15 feet.",
      drills: [
        "Blocking drill — drop to knees, keep ball in front, 8 reps",
        young ? "Framing drill — catch and squeeze, don't stab at it" : "Pop-up footwork — rip mask, find the ball, get under it",
        "Throwing to second — receive, transfer, throw, 5 reps",
      ],
      coachCues: ["\"Keep it in front of you — that's the job\"", "\"Quick hands on the transfer\"", "\"Block first, look for the ball second\""],
      avoidSaying: ["Don't rush through — catchers need more reps per drill", "Don't let non-catchers stand around watching"],
    };
  }

  if (key.includes("pitch") || key.includes("mechanic")) {
    return {
      setup: young ? "No mound needed. 25-30 feet from a target/net." : "Flat ground or mound. 40-46 feet.",
      drills: [
        young ? "\"Balance point\" — lift knee, hold for 2 seconds, throw. 6 reps" : "Full windup mechanics — slow motion, then build speed. 8 reps",
        young ? "Wall drill — stand sideways to a wall, throw without hitting it" : "Towel drill — full motion, snap the towel to the target",
        "Bullpen session — 10-15 pitches with a target, track strikes",
      ],
      coachCues: ["\"Balance... then go\"", "\"Throw downhill\"", "\"Follow through — finish your pitch\""],
      avoidSaying: ["Don't overload with cues — pick ONE per session", "Don't push through if arm is tired — quality over quantity"],
    };
  }

  if (key.includes("soft toss")) {
    return {
      setup: "Tosser kneels to the side at 45 degrees. Net or fence as backstop.",
      drills: [
        "Front toss — tosser feeds from the front behind an L-screen, 10 swings",
        "High/low toss — mix up locations, hitter adjusts, 8 swings",
        "Rapid fire — quick feed, hitter resets between each, 6 swings",
      ],
      coachCues: ["\"See the ball, hit the ball\"", "\"Stay through the zone — don't pull off\"", "\"Good bat path!\""],
      avoidSaying: ["Don't toss too fast", "Let the hitter find a rhythm before coaching"],
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
    coachCues: ["\"Good effort!\"", "\"What did you see on that one?\"", "\"Let's go, energy up!\""],
    avoidSaying: ["Keep instructions short", "Don't over-coach — let them play"],
  };
}

function getWarmupGuide(ageRange: string): StationGuide {
  const young = ageRange <= "7-8";
  return young ? {
    setup: "Full team together in the outfield.",
    drills: [
      "\"Baseball Ready!\" — kids snap into position (feet wide, knees bent, hands out). Repeat 6-8x, faster each time",
      "Light jog around the bases — touch every bag",
      "Partner throwing — start at 15 feet, back up every 5 throws",
    ],
    coachCues: ["\"Baseball ready... RELAX! Again! Faster!\"", "\"Who can get into position the fastest?\"", "\"Nice and easy throws — hit your partner's chest\""],
    avoidSaying: ["Don't let warm-up drag — keep it moving", "Don't skip throwing — arms need to warm up"],
  } : {
    setup: "Full team on the foul line.",
    drills: [
      "Dynamic stretching — high knees, butt kicks, karaoke, 40 feet each",
      "Light jog, build to 75% sprint over 60 feet",
      "Partner throwing — start close, work out to long toss distance",
    ],
    coachCues: ["\"Get loose, not lazy\"", "\"Build your throws — don't start airing it out\"", "\"Move your feet when you throw\""],
    avoidSaying: ["Don't let it turn into a chatfest — set the tempo early"],
  };
}

function getScrimmageGuide(ageRange: string): StationGuide {
  const young = ageRange <= "7-8";
  return young ? {
    setup: "Split into two teams. Hit off tee, real bases, keep score.",
    drills: [
      "Before each batter: every fielder points and answers \"Where's it going?\"",
      "THE RULE: coaches say NOTHING during the play — no \"throw it here!\", nothing",
      "After each play: ask \"What did you see?\" — don't correct, let them process",
      "If a kid freezes: \"You got the ball — that's the hard part! Where would it have gone?\"",
    ],
    coachCues: ["\"You guys are running this. Figure it out — that's real baseball.\"", "\"Nobody told you where to throw and you figured it out!\"", "\"What did you see on that play?\""],
    avoidSaying: ["Don't yell instructions during live play", "Don't say \"you should have...\" — ask \"what did you see?\"", "Don't correct mechanics during scrimmage — save it for stations"],
  } : {
    setup: "Two teams, full rules. Pitch from mound or coach pitch depending on level.",
    drills: [
      "Situational play — set up specific game scenarios (runner on 2nd, 1 out, etc.)",
      "Every fielder communicates before the pitch — \"I've got third!\"",
      "Rotate positions every inning — nobody sits",
    ],
    coachCues: ["\"Know the situation before the pitch\"", "\"Talk to each other out there!\"", "\"Good decision — that's baseball IQ\""],
    avoidSaying: ["Don't over-coach during live play", "Let mistakes happen — debrief after the inning, not during"],
  };
}

// ── Helper: write a section with coaching text ──

function writeSection(
  doc: jsPDF,
  y: number,
  title: string,
  timeRange: string,
  guide: StationGuide,
  primaryRgb: [number, number, number],
  secondaryRgb: [number, number, number],
  pageWidth: number,
  subtitle?: string,
): number {
  const margin = 14;
  const maxW = pageWidth - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Check if we need a new page
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 14;
  }

  // Section header
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  doc.text(`${title} — ${timeRange}`, margin, y);
  if (subtitle) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(subtitle, margin + doc.getTextWidth(`${title} — ${timeRange}  `), y);
  }

  // Accent underline
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 1.5, margin + 50, y + 1.5);
  y += 5;

  // Setup
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(80, 80, 80);
  const setupLines = doc.splitTextToSize(`Setup: ${guide.setup}`, maxW);
  doc.text(setupLines, margin, y);
  y += setupLines.length * 3.2 + 1;

  // Drills as bullet points
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  for (const drill of guide.drills) {
    if (y > pageHeight - 15) {
      doc.addPage();
      y = 14;
    }
    const lines = doc.splitTextToSize(`• ${drill}`, maxW - 3);
    doc.text(lines, margin + 2, y);
    y += lines.length * 3.2 + 0.5;
  }
  y += 1;

  // Coach cues in a compact format
  if (y > pageHeight - 20) {
    doc.addPage();
    y = 14;
  }
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  doc.text("SAY THIS:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);
  const cueText = guide.coachCues.join("   ");
  const cueLines = doc.splitTextToSize(cueText, maxW - 20);
  doc.text(cueLines, margin + 20, y);
  y += Math.max(cueLines.length * 3, 3) + 1;

  // Avoid
  doc.setFont("helvetica", "bold");
  doc.setTextColor(180, 60, 60);
  doc.text("AVOID:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140, 100, 100);
  const avoidText = guide.avoidSaying.join("   ");
  const avoidLines = doc.splitTextToSize(avoidText, maxW - 20);
  doc.text(avoidLines, margin + 20, y);
  y += Math.max(avoidLines.length * 3, 3) + 3;

  return y;
}

export async function generatePracticePDF(
  players: Player[],
  practice: PracticeConfig,
  teamName: string,
  logoDataUrl: string | null | undefined,
  colors: TeamColors
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryRgb = hexToRgb(colors.primary) as [number, number, number];
  const secondaryRgb = hexToRgb(colors.secondary) as [number, number, number];

  let y = 10;

  // Pennant logo — centered at top (smaller)
  const pennant = await loadPennant();
  if (pennant) {
    try {
      const logoW = 45;
      const logoH = logoW * (1292 / 2521);
      doc.addImage(pennant, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH);
      y += logoH + 2;
    } catch {
      // skip
    }
  }

  // Team logo (small)
  let titleX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, y - 2, 7, 7);
      titleX = 24;
    } catch {
      // skip
    }
  }

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  const title = `${teamName.toUpperCase()} — PRACTICE PLAN`;
  const titleWidth = doc.getTextWidth(title);
  const centerX = (pageWidth - titleWidth) / 2;
  doc.text(title, logoDataUrl ? Math.max(titleX, centerX) : centerX, y + 4);

  // Accent line
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.8);
  doc.line(20, y + 7, pageWidth - 20, y + 7);

  // Date + meta
  y += 11;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const enabledStations = practice.stations.filter((s) => s.enabled);
  const activeStations = enabledStations.slice(0, practice.stationCount);
  const drillMinutes =
    practice.durationMinutes - practice.warmupMinutes - practice.scrimmageMinutes - 5;
  const perStation = practice.stationCount > 0 ? Math.floor(drillMinutes / practice.stationCount) : 0;

  const summaryLine = `${dateStr}  |  ${practice.durationMinutes} min  |  Ages ${practice.ageRange}  |  ${players.length} players`;
  doc.text(summaryLine, pageWidth / 2, y, { align: "center" });

  const stationSummary = activeStations.map((s) => s.name).join(" / ");
  y += 3.5;
  doc.setFontSize(7.5);
  doc.text(`${practice.warmupMinutes}min Warm-Up / ${stationSummary} / ${practice.scrimmageMinutes > 0 ? practice.scrimmageMinutes + "min Scrimmage" : "No Scrimmage"}`, pageWidth / 2, y, { align: "center" });

  // ── Groups + Roster (compact, side-by-side) ──
  y += 5;
  const groups = splitIntoGroups(players, practice.stationCount);
  const scrimmageTeams = splitIntoGroups(players, 2);

  // Scrimmage teams line
  if (practice.scrimmageMinutes > 0) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryRgb);
    doc.text("SCRIMMAGE TEAM A", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(scrimmageTeams[0].map((p) => p.name).join(", "), 14 + doc.getTextWidth("SCRIMMAGE TEAM A  "), y);
    y += 3.5;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryRgb);
    doc.text("SCRIMMAGE TEAM B", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(scrimmageTeams[1].map((p) => p.name).join(", "), 14 + doc.getTextWidth("SCRIMMAGE TEAM B  "), y);
    y += 5;
  }

  // ── Detailed Sections ──

  // Warm-up
  let clock = 0;
  const warmupGuide = getWarmupGuide(practice.ageRange);
  y = writeSection(doc, y, "WARM-UP", `0:00–0:${String(practice.warmupMinutes).padStart(2, "0")}`, warmupGuide, primaryRgb, secondaryRgb, pageWidth, "(All Together)");
  clock += practice.warmupMinutes;

  // Station sections with group assignments
  for (let i = 0; i < practice.stationCount; i++) {
    const station = activeStations[i] || { name: `Station ${i + 1}` };
    const endMin = clock + perStation;
    const timeRange = `${clock}:00–${endMin}:00`;
    const guide = getStationGuide(station.name, practice.ageRange);

    // Build subtitle showing group assignments for this rotation
    const groupAssignments = groups.map((_, g) => {
      const stIdx = (g + i) % practice.stationCount;
      return `Grp${g + 1}: ${activeStations[stIdx]?.name || "?"}`;
    }).join("  |  ");

    y = writeSection(doc, y, `STATION ${i + 1}: ${station.name.toUpperCase()}`, timeRange, guide, primaryRgb, secondaryRgb, pageWidth, `(${groupAssignments})`);
    clock = endMin;
  }

  // Scrimmage
  if (practice.scrimmageMinutes > 0) {
    clock += 2; // water break
    const endMin = clock + practice.scrimmageMinutes;
    const guide = getScrimmageGuide(practice.ageRange);
    y = writeSection(doc, y, "SCRIMMAGE", `${clock}:00–${endMin}:00`, guide, primaryRgb, secondaryRgb, pageWidth, "(Team A vs Team B)");
  }

  // ── Compact Group Reference Table ──
  if (y > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    y = 14;
  }

  y += 2;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  doc.text("QUICK REFERENCE — GROUPS", 14, y);
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1, 60, y + 1);
  y += 3;

  const maxGroupSize = Math.max(...groups.map((g) => g.length));
  const rosterHeaders = groups.map((_, i) => `GROUP ${i + 1}`);
  const rosterRows: string[][] = [];
  for (let row = 0; row < maxGroupSize; row++) {
    rosterRows.push(groups.map((g) => (g[row] ? g[row].name : "")));
  }

  autoTable(doc, {
    startY: y,
    head: [rosterHeaders],
    body: rosterRows,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
      halign: "center",
      overflow: "visible",
    },
    headStyles: {
      fillColor: primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    bodyStyles: {
      textColor: [60, 60, 60],
      fontSize: 7,
    },
    margin: { left: 14, right: 14 },
  });

  // Absent players
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 20;
  const absent = players.filter((p) => p.absent);
  if (absent.length > 0) {
    y += 2;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Absent: ${absent.map((p) => p.name).join(", ")}`, 14, y);
  }

  return doc;
}
