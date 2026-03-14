import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Player, GameSheet, POSITION_PRIORITY, TOTAL_INNINGS } from "./types";

export function generatePDF(
  players: Player[],
  sheet: GameSheet,
  date: string
): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  const present = players.filter((p) => !p.absent).sort((a, b) => a.rank - b.rank);

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Who's On First — Game Sheet", 14, 15);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${date}`, 14, 22);
  doc.text(`Players: ${present.length}`, 100, 22);

  // Main table: rows = players, columns = innings
  const headers = [
    "Rank",
    "Player",
    ...Array.from({ length: TOTAL_INNINGS }, (_, i) => `Inn ${i + 1}`),
  ];

  const rows = present.map((player) => {
    const inningCells = Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
      const assignment = sheet[inn][player.id];
      return assignment || "—";
    });
    return [`#${player.rank}`, player.name, ...inningCells];
  });

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [0, 45, 98], // dark navy
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
      halign: "center",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 12 },
      1: { halign: "left", cellWidth: 35 },
    },
    didParseCell(data) {
      if (data.section === "body" && data.column.index >= 2) {
        const val = String(data.cell.raw);
        if (val === "Bench") {
          data.cell.styles.fillColor = [230, 230, 230];
          data.cell.styles.textColor = [120, 120, 120];
          data.cell.styles.fontStyle = "italic";
        } else if (["RF", "LF", "Rover", "CF"].includes(val)) {
          data.cell.styles.fillColor = [220, 237, 200]; // light green
        } else if (["1B", "P"].includes(val)) {
          data.cell.styles.fillColor = [255, 243, 205]; // light gold
        }
      }
    },
  });

  // Position summary table: rows = positions, columns = innings
  const posHeaders = [
    "Position",
    ...Array.from({ length: TOTAL_INNINGS }, (_, i) => `Inn ${i + 1}`),
  ];

  const posRows = POSITION_PRIORITY.map((pos) => {
    const inningCells = Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
      const player = present.find((p) => sheet[inn][p.id] === pos);
      return player ? player.name : "—";
    });
    return [pos, ...inningCells];
  });

  // Add bench row
  const benchRow = [
    "Bench",
    ...Array.from({ length: TOTAL_INNINGS }, (_, inn) => {
      const benched = present.filter((p) => sheet[inn][p.id] === "Bench");
      return benched.map((p) => p.name).join(", ") || "—";
    }),
  ];
  posRows.push(benchRow);

  // Get the Y position after the first table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const firstTableEnd = ((doc as any).lastAutoTable?.finalY as number) ?? 90;

  autoTable(doc, {
    startY: firstTableEnd + 10,
    head: [posHeaders],
    body: posRows,
    theme: "grid",
    headStyles: {
      fillColor: [0, 45, 98],
      textColor: 255,
      fontStyle: "bold",
      halign: "center",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 20, fontStyle: "bold" },
    },
    didParseCell(data) {
      if (data.section === "body" && data.row.index === posRows.length - 1) {
        data.cell.styles.fillColor = [230, 230, 230];
        data.cell.styles.fontStyle = "italic";
        data.cell.styles.fontSize = 7;
      }
    },
  });

  return doc;
}
