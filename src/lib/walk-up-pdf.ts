import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Player } from "./types";
import { TeamColors, hexToRgb } from "./colors";

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

/**
 * Printable walk-up song sheet — same header style as the Defensive
 * Positions Roster. One row per present player in batting order, with a
 * pre-filled song box (current pick or auto-suggested default) and room
 * to write in changes when collecting from parents.
 */
export async function generateWalkUpPDF(
  players: Player[],
  teamName: string,
  logoDataUrl?: string | null,
  colors?: TeamColors,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 10;

  const pennant = await loadPennant();
  if (pennant) {
    try {
      const logoW = 60;
      const logoH = logoW * (1292 / 2521);
      doc.addImage(pennant, "PNG", (pageWidth - logoW) / 2, startY, logoW, logoH);
      startY += logoH + 3;
    } catch {
      // skip
    }
  }

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
  const title = `${teamName.toUpperCase()} — WALK-UP MUSIC`;
  const titleWidth = doc.getTextWidth(title);
  const centerX = (pageWidth - titleWidth) / 2;
  doc.text(title, logoDataUrl ? Math.max(titleX, centerX) : centerX, startY + 5);

  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.8);
  doc.line(20, startY + 9, pageWidth - 20, startY + 9);

  // Subtitle / instructions
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Songs in italics are auto-suggested. Confirm with each player or write in their pick.",
    pageWidth / 2,
    startY + 14,
    { align: "center" },
  );

  const HEADER_BG: [number, number, number] = primaryRgb as [number, number, number];

  const headers = ["#", "PLAYER", "WALK-UP SONG"];
  const rows = present.map((p, i) => {
    const song = p.walkOnSong;
    let cell = "";
    if (song) {
      const tag = song.isDefaultPick ? "(suggested) " : "";
      cell = `${tag}${song.title} — ${song.artist}`;
    }
    return [String(i + 1), p.name, cell];
  });

  // Single-page constraint: pick a row height that lets all present players
  // (and a small buffer) fit between the subtitle and the page bottom margin.
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableTop = startY + 18;
  const bottomMargin = 12;
  const headerRowH = 8;
  const availableForBody = pageHeight - tableTop - bottomMargin - headerRowH;
  const idealRowH = 13;
  const minRowH = 7;
  const fitRowH = Math.max(minRowH, Math.min(idealRowH, availableForBody / Math.max(1, present.length)));
  const fontSize = fitRowH < 9 ? 9 : 11;

  autoTable(doc, {
    startY: tableTop,
    head: [headers],
    body: rows,
    theme: "grid",
    styles: {
      fontSize,
      cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 },
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
      minCellHeight: fitRowH,
      valign: "middle",
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
      fontSize: 10,
      minCellHeight: headerRowH,
    },
    bodyStyles: {
      textColor: [60, 60, 60],
      fontSize,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10, fontStyle: "bold" },
      1: { halign: "left", cellWidth: 50, fontStyle: "bold" },
      2: { halign: "left" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index === 2) {
        const raw = String(data.cell.raw || "");
        if (raw.startsWith("(suggested) ")) {
          data.cell.styles.fontStyle = "italic";
          data.cell.styles.textColor = [110, 110, 110];
        } else if (raw) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [40, 40, 40];
        }
      }
    },
  });

  return doc;
}
