export enum CsvErrorCode {
  MissingHeader = 1,
  InvalidQuote = 2,
  UnclosedQuote = 3,
  EmptyHeader = 4,
  DuplicateHeader = 5,
  FieldCountMismatch = 6
}

export class CsvParseError extends Error {
  constructor(
    readonly code: CsvErrorCode,
    readonly sourceName: string,
    readonly lineNumber: number,
    readonly fieldNumber: number
  ) {
    super(`CSV ${CsvErrorCode[code]}: ${sourceName}, ${lineNumber}행 ${fieldNumber}열`);
    this.name = "CsvParseError";
  }
}
