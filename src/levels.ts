export interface LevelLayout {
    name: string;
    cells: number[][];
    brickCount: number;
}

interface Pattern {
    name: string;
    fill: (row: number, col: number, rows: number, cols: number) => boolean;
}

const PATTERNS: Pattern[] = [
    {
        name: 'The Wall',
        fill: () => true,
    },
    {
        name: 'Pyramid',
        fill: (row, col, rows, cols) => Math.abs(col - (cols - 1) / 2) <= ((row + 1) * cols) / (2 * rows),
    },
    {
        name: 'Checkerboard',
        fill: (row, col) => (row + col) % 2 === 0,
    },
    {
        name: 'Diamond',
        fill: (row, col, rows, cols) =>
            Math.abs(col - (cols - 1) / 2) / (cols / 2) + Math.abs(row - (rows - 1) / 2) / (rows / 2) <= 1.05,
    },
    {
        name: 'Pillars',
        fill: (_row, col) => col % 3 !== 1,
    },
    {
        name: 'Zigzag',
        fill: (row, col) => (col + row) % 4 < 2,
    },
    {
        name: 'Fortress',
        fill: (row, col, rows, cols) =>
            row === 0 ||
            row === rows - 1 ||
            col === 0 ||
            col === cols - 1 ||
            (Math.abs(col - (cols - 1) / 2) < 1.5 && Math.abs(row - (rows - 1) / 2) < 1.5),
    },
    {
        name: 'Waves',
        fill: (row, col, rows, cols) =>
            row <= Math.round((rows - 1) * (0.5 + 0.5 * Math.sin((col / cols) * Math.PI * 2))),
    },
    {
        name: 'Hourglass',
        fill: (row, col, rows, cols) =>
            Math.abs(col - (cols - 1) / 2) <= cols / 2 - (Math.min(row, rows - 1 - row) * cols) / rows,
    },
];

export function rowsForLevel(level: number): number {
    return Math.min(2 + Math.floor((level - 1) / 2), 14);
}

function hitPointsFor(level: number, row: number, rows: number): number {
    const armoredRows = Math.min(rows - 1, Math.floor((level - 1) / 4));
    if (level >= 15 && row === 0) return 3;
    if (row < armoredRows) return 2;
    return 1;
}

export function buildLevel(level: number, cols: number): LevelLayout {
    const rows = rowsForLevel(level);
    let pattern = PATTERNS[(level - 1) % PATTERNS.length];

    const shape = (p: Pattern) =>
        Array.from({ length: rows }, (_, row) =>
            Array.from({ length: cols }, (_, col) => (p.fill(row, col, rows, cols) ? 1 : 0)),
        );

    let mask = shape(pattern);
    const filled = mask.flat().filter(Boolean).length;
    if (filled < cols) {
        pattern = PATTERNS[0];
        mask = shape(pattern);
    }

    const cells = mask.map((cellsInRow, row) =>
        cellsInRow.map(cell => (cell ? hitPointsFor(level, row, rows) : 0)),
    );

    return {
        name: pattern.name,
        cells,
        brickCount: cells.flat().filter(Boolean).length,
    };
}
