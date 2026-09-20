import { toRasterDataUrl } from "./pdf";
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
  // Absent players are left off entirely. They were previously listed and
  // shaded grey, on the theory that parents needed to see whose song to skip
  // -- but the sheet is read live at the plate, where an absent kid's song is
  // simply never cued. Dropping them also frees row height, which the
  // single-page fit below spends on the players actually batting.
  const ordered = players
    .filter((p) => !p.absent)
    .sort((a, b) => a.rank - b.rank);
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
      const raster = await toRasterDataUrl(logoDataUrl);
      if (raster) doc.addImage(raster.data, raster.format, 14, startY - 2, 8, 8);
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

  // Single page, always. The old arithmetic divided the available height by
  // the row count but clamped at a 6mm floor, so a large roster simply
  // overflowed onto page two. Row height is also not the only thing that sets
  // a row's real height -- padding and font do too -- so the fit is measured
  // rather than predicted: render the table into a scratch document and ask
  // jsPDF how many pages it took.
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableTop = startY + 17;
  const bottomMargin = 8;
  const headerRowH = 7;

  const columnStyles = {
    0: { halign: "center" as const, cellWidth: 14, fontStyle: "bold" as const },
    1: { halign: "left" as const, cellWidth: 50, fontStyle: "bold" as const },
    2: { halign: "left" as const },
  };

  type Fit = { rowH: number; fontSize: number; padV: number };
  const buildOptions = (fit: Fit) => ({
    startY: tableTop,
    head: [headers],
    body: rows,
    theme: "grid" as const,
    margin: { bottom: bottomMargin },
    styles: {
      fontSize: fit.fontSize,
      cellPadding: { top: fit.padV, right: 3, bottom: fit.padV, left: 3 },
      lineColor: [180, 180, 180] as [number, number, number],
      lineWidth: 0.3,
      minCellHeight: fit.rowH,
      valign: "middle" as const,
      overflow: "ellipsize" as const,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold" as const,
      halign: "left" as const,
      fontSize: 10,
      minCellHeight: headerRowH,
    },
    bodyStyles: {
      textColor: [60, 60, 60] as [number, number, number],
      fontSize: fit.fontSize,
    },
    columnStyles,
  });

  // Generous first, tightest last. Whichever fits first is the one used, so a
  // normal roster still prints at full size and only a big one gets squeezed.
  const candidates: Fit[] = [];
  for (const rowH of [13, 11, 10, 9, 8, 7, 6, 5, 4.5, 4, 3.5, 3]) {
    const fontSize = rowH >= 10 ? 11 : rowH >= 8 ? 9 : rowH >= 6 ? 8 : rowH >= 4.5 ? 7 : 6;
    const padV = rowH >= 8 ? 1.5 : rowH >= 5 ? 1 : 0.5;
    candidates.push({ rowH, fontSize, padV });
  }

  const fitsOnOnePage = (fit: Fit): boolean => {
    const probe = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
    autoTable(probe, buildOptions(fit));
    return probe.getNumberOfPages() === 1;
  };

  const chosen = candidates.find(fitsOnOnePage) ?? candidates[candidates.length - 1];
  if (chosen === candidates[candidates.length - 1] && !fitsOnOnePage(chosen)) {
    console.warn(
      `[walk-up] ${ordered.length} players will not fit on one page even at the smallest size`,
    );
  }

  autoTable(doc, {
    ...buildOptions(chosen),
    didParseCell(data) {
      if (data.section !== "body") return;
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

  // Last-resort guarantee. Nothing above should produce a second page, but the
  // promise to the coach is one sheet -- an extra page is worse than a warning.
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }

  return doc;
}
