import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Player, GameSheet, TOTAL_INNINGS } from "./types";

export function generatePDF(
  players: Player[],
  sheet: GameSheet,
  teamName: string,
  logoDataUrl?: string | null
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);
  const pageWidth = doc.internal.pageSize.getWidth();

  let startY = 18;

  // Logo if provided
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 14, 10, 15, 15);
      startY = 18;
    } catch {
      // Skip logo on error
    }
  }

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(60, 60, 60);
  const title = `${teamName.toUpperCase()} — DEFENSIVE POSITIONS`;
  const titleWidth = doc.getTextWidth(title);
  doc.text(title, (pageWidth - titleWidth) / 2, startY);

  // Orange accent line under title
  doc.setDrawColor(230, 160, 0);
  doc.setLineWidth(0.8);
  doc.line(20, startY + 4, pageWidth - 20, startY + 4);

  // Table
  const headers = [
    "PLAYER",
    ...Array.from({ length: TOTAL_INNINGS }, (_, i) => `INN ${i + 1}`),
  ];

  const rows = present.map((player) => {
    const inningCells = Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
      const assignment = sheet[inn][player.id];
      if (assignment === "Rover") return "ROV";
      if (assignment === "Bench") return "BENCH";
      return assignment || "—";
    });
    return [player.name.toUpperCase(), ...inningCells];
  });

  autoTable(doc, {
    startY: startY + 8,
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
      fillColor: [220, 220, 220],
      textColor: [60, 60, 60],
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
      if (data.section === "body" && data.column.index >= 1) {
        const val = String(data.cell.raw);
        if (val === "BENCH") {
          data.cell.styles.fillColor = [210, 210, 210];
          data.cell.styles.textColor = [80, 80, 80];
        }
      }
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
  });

  // Absent players note
  const absent = players.filter((p) => p.absent);
  if (absent.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableEnd = ((doc as any).lastAutoTable?.finalY as number) ?? 120;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Absent: ${absent.map((p) => p.name).join(", ")}`,
      14,
      tableEnd + 6
    );
  }

  return doc;
}
