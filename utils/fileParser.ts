import * as XLSX from 'xlsx';
import type { LabRow } from '../types';

interface ParsedLab {
    date: Date;
    ldh?: number;
    creatinine?: number;
    platelets?: number;
}

export interface FileParseResult {
    imported: LabRow[];
    missingValues: number;
    outOfRange: number;
    complete: number;
    error?: string;
    needsTransplantDate?: boolean;
}

// Fuzzy column matching
const matchColumn = (headers: string[], possibleNames: string[]): number => {
    const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());
    const normalizedPossible = possibleNames.map(n => n.toLowerCase().trim());

    for (const possible of normalizedPossible) {
        const index = normalizedHeaders.findIndex(h => h.includes(possible) || possible.includes(h));
        if (index !== -1) return index;
    }
    return -1;
};

// Detect date format across entire dataset
const detectDateFormat = (data: any[][]): 'US' | 'INTL' | 'UNKNOWN' => {
    for (const row of data) {
        for (const cell of row) {
            if (!cell || typeof cell !== 'string') continue;

            const cellStr = String(cell).trim();
            const match = cellStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);

            if (match) {
                const first = parseInt(match[1]);
                const second = parseInt(match[2]);

                // If first > 12, must be DD/MM (international)
                if (first > 12) return 'INTL';

                // If second > 12, must be MM/DD (US)
                if (second > 12) return 'US';
            }
        }
    }

    // If no definitive dates found, default to US
    return 'US';
};

// Parse various date formats (US, international, timestamps, etc.)
const parseDate = (value: any, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): Date | null => {
    if (!value) return null;

    // Handle Excel serial dates
    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        return new Date(date.y, date.m - 1, date.d);
    }

    // Handle Date objects
    if (value instanceof Date) return value;

    // Handle string dates
    if (typeof value === 'string') {
        // Strip time if present (keep only date part)
        let dateStr = value.trim();

        // If string contains time (has colon), extract just the date portion
        if (dateStr.includes(':')) {
            // Handle formats like "2024-03-15 14:30:00" or "03/15/2024 2:30 PM"
            dateStr = dateStr.split(/\s+/)[0]; // Take first part before space
        }

        // DON'T use JavaScript's default parser for bare numbers or single decimals
        // Only use it for spelled-out dates (like "March 15, 2024")
        const hasDateSeparators = dateStr.includes('/') || dateStr.includes('-');
        const isJustANumber = /^\d+(\.\d+)?$/.test(dateStr); // Matches "250", "0.9", "150", etc.

        if (!hasDateSeparators && !isJustANumber) {
            // Only try parsing if it doesn't look like a bare number
            let parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) return parsed;
        }

        // Try various formats manually
        // Format: DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY or MM-DD-YYYY
        const dateMatch = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
        if (dateMatch) {
            const first = parseInt(dateMatch[1]);
            const second = parseInt(dateMatch[2]);
            const year = parseInt(dateMatch[3]);

            let parsed: Date;
            // Determine if it's DD/MM or MM/DD based on formatHint
            if (formatHint === 'INTL') {
                // International: DD/MM/YYYY
                parsed = new Date(year, second - 1, first);
                if (!isNaN(parsed.getTime())) return parsed;
            } else {
                // US (default): MM/DD/YYYY
                parsed = new Date(year, first - 1, second);
                if (!isNaN(parsed.getTime())) return parsed;
            }
        }

        // Format: YYYY-MM-DD or YYYY/MM/DD (ISO - always unambiguous)
        const isoMatch = dateStr.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (isoMatch) {
            const year = parseInt(isoMatch[1]);
            const month = parseInt(isoMatch[2]);
            const day = parseInt(isoMatch[3]);
            const parsed = new Date(year, month - 1, day);
            if (!isNaN(parsed.getTime())) return parsed;
        }
    }

    return null;
};

// Calculate days from transplant
const calculateDaysFromTransplant = (labDate: Date, transplantDate: Date): number => {
    const diffTime = labDate.getTime() - transplantDate.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

// Check if a row contains lab names (for detecting transposed data)
const containsLabNames = (values: any[]): boolean => {
    const labKeywords = ['ldh', 'lactate', 'creatinine', 'cr', 'creat', 'platelet', 'plt'];
    const valueStrings = values.map(v => String(v).toLowerCase());
    return labKeywords.some(keyword =>
        valueStrings.some(v => v.includes(keyword))
    );
};

// Consolidate multiple labs from same day using worst values
const consolidateSameDayLabs = (labs: ParsedLab[]): ParsedLab[] => {
    const grouped = new Map<string, ParsedLab[]>();

    // Group by date
    for (const lab of labs) {
        const dateKey = lab.date.toISOString().split('T')[0];
        if (!grouped.has(dateKey)) {
            grouped.set(dateKey, []);
        }
        grouped.get(dateKey)!.push(lab);
    }

    // Consolidate each day's labs
    const consolidated: ParsedLab[] = [];
    for (const [dateKey, dayLabs] of grouped) {
        // Only include if all three labs are present on that day
        const hasAllLabs = dayLabs.some(l => l.ldh !== undefined) &&
                          dayLabs.some(l => l.creatinine !== undefined) &&
                          dayLabs.some(l => l.platelets !== undefined);

        if (hasAllLabs) {
            const consolidatedLab: ParsedLab = {
                date: dayLabs[0].date,
                ldh: Math.max(...dayLabs.filter(l => l.ldh !== undefined).map(l => l.ldh!)),
                creatinine: Math.max(...dayLabs.filter(l => l.creatinine !== undefined).map(l => l.creatinine!)),
                platelets: Math.min(...dayLabs.filter(l => l.platelets !== undefined).map(l => l.platelets!))
            };
            consolidated.push(consolidatedLab);
        }
    }

    return consolidated;
};

// Parse standard column format (Date, LDH, Creatinine, Platelets)
const parseStandardFormat = (data: any[][], transplantDate: Date | null, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): ParsedLab[] => {
    if (data.length < 2) return [];

    const headers = data[0];
    const dateIdx = matchColumn(headers, ['date', 'lab date', 'collection date', 'timestamp', 'time']);
    const dayIdx = matchColumn(headers, ['day', 'days', 'day post-transplant', 'd+', 'post-transplant day']);
    const ldhIdx = matchColumn(headers, ['ldh', 'lactate dehydrogenase', 'lactate']);
    const creatinineIdx = matchColumn(headers, ['creatinine', 'cr', 'creat']);
    const plateletsIdx = matchColumn(headers, ['platelet', 'platelets', 'plt', 'platelet count']);

    const labs: ParsedLab[] = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        let labDate: Date | null = null;

        // Try to parse date
        if (dateIdx !== -1 && row[dateIdx]) {
            labDate = parseDate(row[dateIdx], formatHint);
        }

        // If no date but has day number and transplant date, calculate date
        if (!labDate && dayIdx !== -1 && row[dayIdx] && transplantDate) {
            const dayNum = parseFloat(row[dayIdx]);
            if (!isNaN(dayNum)) {
                labDate = new Date(transplantDate);
                labDate.setDate(labDate.getDate() + dayNum);
            }
        }

        if (!labDate) continue;

        const lab: ParsedLab = { date: labDate };

        if (ldhIdx !== -1 && row[ldhIdx]) {
            const val = parseFloat(row[ldhIdx]);
            if (!isNaN(val)) lab.ldh = val;
        }

        if (creatinineIdx !== -1 && row[creatinineIdx]) {
            const val = parseFloat(row[creatinineIdx]);
            if (!isNaN(val)) lab.creatinine = val;
        }

        if (plateletsIdx !== -1 && row[plateletsIdx]) {
            const val = parseFloat(row[plateletsIdx]);
            if (!isNaN(val)) lab.platelets = val;
        }

        labs.push(lab);
    }

    return labs;
};

// Parse transposed format (rows are labs, columns are dates)
const parseTransposedFormat = (data: any[][], transplantDate: Date | null, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): ParsedLab[] => {
    if (data.length < 2) return [];


    const labs: ParsedLab[] = [];
    let dateRowIdx = -1;
    let ldhRowIdx = -1;
    let creatinineRowIdx = -1;
    let plateletsRowIdx = -1;

    // Find which rows contain which data
    for (let i = 0; i < data.length; i++) {
        const firstCell = String(data[i][0]).toLowerCase();
        if (firstCell.includes('date') || firstCell.includes('time')) {
            dateRowIdx = i;
        } else if (firstCell.includes('ldh') || firstCell.includes('lactate')) {
            ldhRowIdx = i;
        } else if (firstCell.includes('creat') || firstCell.includes('cr')) {
            creatinineRowIdx = i;
        } else if (firstCell.includes('platelet') || firstCell.includes('plt')) {
            plateletsRowIdx = i;
        }
    }


    // If no date row found, check if first row contains dates (starting from column 1)
    if (dateRowIdx === -1) {
        const firstRow = data[0];
        // Check if first cell mentions "day"
        if (firstRow[0] && String(firstRow[0]).toLowerCase().includes('day')) {
            dateRowIdx = 0;
        }
        // Or check if row 0 has parseable dates in columns 1+
        else if (firstRow.length > 1) {
            // Try to parse the second cell as a date
            const testDate = parseDate(firstRow[1], formatHint);
            if (testDate) {
                dateRowIdx = 0;
            }
        }
    }

    if (dateRowIdx === -1) return [];

    // Parse each column as a separate time point
    const numColumns = Math.max(...data.map(row => row.length));
    for (let col = 1; col < numColumns; col++) {
        let labDate: Date | null = null;

        if (dateRowIdx !== -1 && data[dateRowIdx][col]) {
            labDate = parseDate(data[dateRowIdx][col], formatHint);

            // If parsing failed and we have transplant date, try as day number
            if (!labDate && transplantDate) {
                const dayNum = parseFloat(data[dateRowIdx][col]);
                if (!isNaN(dayNum)) {
                    labDate = new Date(transplantDate);
                    labDate.setDate(labDate.getDate() + dayNum);
                }
            }
        }

        if (!labDate) continue;

        const lab: ParsedLab = { date: labDate };

        if (ldhRowIdx !== -1 && data[ldhRowIdx][col]) {
            const val = parseFloat(data[ldhRowIdx][col]);
            if (!isNaN(val)) lab.ldh = val;
        }

        if (creatinineRowIdx !== -1 && data[creatinineRowIdx][col]) {
            const val = parseFloat(data[creatinineRowIdx][col]);
            if (!isNaN(val)) lab.creatinine = val;
        }

        if (plateletsRowIdx !== -1 && data[plateletsRowIdx][col]) {
            const val = parseFloat(data[plateletsRowIdx][col]);
            if (!isNaN(val)) lab.platelets = val;
        }

        labs.push(lab);
    }

    return labs;
};

// Parse key-value pair format (Lab, Value, Date columns)
const parseKeyValueFormat = (data: any[][], transplantDate: Date | null, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): ParsedLab[] => {
    if (data.length < 2) return [];


    const headers = data[0];
    const labNameIdx = matchColumn(headers, ['lab', 'test', 'lab name', 'test name']);
    const valueIdx = matchColumn(headers, ['value', 'result', 'lab value']);
    const dateIdx = matchColumn(headers, ['date', 'lab date', 'collection date', 'timestamp']);
    const dayIdx = matchColumn(headers, ['day', 'days', 'd+']);


    if (labNameIdx === -1 || valueIdx === -1) {
        return [];
    }

    const labsByDate = new Map<string, ParsedLab>();

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const labName = String(row[labNameIdx]).toLowerCase();
        const value = parseFloat(row[valueIdx]);


        if (isNaN(value)) {
            continue;
        }

        let labDate: Date | null = null;

        if (dateIdx !== -1 && row[dateIdx]) {
            labDate = parseDate(row[dateIdx], formatHint);
        }

        if (!labDate && dayIdx !== -1 && row[dayIdx] && transplantDate) {
            const dayNum = parseFloat(row[dayIdx]);
            if (!isNaN(dayNum)) {
                labDate = new Date(transplantDate);
                labDate.setDate(labDate.getDate() + dayNum);
            }
        }

        if (!labDate) continue;

        const dateKey = labDate.toISOString();
        if (!labsByDate.has(dateKey)) {
            labsByDate.set(dateKey, { date: labDate });
        }

        const lab = labsByDate.get(dateKey)!;

        if (labName.includes('ldh') || labName.includes('lactate')) {
            lab.ldh = value;
        } else if (labName.includes('creat') || labName.includes('cr')) {
            lab.creatinine = value;
        } else if (labName.includes('platelet') || labName.includes('plt')) {
            lab.platelets = value;
        }
    }

    return Array.from(labsByDate.values());
};

// Parse pasted/vertical format (date followed by lab-value pairs)
// Handles values next to lab names OR underneath them, with variable spacing
const parsePastedFormat = (data: any[][], transplantDate: Date | null, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): ParsedLab[] => {
    const labs: ParsedLab[] = [];
    let currentDate: Date | null = null;
    let currentLab: ParsedLab | null = null;
    let lastLabName: string | null = null; // Track last lab name seen
    let dateWasActualDate: boolean = false; // Track if current date came from real date (vs day number)

    for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // Skip completely empty rows (but don't skip rows with just empty strings)
        if (!row || row.length === 0) {
            lastLabName = null; // Reset lab name on empty row
            continue;
        }

        // Check if all cells are empty or whitespace
        const hasContent = row.some(cell => cell && String(cell).trim());
        if (!hasContent) {
            lastLabName = null; // Reset lab name on empty row
            continue;
        }

        const firstCell = row[0];
        if (!firstCell || String(firstCell).trim() === '') continue;

        const firstCellStr = String(firstCell).toLowerCase().trim();

        // Try to parse as date (real date with slashes/dashes/etc)
        const possibleDate = parseDate(firstCell, formatHint);
        if (possibleDate) {
            // Save previous lab if complete
            if (currentLab && currentDate) {
                labs.push(currentLab);
            }
            currentDate = possibleDate;
            currentLab = { date: currentDate };
            dateWasActualDate = true; // Mark that we got a real date
            lastLabName = null;
            continue;
        }

        // Try to parse as day number with transplant date
        // ONLY if: (1) no pending lab value, (2) haven't seen a real date yet, (3) have transplant date
        if (!lastLabName && !dateWasActualDate && transplantDate && !firstCellStr.includes('.')) {
            const dayNum = parseFloat(firstCell);
            // Must be integer and in reasonable day range (20-120 for transplant labs)
            if (!isNaN(dayNum) && Number.isInteger(dayNum) && dayNum >= 20 && dayNum <= 120) {
                if (currentLab && currentDate) {
                    labs.push(currentLab);
                }
                currentDate = new Date(transplantDate);
                currentDate.setDate(currentDate.getDate() + dayNum);
                currentLab = { date: currentDate };
                dateWasActualDate = false; // Mark that this came from day number
                lastLabName = null;
                continue;
            }
        }

        // Check if this is a lab name
        const isLdhName = firstCellStr.includes('ldh') || firstCellStr.includes('lactate');
        const isCreatinineName = firstCellStr.includes('creat') || firstCellStr.includes('cr');
        const isPlateletsName = firstCellStr.includes('platelet') || firstCellStr.includes('plt');

        if (currentLab && (isLdhName || isCreatinineName || isPlateletsName)) {
            // Check if value is in second column
            const secondCell = row[1];
            if (secondCell) {
                const val = parseFloat(secondCell);
                if (!isNaN(val)) {
                    if (isLdhName) {
                        currentLab.ldh = val;
                        lastLabName = null;
                    } else if (isCreatinineName) {
                        currentLab.creatinine = val;
                        lastLabName = null;
                    } else if (isPlateletsName) {
                        currentLab.platelets = val;
                        lastLabName = null;
                    }
                    continue;
                }
            }

            // Value not in second column - remember this lab name for next row
            if (isLdhName) lastLabName = 'ldh';
            else if (isCreatinineName) lastLabName = 'creatinine';
            else if (isPlateletsName) lastLabName = 'platelets';
            continue;
        }

        // Check if this might be a value for the previous lab name
        if (currentLab && lastLabName) {
            const val = parseFloat(firstCell);
            if (!isNaN(val)) {
                if (lastLabName === 'ldh') {
                    currentLab.ldh = val;
                } else if (lastLabName === 'creatinine') {
                    currentLab.creatinine = val;
                } else if (lastLabName === 'platelets') {
                    currentLab.platelets = val;
                }
                lastLabName = null; // Reset after assigning value
            }
        }
    }

    // Save last lab
    if (currentLab && currentDate) {
        labs.push(currentLab);
    }

    return labs;
};

// Auto-detect format and parse
const detectAndParse = (data: any[][], transplantDate: Date | null, formatHint: 'US' | 'INTL' | 'UNKNOWN' = 'US'): ParsedLab[] => {
    if (!data || data.length === 0) return [];


    // Check if this is a single-column file (pasted format)
    // Count how many rows have only 1 non-empty cell
    let singleColumnRows = 0;
    let totalRows = 0;
    for (const row of data) {
        const nonEmptyCells = row.filter(cell => cell && String(cell).trim()).length;
        if (nonEmptyCells > 0) {
            totalRows++;
            if (nonEmptyCells === 1) {
                singleColumnRows++;
            }
        }
    }
    const isSingleColumn = totalRows > 0 && (singleColumnRows / totalRows) > 0.8; // >80% single column

    // If it's mostly single-column, try pasted format first
    if (isSingleColumn) {
        const pastedLabs = parsePastedFormat(data, transplantDate, formatHint);
        if (pastedLabs.length > 0) return pastedLabs;
    }

    // Check if transposed (before standard format)
    // If first column contains lab names, it's likely transposed
    if (data.length > 1) {
        const firstColumn = data.map(row => row[0]).filter(cell => cell);
        const hasLabNames = containsLabNames(firstColumn);

        if (hasLabNames) {
            // Check if lab names are REPEATED (key-value format) or UNIQUE (transposed format)
            const uniqueNames = new Set(firstColumn.map(c => String(c).toLowerCase()));
            const isRepeated = uniqueNames.size < firstColumn.length;

            // If lab names are repeated, try key-value format FIRST
            if (isRepeated) {
                const kvLabs = parseKeyValueFormat(data, transplantDate, formatHint);
                if (kvLabs.length > 0) return kvLabs;
            } else {
                // Lab names unique - try transposed format
                const transposedLabs = parseTransposedFormat(data, transplantDate, formatHint);
                if (transposedLabs.length > 0) return transposedLabs;
            }
        }
    }

    // Try standard format
    const standardLabs = parseStandardFormat(data, transplantDate, formatHint);
    if (standardLabs.length > 0) return standardLabs;

    // Try key-value format (fallback)
    const kvLabs = parseKeyValueFormat(data, transplantDate, formatHint);
    if (kvLabs.length > 0) return kvLabs;

    // Try pasted format
    const pastedLabs = parsePastedFormat(data, transplantDate, formatHint);
    if (pastedLabs.length > 0) return pastedLabs;

    return [];
};

// Convert parsed labs to LabRow format
const convertToLabRows = (
    labs: ParsedLab[],
    transplantDate: Date | null
): FileParseResult => {
    if (labs.length === 0) {
        return {
            imported: [],
            missingValues: 0,
            outOfRange: 0,
            complete: 0,
            error: 'No valid lab data found in file'
        };
    }

    // Check if we need transplant date
    const needsTransplantDate = !transplantDate;

    // Consolidate same-day labs
    const consolidatedLabs = consolidateSameDayLabs(labs);

    const imported: LabRow[] = [];
    let missingValues = 0;
    let outOfRange = 0;
    let complete = 0;

    for (const lab of consolidatedLabs) {
        if (!transplantDate) {
            // Can't calculate days without transplant date
            continue;
        }

        const day = calculateDaysFromTransplant(lab.date, transplantDate);

        // Check if in range
        if (day < 20 || day > 120) {
            outOfRange++;
            continue;
        }

        // Check for missing values
        const hasMissing = !lab.ldh || !lab.creatinine || !lab.platelets;
        if (hasMissing) {
            missingValues++;
        } else {
            complete++;
        }

        imported.push({
            id: crypto.randomUUID(),
            day: day.toString(),
            ldh: lab.ldh?.toString() || '',
            creatinine: lab.creatinine?.toString() || '',
            platelets: lab.platelets?.toString() || ''
        });
    }

    return {
        imported,
        missingValues,
        outOfRange,
        complete,
        needsTransplantDate
    };
};

// Main parser function
export const parseFile = async (
    file: File,
    transplantDate: string | null
): Promise<FileParseResult> => {
    // Parse transplant date - date input gives YYYY-MM-DD, create date at noon to avoid timezone issues
    let transplantDateObj: Date | null = null;
    if (transplantDate) {
        const parts = transplantDate.split('-');
        if (parts.length === 3) {
            transplantDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
        }
    }

    try {
        // Read file
        const arrayBuffer = await file.arrayBuffer();

        let data: any[][] = [];

        // Parse based on file type
        if (file.name.endsWith('.csv')) {
            // Parse CSV - handle different line endings
            const text = new TextDecoder().decode(arrayBuffer);
            // Normalize line endings (handle \r\n, \r, and \n)
            const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedText.trim().split('\n');
            data = lines.map(line => line.split(',').map(cell => cell.trim()));
        } else {
            // Parse XLSX
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        }

        // Detect date format across entire file
        const dateFormat = detectDateFormat(data);

        // Detect format and parse
        const parsedLabs = detectAndParse(data, transplantDateObj, dateFormat);

        // Convert to LabRow format
        const result = convertToLabRows(parsedLabs, transplantDateObj);

        return result;
    } catch (error) {
        return {
            imported: [],
            missingValues: 0,
            outOfRange: 0,
            complete: 0,
            error: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
};
