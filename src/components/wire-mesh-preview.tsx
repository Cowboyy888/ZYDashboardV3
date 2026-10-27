import { calculateWireMesh, type WireMeshInput } from '@/lib/domain/wire-mesh';

function labelStride(intervals: number) {
  return Math.max(1, Math.ceil(intervals / 12));
}

/** SVG is shared by the interactive preview and printable document. */
export function wireMeshSvg(input: WireMeshInput): string {
  const result = calculateWireMesh(input);
  if (result.errors.length || !result.lengthWireCount || !result.widthWireCount) return '';
  const left = 130;
  const top = 80;
  const width = 790;
  const height = 360;
  const lengthIntervals = result.lengthWireCount - 1;
  const widthIntervals = result.widthWireCount - 1;
  const lengthStride = labelStride(lengthIntervals);
  const widthStride = labelStride(widthIntervals);
  const vertical = Array.from({ length: result.lengthWireCount }, (_, index) => {
    const x = left + (width * index) / lengthIntervals;
    return `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" class="wire"/>`;
  }).join('');
  const horizontal = Array.from({ length: result.widthWireCount }, (_, index) => {
    const y = top + (height * index) / widthIntervals;
    return `<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" class="wire"/>`;
  }).join('');
  const topLabels = Array.from({ length: lengthIntervals }, (_, index) =>
    index % lengthStride === 0
      ? `<text x="${left + (width * (index + 0.5)) / lengthIntervals}" y="${top - 19}" class="spacing">${input.lengthSpacingMm}</text>`
      : '',
  ).join('');
  const sideLabels = Array.from({ length: widthIntervals }, (_, index) =>
    index % widthStride === 0
      ? `<text x="${left - 13}" y="${top + (height * (index + 0.5)) / widthIntervals + 3}" class="spacing side">${input.widthSpacingMm}</text>`
      : '',
  ).join('');
  return `<style>
    .wire{stroke:#344454;stroke-width:1}.outline{fill:none;stroke:#111827;stroke-width:2}
    .dimension{stroke:#e31e24;stroke-width:1.5}.spacing{font:11px Arial,sans-serif;fill:#334155;text-anchor:middle}.side{text-anchor:end}
    .dimension-text{font:600 14px Arial,sans-serif;fill:#9f151a;text-anchor:middle}
  </style>
  <line x1="${left}" y1="${top - 45}" x2="${left + width}" y2="${top - 45}" class="dimension"/>
  <line x1="${left}" y1="${top - 51}" x2="${left}" y2="${top - 39}" class="dimension"/><line x1="${left + width}" y1="${top - 51}" x2="${left + width}" y2="${top - 39}" class="dimension"/>
  <text x="${left + width / 2}" y="${top - 54}" class="dimension-text">Length ${input.sheetLengthMm} mm</text>
  <line x1="${left - 65}" y1="${top}" x2="${left - 65}" y2="${top + height}" class="dimension"/>
  <line x1="${left - 71}" y1="${top}" x2="${left - 59}" y2="${top}" class="dimension"/><line x1="${left - 71}" y1="${top + height}" x2="${left - 59}" y2="${top + height}" class="dimension"/>
  <text x="${left - 82}" y="${top + height / 2}" class="dimension-text" transform="rotate(-90 ${left - 82} ${top + height / 2})">Width ${input.sheetWidthMm} mm</text>
  <rect x="${left}" y="${top}" width="${width}" height="${height}" class="outline"/>${vertical}${horizontal}${topLabels}${sideLabels}`;
}

export function WireMeshPreview({ input }: { input: WireMeshInput }) {
  const result = calculateWireMesh(input);
  if (result.errors.length) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {result.errors.map((error) => (
          <p key={error}>{error}</p>
        ))}
      </div>
    );
  }
  return (
    <svg
      viewBox="0 0 1000 480"
      role="img"
      aria-label="Wire mesh drawing"
      className="h-auto w-full rounded-md border bg-white"
      dangerouslySetInnerHTML={{ __html: wireMeshSvg(input) }}
    />
  );
}
