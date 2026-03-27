/**
 * Extract dominant colors from an image data URL using canvas pixel sampling.
 * Returns [primary, secondary] as hex strings.
 */
export interface TeamColors {
  primary: string;   // darkest dominant color (headers, text)
  secondary: string; // brightest dominant color (accents, highlights)
}

const DEFAULT_COLORS: TeamColors = {
  primary: "#1B2A4E",   // navy (existing default)
  secondary: "#E6A000", // orange accent
};

export function extractColorsFromDataUrl(dataUrl: string | null): Promise<TeamColors> {
  if (!dataUrl) return Promise.resolve(DEFAULT_COLORS);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64; // downsample for speed
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(DEFAULT_COLORS); return; }

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Simple k-means-ish: bucket colors and find dominant clusters
        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue; // skip transparent

          // Quantize to reduce color space (round to nearest 32)
          const qr = Math.round(r / 32) * 32;
          const qg = Math.round(g / 32) * 32;
          const qb = Math.round(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;

          const bucket = buckets.get(key);
          if (bucket) {
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.count++;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }

        // Sort by frequency, filter out near-white and near-black
        const sorted = [...buckets.values()]
          .filter((b) => {
            const avg = (b.r / b.count + b.g / b.count + b.b / b.count) / 3;
            return avg > 20 && avg < 240; // skip near-black and near-white
          })
          .sort((a, b) => b.count - a.count);

        if (sorted.length === 0) { resolve(DEFAULT_COLORS); return; }

        // Primary = most frequent saturated color (prefer darker)
        const toHex = (b: { r: number; g: number; b: number; count: number }) => {
          const r = Math.round(b.r / b.count);
          const g = Math.round(b.g / b.count);
          const bl = Math.round(b.b / b.count);
          return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
        };

        const luminance = (b: { r: number; g: number; b: number; count: number }) =>
          (b.r / b.count * 0.299 + b.g / b.count * 0.587 + b.b / b.count * 0.114);

        // Find the darkest among the top 5 most frequent for primary
        const topN = sorted.slice(0, Math.min(5, sorted.length));
        const darkest = [...topN].sort((a, b) => luminance(a) - luminance(b))[0];

        // Find a contrasting secondary (brightest or most different from primary)
        const primaryLum = luminance(darkest);
        const secondary = sorted.find((b) => {
          const lum = luminance(b);
          return Math.abs(lum - primaryLum) > 60 && b !== darkest;
        }) || sorted.find((b) => b !== darkest) || darkest;

        resolve({
          primary: toHex(darkest),
          secondary: toHex(secondary),
        });
      } catch {
        resolve(DEFAULT_COLORS);
      }
    };
    img.onerror = () => resolve(DEFAULT_COLORS);
    img.src = dataUrl;
  });
}

/** Convert hex color to RGB tuple for jsPDF */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}
