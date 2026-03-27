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

export async function generatePracticePDF(
  players: Player[],
  practice: PracticeConfig,
  teamName: string,
  logoDataUrl: string | null | undefined,
  colors: TeamColors
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const primaryRgb = hexToRgb(colors.primary);
  const secondaryRgb = hexToRgb(colors.secondary);

  let y = 10;

  // Pennant logo — centered at top
  const pennant = await loadPennant();
  if (pennant) {
    try {
      const logoW = 55;
      const logoH = logoW * (1292 / 2521);
      doc.addImage(pennant, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH);
      y += logoH + 3;
    } catch {
      // skip
    }
  }

  // Team logo (small)
  let titleX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, y - 2, 8, 8);
      titleX = 25;
    } catch {
      // skip
    }
  }

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  const title = `${teamName.toUpperCase()} — PRACTICE PLAN`;
  const titleWidth = doc.getTextWidth(title);
  const centerX = (pageWidth - titleWidth) / 2;
  doc.text(title, logoDataUrl ? Math.max(titleX, centerX) : centerX, y + 5);

  // Accent line using secondary color
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(1);
  doc.line(20, y + 9, pageWidth - 20, y + 9);

  // Date + meta line
  y += 14;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  doc.text(
    `${dateStr}  |  ${practice.durationMinutes} min  |  Ages ${practice.ageRange}  |  ${players.length} players`,
    pageWidth / 2,
    y,
    { align: "center" }
  );

  // ── Schedule Overview ──
  y += 6;
  const enabledStations = practice.stations.filter((s) => s.enabled);
  const activeStations = enabledStations.slice(0, practice.stationCount);
  const drillMinutes =
    practice.durationMinutes -
    practice.warmupMinutes -
    practice.scrimmageMinutes -
    5;
  const perStation =
    practice.stationCount > 0
      ? Math.floor(drillMinutes / practice.stationCount)
      : 0;

  // Build schedule rows
  interface ScheduleBlock {
    time: string;
    activity: string;
    duration: string;
    detail: string;
  }

  const blocks: ScheduleBlock[] = [];
  let clock = 0;

  const fmtTime = (min: number) => `${min}'`;

  // Warm-up
  blocks.push({
    time: fmtTime(clock),
    activity: "WARM-UP",
    duration: `${practice.warmupMinutes} min`,
    detail: "Dynamic stretching, throwing partners, light jogging",
  });
  clock += practice.warmupMinutes;

  // Stations
  for (let i = 0; i < practice.stationCount; i++) {
    const station = activeStations[i] || { name: `Station ${i + 1}` };
    blocks.push({
      time: fmtTime(clock),
      activity: `STATION ${i + 1}: ${station.name.toUpperCase()}`,
      duration: `${perStation} min`,
      detail: i < practice.stationCount - 1 ? "Groups rotate after time" : "Last rotation",
    });
    clock += perStation;
  }

  // Water break
  blocks.push({
    time: fmtTime(clock),
    activity: "WATER BREAK",
    duration: "2 min",
    detail: "",
  });
  clock += 2;

  // Scrimmage
  if (practice.scrimmageMinutes > 0) {
    blocks.push({
      time: fmtTime(clock),
      activity: "SCRIMMAGE",
      duration: `${practice.scrimmageMinutes} min`,
      detail: "Intra-squad game, focus on game situations",
    });
    clock += practice.scrimmageMinutes;
  }

  // Cool-down
  blocks.push({
    time: fmtTime(clock),
    activity: "COOL-DOWN / WRAP-UP",
    duration: "3 min",
    detail: "Team huddle, stretching, reminders",
  });

  // Schedule table
  autoTable(doc, {
    startY: y,
    head: [["TIME", "ACTIVITY", "DURATION", "NOTES"]],
    body: blocks.map((b) => [b.time, b.activity, b.duration, b.detail]),
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      overflow: "visible",
    },
    headStyles: {
      fillColor: primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 8,
    },
    bodyStyles: {
      textColor: [50, 50, 50],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 16, fontStyle: "bold", textColor: primaryRgb },
      1: { fontStyle: "bold", cellWidth: 65 },
      2: { halign: "center", cellWidth: 22 },
      3: { fontSize: 8, textColor: [120, 120, 120] },
    },
    didParseCell(data) {
      if (data.section === "body") {
        const activity = String(blocks[data.row.index]?.activity || "");
        if (activity === "SCRIMMAGE") {
          data.cell.styles.fillColor = secondaryRgb;
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        } else if (activity === "WATER BREAK") {
          data.cell.styles.fillColor = [230, 245, 255];
        } else if (activity.startsWith("WARM-UP") || activity.startsWith("COOL-DOWN")) {
          data.cell.styles.fillColor = [245, 245, 245];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 50;

  // ── Station Groups ──
  y += 4;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  doc.text("STATION GROUPS", 14, y);

  // Accent underline
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.6);
  doc.line(14, y + 1.5, 60, y + 1.5);
  y += 4;

  const groups = splitIntoGroups(players, practice.stationCount);

  // Build rotation matrix: rows = rotation, cols = groups
  // Each rotation, groups shift which station they're at
  const rotationHeaders = ["ROTATION", ...groups.map((_, i) => `GROUP ${i + 1}`)];
  const rotationRows: string[][] = [];

  for (let rot = 0; rot < practice.stationCount; rot++) {
    const row: string[] = [`${rot + 1} (${fmtTime(practice.warmupMinutes + rot * perStation)})`];
    for (let g = 0; g < groups.length; g++) {
      const stationIdx = (g + rot) % practice.stationCount;
      const station = activeStations[stationIdx] || { name: `Station ${stationIdx + 1}` };
      row.push(station.name);
    }
    rotationRows.push(row);
  }

  autoTable(doc, {
    startY: y,
    head: [rotationHeaders],
    body: rotationRows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      halign: "center",
      overflow: "visible",
    },
    headStyles: {
      fillColor: primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: "bold", textColor: primaryRgb },
    },
    didParseCell(data) {
      // Alternate station colors slightly
      if (data.section === "body" && data.column.index > 0) {
        const stationIdx =
          ((data.column.index - 1) + data.row.index) % practice.stationCount;
        if (stationIdx % 2 === 0) {
          data.cell.styles.fillColor = [245, 248, 255];
        }
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 30;

  // ── Player Roster by Group ──
  y += 4;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  doc.text("PLAYERS BY GROUP", 14, y);
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.6);
  doc.line(14, y + 1.5, 62, y + 1.5);
  y += 4;

  // Determine max group size for equal rows
  const maxGroupSize = Math.max(...groups.map((g) => g.length));
  const rosterHeaders = groups.map((_, i) => `GROUP ${i + 1}`);
  const rosterRows: string[][] = [];
  for (let row = 0; row < maxGroupSize; row++) {
    rosterRows.push(
      groups.map((g) => (g[row] ? g[row].name.toUpperCase() : ""))
    );
  }

  autoTable(doc, {
    startY: y,
    head: [rosterHeaders],
    body: rosterRows,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      halign: "center",
      overflow: "visible",
    },
    headStyles: {
      fillColor: primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontStyle: "bold",
      textColor: [50, 50, 50],
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY as number) ?? y + 30;

  // Absent players
  const absent = players.filter((p) => p.absent);
  if (absent.length > 0) {
    y += 3;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Absent: ${absent.map((p) => p.name).join(", ")}`,
      14,
      y
    );
  }

  return doc;
}
