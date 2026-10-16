import { CsvDocument, CsvRow } from "./CsvDocument";
import { CsvErrorCode, CsvParseError } from "./CsvParseError";

enum FieldState { Start, Unquoted, Quoted, AfterQuote }
const trimHeader = (value: string) => value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");

// 파일/Node/게임 규칙에 의존하지 않는 단일 순회 CSV 해석기입니다.
export class CsvParser {
  read(text: string, sourceName = "(memory)"): CsvDocument {
    if (typeof text !== "string") throw new TypeError("CSV 문자열이 필요합니다.");
    if (text.startsWith("\uFEFF")) text = text.slice(1);
    let state = FieldState.Start;
    let field = "";
    let fields: string[] = [];
    let hasSyntax = false;
    let line = 1;
    let recordLine = 1;
    let headers: string[] | undefined;
    const rows: CsvRow[] = [];
    const fail = (code: CsvErrorCode, errorLine = line, column = fields.length + 1): never => {
      throw new CsvParseError(code, sourceName, errorLine, column);
    };
    const endField = () => { fields.push(field); field = ""; state = FieldState.Start; };
    const endRecord = () => {
      endField();
      // 공백 줄은 무시하지만 따옴표로 지정한 빈 셀과 첫 칸이 빈 행은 보존합니다.
      const blank = !hasSyntax && fields.every(value => trimHeader(value).length === 0);
      if (!blank) {
        if (!headers) {
          headers = fields.map(trimHeader);
          const names = new Set<string>();
          headers.forEach((header, index) => {
            if (!header) fail(CsvErrorCode.EmptyHeader, recordLine, index + 1);
            if (names.has(header)) fail(CsvErrorCode.DuplicateHeader, recordLine, index + 1);
            names.add(header);
          });
        } else {
          if (fields.length !== headers.length)
            fail(CsvErrorCode.FieldCountMismatch, recordLine, Math.min(fields.length, headers.length) + 1);
          rows.push(new CsvRow(recordLine, headers, fields));
        }
      }
      fields = [];
      hasSyntax = false;
    };
    let index = 0;
    while (index < text.length) {
      const char = text[index];
      const newlineSize = char === "\r" ? (text[index + 1] === "\n" ? 2 : 1) : char === "\n" ? 1 : 0;
      if (state === FieldState.Quoted) {
        if (char === '"') { state = FieldState.AfterQuote; index++; }
        else if (newlineSize) { field += text.slice(index, index + newlineSize); index += newlineSize; line++; }
        else { field += char; index++; }
        continue;
      }
      if (state === FieldState.AfterQuote && char === '"') {
        field += '"'; state = FieldState.Quoted; index++; continue;
      }
      if (char === ",") { endField(); hasSyntax = true; index++; continue; }
      if (newlineSize) { endRecord(); index += newlineSize; line++; recordLine = line; continue; }
      if (state === FieldState.AfterQuote) fail(CsvErrorCode.InvalidQuote);
      if (char === '"') {
        if (state !== FieldState.Start) fail(CsvErrorCode.InvalidQuote);
        state = FieldState.Quoted; hasSyntax = true; index++; continue;
      }
      field += char; state = FieldState.Unquoted; index++;
    }
    if (state === FieldState.Quoted) fail(CsvErrorCode.UnclosedQuote);
    endRecord();
    if (!headers) fail(CsvErrorCode.MissingHeader, 1, 1);
    return new CsvDocument(sourceName, headers!, rows);
  }
}
