import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Player, GameSheet } from "./types";
import { TeamColors, hexToRgb } from "./colors";

/**
 * Load the pennant logo as a data URL for embedding in the PDF.
 * Called once and cached.
 */
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

export async function generatePDF(
  players: Player[],
  sheet: GameSheet,
  teamName: string,
  logoDataUrl?: string | null,
  innings: number = 6,
  colors?: TeamColors
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 10;

  // Pennant logo — centered at top, maintaining aspect ratio (2521:1292 ≈ 1.95:1)
  const pennant = await loadPennant();
  if (pennant) {
    try {
      const logoW = 60;
      const logoH = logoW * (1292 / 2521); // exact pixel ratio: height = width × 0.5125
      doc.addImage(pennant, "PNG", (pageWidth - logoW) / 2, startY, logoW, logoH);
      startY += logoH + 3;
    } catch {
      // skip
    }
  }

  // Team logo (small, next to title)
  let titleX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, startY - 2, 8, 8);
      titleX = 25;
    } catch {
      // skip
    }
  }

  const primaryRgb = colors ? hexToRgb(colors.primary) : [27, 42, 78] as [number, number, number];
  const secondaryRgb = colors ? hexToRgb(colors.secondary) : [230, 160, 0] as [number, number, number];

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primaryRgb);
  const title = `${teamName.toUpperCase()} — DEFENSIVE POSITIONS`;
  const titleWidth = doc.getTextWidth(title);
  const centerX = (pageWidth - titleWidth) / 2;
  doc.text(title, logoDataUrl ? Math.max(titleX, centerX) : centerX, startY + 5);

  // Accent line using team secondary color
  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.8);
  doc.line(20, startY + 9, pageWidth - 20, startY + 9);

  // Table
  const HEADER_BG: [number, number, number] = primaryRgb as [number, number, number];

  const headers = [
    "PLAYER",
    ...Array.from({ length: innings }, (_, i) => `${i + 1}`),
  ];

  const rows = present.map((player) => {
    const cells = Array.from({ length: innings }, (_, inn) => {
      const a = sheet[inn][player.id];
      if (a === "Rover") return "ROV";
      if (a === "Bench") return "BENCH";
      return a || "—";
    });
    const star = player.recognized ? "" : "\u2606 ";
    return [star + player.name.toUpperCase(), ...cells];
  });

  autoTable(doc, {
    startY: startY + 13,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: {
      fontSize: 11,
      cellPadding: 3,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      overflow: "visible",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 10,
    },
    bodyStyles: {
      halign: "center",
      textColor: [60, 60, 60],
      fontStyle: "bold",
      fontSize: 11,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 35 },
    },
    didParseCell(data) {
      if (data.section === "head" && data.column.index === 0) {
        data.cell.styles.halign = "left";
      }
      if (data.section === "body" && data.column.index >= 1) {
        if (String(data.cell.raw) === "BENCH") {
          data.cell.styles.fillColor = [210, 210, 210];
          data.cell.styles.textColor = [80, 80, 80];
        }
      }
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
  });

  // Absent note
  const absent = players.filter((p) => p.absent);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tableEnd = ((doc as any).lastAutoTable?.finalY as number) ?? 120;
  if (absent.length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Absent: ${absent.map((p) => p.name).join(", ")}`, 14, tableEnd + 6);
    tableEnd += 10;
  }

  // Scorecard
  const scoreHeaders = [
    "TEAM",
    ...Array.from({ length: innings }, (_, i) => `${i + 1}`),
    "FINAL",
  ];
  const scoreRows = [[""], [""]].map((row) => [
    ...row,
    ...Array.from({ length: innings + 1 }, () => ""),
  ]);

  autoTable(doc, {
    startY: tableEnd + 6,
    head: [scoreHeaders],
    body: scoreRows,
    theme: "grid",
    styles: {
      fontSize: 11,
      cellPadding: 3,
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 10,
    },
    bodyStyles: {
      halign: "center",
      textColor: [60, 60, 60],
      fontSize: 11,
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 35 },
      [innings + 1]: { fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section === "head" && data.column.index === 0) {
        data.cell.styles.halign = "left";
      }
    },
  });

  return doc;
}
