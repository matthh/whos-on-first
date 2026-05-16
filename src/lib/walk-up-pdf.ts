import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { Player } from "./types";
import { TeamColors, hexToRgb } from "./colors";
import { loadPennant } from "./pdf";

// Fallback playlist URL when the team hasn't set their own — keeps the
// QR code useful on day-1 deploys before any coach has filled in their
// Spotify playlist in settings.
const DEFAULT_WALK_ON_PLAYLIST_URL = "https://open.spotify.com/playlist/4Af5O80Im8VojMKfaYSJj3";

/**
 * Printable walk-up song sheet — single-page handout for parents.
 * One row per present player in batting order with a pre-filled song
 * box (current pick or auto-suggested default) and room to write in
 * changes. Header is intentionally compact so even big rosters fit.
 */
export async function generateWalkUpPDF(
  players: Player[],
  teamName: string,
  logoDataUrl?: string | null,
  colors?: TeamColors,
  matchup?: { opposingTeam: string; isHome: boolean; gameDate?: string },
  walkOnPlaylistUrl?: string | null,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  // Include absent players too — parents need to see whose songs to skip,
  // not have them silently disappear. Absent rows are shaded grey below.
  const ordered = [...players].sort((a, b) => a.rank - b.rank);
  const pageWidth = doc.internal.pageSize.getWidth();

  // Compact header so the table can claim almost the entire page.
  let startY = 10;

  // Pennant logo — centered at top, matches the lineup printout. Capture
  // its vertical midline so the QR code on the right can align to it.
  let pennantMidY: number | null = null;
  const pennant = await loadPennant();
  if (pennant) {
    try {
      const logoW = 60;
      const logoH = logoW * (1292 / 2521); // exact pixel ratio: height = width × 0.5125
      doc.addImage(pennant, "PNG", (pageWidth - logoW) / 2, startY, logoW, logoH);
      pennantMidY = startY + logoH / 2;
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
  const us = teamName.toUpperCase();
  const opp = matchup?.opposingTeam.trim().toUpperCase() ?? "";
  const matchupLabel = opp
    ? matchup!.isHome
      ? `${opp} AT ${us}`
      : `${us} AT ${opp}`
    : us;
  const dateLabel = (() => {
    const iso = matchup?.gameDate;
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    if (!y || !m || !d) return "";
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y.slice(-2)}`;
  })();
  const title = opp && dateLabel
    ? `${matchupLabel} ${dateLabel} - WALK-ON MUSIC`
    : `${matchupLabel} - WALK-ON MUSIC`;
  const titleWidth = doc.getTextWidth(title);
  const centerX = (pageWidth - titleWidth) / 2;
  doc.text(title, logoDataUrl ? Math.max(titleX, centerX) : centerX, startY + 5);

  doc.setDrawColor(...secondaryRgb);
  doc.setLineWidth(0.8);
  doc.line(20, startY + 9, pageWidth - 20, startY + 9);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text(
    "Songs in italics are auto-suggested. Confirm with each player or write in their pick.",
    pageWidth / 2,
    startY + 13,
    { align: "center" },
  );

  // Spotify-playlist QR — top-right, vertically centered on the pennant
  // logo's midline so the page has a tidy balanced header (pennant in
  // the middle, QR on the right edge). Falls back to the page top if
  // the pennant didn't load.
  try {
    const playlistUrl = walkOnPlaylistUrl || DEFAULT_WALK_ON_PLAYLIST_URL;
    const qrDataUrl = await QRCode.toDataURL(playlistUrl, {
      margin: 1,
      width: 200,
      color: { dark: "#000000", light: "#ffffff" },
    });
    const qrSize = 24; // mm
    const qrX = pageWidth - qrSize - 10;
    const qrCenter = pennantMidY ?? 22;
    const qrY = qrCenter - qrSize / 2;
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(110, 110, 110);
    doc.text("Spotify playlist", qrX + qrSize / 2, qrY + qrSize + 3, { align: "center" });
  } catch {
    // QR is decorative; skip if generation fails.
  }

  const HEADER_BG: [number, number, number] = primaryRgb as [number, number, number];

  const headers = ["#", "PLAYER", "WALK-UP SONG"];
  const rows = ordered.map((p, i) => {
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
  // Fall back to smaller font if we have a huge roster.
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableTop = startY + 17;
  const bottomMargin = 8;
  const headerRowH = 7;
  const availableForBody = pageHeight - tableTop - bottomMargin - headerRowH;
  const idealRowH = 13;
  const minRowH = 6;
  const fitRowH = Math.max(minRowH, Math.min(idealRowH, availableForBody / Math.max(1, ordered.length)));
  const fontSize = fitRowH < 8 ? 8 : fitRowH < 10 ? 9 : 11;

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
      0: { halign: "center", cellWidth: 14, fontStyle: "bold" },
      1: { halign: "left", cellWidth: 50, fontStyle: "bold" },
      2: { halign: "left" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      const player = ordered[data.row.index];
      if (player?.absent) {
        // Whole row shaded medium grey — parent at-a-glance "skip this song".
        data.cell.styles.fillColor = [200, 200, 200];
        data.cell.styles.textColor = [110, 110, 110];
        return;
      }
      if (data.column.index === 2) {
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
