import QRCode from "qrcode";

type QRCodeSymbol = {
  modules: {
    size: number;
    data: Uint8Array | number[];
    get?: (row: number, col: number) => number | boolean;
  };
};

interface RoundedQROptions {
  dark?: string;
  light?: string;
  margin?: number;
  moduleGap?: number;
  moduleRadius?: number;
}

export async function generateQRDataURL(text: string): Promise<string> {
  const svg = await generateQRSVG(text);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function generateQRSVG(
  text: string,
  options: RoundedQROptions = {},
): Promise<string> {
  const qr = (
    QRCode as unknown as {
      create: (text: string, options: Record<string, unknown>) => QRCodeSymbol;
    }
  ).create(text, {
    errorCorrectionLevel: "H",
  });
  const { modules } = qr;
  const size = modules.size;
  const margin = options.margin ?? 3;
  const dark = options.dark ?? "#111827";
  const light = options.light ?? "#ffffff";
  const moduleGap = options.moduleGap ?? 0.12;
  const moduleRadius = options.moduleRadius ?? 0.32;
  const viewBoxSize = size + margin * 2;
  const moduleSize = 1 - moduleGap;
  const moduleOffset = moduleGap / 2;

  const isDark = (row: number, col: number) => {
    if (modules.get) return Boolean(modules.get(row, col));
    return Boolean(modules.data[row * size + col]);
  };
  const isFinderArea = (row: number, col: number) => {
    const inTop = row >= 0 && row <= 6;
    const inLeft = col >= 0 && col <= 6;
    const inRight = col >= size - 7 && col <= size - 1;
    const inBottom = row >= size - 7 && row <= size - 1;

    return (inTop && inLeft) || (inTop && inRight) || (inBottom && inLeft);
  };
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    radius: number,
  ) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${fill}"/>`;
  const finder = (x: number, y: number) =>
    [
      rect(x, y, 7, 7, dark, 1.6),
      rect(x + 1, y + 1, 5, 5, light, 1.15),
      rect(x + 2, y + 2, 3, 3, dark, 0.8),
    ].join("");

  const modulesSvg: string[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isDark(row, col) || isFinderArea(row, col)) continue;
      modulesSvg.push(
        rect(
          margin + col + moduleOffset,
          margin + row + moduleOffset,
          moduleSize,
          moduleSize,
          dark,
          moduleRadius,
        ),
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="100%" height="100%" role="img" aria-label="QR code">`,
    rect(0, 0, viewBoxSize, viewBoxSize, light, 2.5),
    finder(margin, margin),
    finder(margin + size - 7, margin),
    finder(margin, margin + size - 7),
    modulesSvg.join(""),
    "</svg>",
  ].join("");
}
