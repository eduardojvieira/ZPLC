/** The faint grid behind the cells of a rung: a pattern of one cell, repeated over the area of the grid. */
export function LDGridBackground({ rungId, x, y, cellWidth, cellHeight, width, height }: { rungId: string; x: number; y: number; cellWidth: number; cellHeight: number; width: number; height: number }) {
  return (
    <>
      <defs>
        <pattern id={`grid-${rungId}`} width={cellWidth} height={cellHeight} patternUnits="userSpaceOnUse" x={x} y={y}>
          <rect width={cellWidth} height={cellHeight} fill="none" stroke="var(--color-surface-600)" strokeWidth={0.5} />
        </pattern>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#grid-${rungId})`} />
    </>
  );
}
