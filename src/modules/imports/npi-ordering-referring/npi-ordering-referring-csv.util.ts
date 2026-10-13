import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

export interface CsvScanResult {
  headers: string[] | null;
  dataRowCount: number;
}

/**
 * Streams a CSV file row-by-row (one record materialized at a time via async iteration, which
 * backpressures the underlying read stream while `onRow` awaits a DB write) — the Nest analogue
 * of Laravel's `fgetcsv()` loop in ImportNpiOrderingReferrings/CountsCsvDataRows, without reading
 * the whole file into memory the way `parseCsvFile` (readFileSync + parse/sync) does.
 */
export async function forEachNpiCsvRow(
  filePath: string,
  onRow: (row: string[], dataRowIndex: number) => Promise<void> | void,
): Promise<CsvScanResult> {
  const parser = createReadStream(filePath).pipe(
    // relax_quotes: PHP fgetcsv accepts unescaped quotes inside fields (e.g. JOY (DBA ").
    parse({
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
    }),
  );

  let headers: string[] | null = null;
  let dataRowCount = 0;

  for await (const record of parser as AsyncIterable<string[]>) {
    if (headers === null) {
      headers = record;
      continue;
    }
    await onRow(record, dataRowCount);
    dataRowCount += 1;
  }

  return { headers, dataRowCount };
}

/** Laravel CountsCsvDataRows::countCsvDataRows — streamed, header row excluded. */
export async function countNpiCsvDataRows(filePath: string): Promise<number> {
  const { dataRowCount } = await forEachNpiCsvRow(filePath, () => undefined);
  return dataRowCount;
}

/** Reads only the header row, without scanning the rest of the file. */
export async function readNpiCsvHeaderRow(filePath: string): Promise<string[]> {
  const parser = createReadStream(filePath).pipe(
    parse({
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      to: 1,
    }),
  );
  for await (const record of parser as AsyncIterable<string[]>) {
    return record;
  }
  return [];
}
