import type { CsvRow } from "../../common/csv/CsvDocument";
import { CsvRowReader, CsvTableMapping } from "../CsvTableMapping";

// CARD.csv의 읽기 전용 한 행입니다. 게임 중 변경 상태와 Unity 동작은 포함하지 않습니다.
export class CardData {
  static readonly table = new CsvTableMapping<CardData>("CARD", row => new CardData(row));
  readonly id: number;
  readonly anchorRef: number;
  readonly cardNo: number;
  readonly topMark: string;
  readonly bottomMark: string;
  readonly isAnswer: boolean;

  constructor(row: CsvRow) {
    const value = new CsvRowReader(row, CardData.table.sheetName);
    this.id = value.integer("ID");
    this.anchorRef = value.integer("AnchorRef");
    this.cardNo = value.integer("CardNo");
    this.topMark = value.text("TopMark");
    this.bottomMark = value.text("BottomMark");
    this.isAnswer = value.flag("IsAnswer");
    Object.freeze(this);
  }
}
