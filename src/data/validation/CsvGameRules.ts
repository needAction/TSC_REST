import { TableTags } from "./CsvSchema";
import { csvList, finiteNumber, int32, isActive } from "./CsvValidation";
import type { CsvValidationContext, CsvValidationTable, ICsvValidationRule } from "./CsvValidation";
import type { CsvRow } from "../../common/csv/CsvDocument";

export class CsvRoomRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    const rooms = context.tagged(TableTags.room);
    for (const table of rooms) for (const row of table.rows) {
      const visited = new Set([row.get(table.key!)]);
      let next = row.get("Next");
      while (next !== "0" && table.find(next)) {
        context.signal?.throwIfAborted();
        if (visited.has(next)) { context.add("RoomCycle", table.name, row.sourceLine, "Next"); break; }
        visited.add(next); next = table.find(next)!.get("Next");
      }
    }
    for (const table of rooms) this.checkActiveChain(context, table);
    const names = new Set<string>();
    for (const table of context.tagged(TableTags.anchor)) for (const row of table.rows) {
      context.signal?.throwIfAborted();
      for (const room of rooms.filter(room => row.get("PlayerType") === "ALL" || room.schema?.player === row.get("PlayerType")))
        if (!room.rows.some(candidate => candidate.get("RoomNo") === row.get("RoomNo")))
          context.add("RoomMissing", table.name, row.sourceLine, "RoomNo", room.name, row.get("RoomNo"));
      const key = JSON.stringify([row.get("RoomNo"), row.get("PlayerType"), row.get("AnchorID")]);
      if (names.has(key)) context.add("DuplicateKey", table.name, row.sourceLine, "AnchorID", key);
      names.add(key);
    }
    this.checkPlacement(context, TableTags.arrow, "Order");
    this.checkPlacement(context, TableTags.wire, "Port");
  }
  private checkActiveChain(context: CsvValidationContext, table: CsvValidationTable): void {
    const active = table.rows.filter(isActive);
    const byId = new Map(active.map(row => [row.get(table.key!), row]));
    const incoming = new Set(active.map(row => row.get("Next")));
    const starts = active.filter(row => !incoming.has(row.get(table.key!)));
    const line = active[0]?.sourceLine ?? table.rows[0]?.sourceLine ?? 1;
    if (starts.length !== 1) {
      context.add("RoomStartCount", table.name, line, "Next", String(starts.length));
      return;
    }
    const visited = new Set<string>();
    let next = starts[0]!.get(table.key!);
    while (next !== "0" && byId.has(next) && !visited.has(next)) {
      context.signal?.throwIfAborted();
      visited.add(next);
      next = byId.get(next)!.get("Next");
    }
    if (next !== "0" || visited.size !== active.length)
      context.add("RoomDisconnected", table.name, line, "Next", String(visited.size), String(active.length));
  }
  private checkPlacement(context: CsvValidationContext, tag: string, column: string): void {
    const values = new Set<string>();
    const anchors = context.tagged(TableTags.anchor).filter(table => table.schema?.kind === "NonInteract");
    for (const table of context.tagged(tag)) for (const row of table.rows) {
      const anchor = anchors.map(table => table.find(row.get("AnchorRef"))).find(row => row !== undefined);
      if (!anchor) continue;
      const key = JSON.stringify([anchor.get("RoomNo"), anchor.get("PlayerType"), row.get(column)]);
      if (values.has(key)) context.add("DuplicateKey", table.name, row.sourceLine, column, key);
      values.add(key);
    }
  }
}

export class CsvPuzzleRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    for (const table of context.tagged(TableTags.puzzle)) for (const puzzle of table.rows) {
      context.signal?.throwIfAborted();
      const count = int32(puzzle.get("SlotCount"));
      if (count === undefined || count < 1) continue;
      const slots = context.tagged(TableTags.slot).flatMap(table => table.rows.map(row => ({ table, row })))
        .filter(slot => slot.row.get("PuzzleID") === puzzle.get("ID"));
      if (slots.length !== count) context.add("SlotCount", table.name, puzzle.sourceLine, "SlotCount", String(count), String(slots.length));
      for (const slot of slots) {
        const position = int32(slot.row.get("Slot"));
        if (position !== undefined && (position < 1 || position > count)) context.add("SlotRange", slot.table.name, slot.row.sourceLine, "Slot", String(count));
      }
      const solver = this.findRoom(context, puzzle.get("SolverRoom"));
      this.checkRoom(context, table, puzzle, "SolverRoom", "Solver");
      this.checkRoom(context, table, puzzle, "ClueRoom", "Clue");
      const input = context.tagged(TableTags.anchor).filter(table => table.schema?.kind === "Interact")
        .map(table => table.find(puzzle.get("InputAnchor"))).find(row => row !== undefined);
      if (solver && input) {
        const room = solver.find(puzzle.get("SolverRoom"))!;
        if (room.get("RoomNo") !== input.get("RoomNo") || (input.get("PlayerType") !== solver.schema?.player && input.get("PlayerType") !== "ALL"))
          context.add("InputRoom", table.name, puzzle.sourceLine, "InputAnchor");
      }
      for (const console of context.tagged(TableTags.console)) for (const row of console.rows.filter(row => row.get("AnchorRef") === puzzle.get("InputAnchor")))
        if (row.get("SlotCount") !== puzzle.get("SlotCount")) context.add("ConsoleSlots", console.name, row.sourceLine, "SlotCount");
    }
  }
  private findRoom(context: CsvValidationContext, id: string): CsvValidationTable | undefined { return context.tagged(TableTags.room).find(table => table.find(id)); }
  private checkRoom(context: CsvValidationContext, table: CsvValidationTable, puzzle: CsvRow, column: string, role: string): void {
    const room = this.findRoom(context, puzzle.get(column))?.find(puzzle.get(column));
    if (room && (room.get("PuzzleID") !== puzzle.get("ID") || room.get("Role") !== role)) context.add("PuzzleRoom", table.name, puzzle.sourceLine, column, role);
  }
}

export class CsvValueRelationRule implements ICsvValidationRule {
  validate(context: CsvValidationContext): void {
    for (const table of context.tagged(TableTags.config)) for (const row of table.rows) {
      const type = row.get("Type"), value = row.get("Value");
      if ((type === "int" && int32(value, true) === undefined) || (type === "float" && finiteNumber(value) === undefined))
        context.add("InvalidValue", table.name, row.sourceLine, "Value", value, type);
    }
    for (const table of context.tagged(TableTags.sound)) for (const row of table.rows) {
      const min = row.get("MinDist"), max = row.get("MaxDist"), low = finiteNumber(min), high = finiteNumber(max);
      if ((min.length === 0) !== (max.length === 0) || (low !== undefined && high !== undefined && low > high)) context.add("InvalidDistance", table.name, row.sourceLine, "MaxDist");
    }
    for (const table of context.tagged(TableTags.lock)) for (const row of table.rows) {
      const letters = csvList(row.get("DialLetters"));
      if (row.get("DialFace") === "Letter9" && (letters.length !== 9 || new Set(letters).size !== 9)) context.add("InvalidLetters", table.name, row.sourceLine, "DialLetters");
    }
    const targetTags: readonly string[] = [TableTags.room, TableTags.prefab, TableTags.anchor, TableTags.puzzle];
    for (const table of context.tagged(TableTags.soundLink)) for (const row of table.rows) {
      const target = row.get("TargetSheet");
      if (target === "Global") {
        if (row.get("TargetID") !== "0") context.add("InvalidValue", table.name, row.sourceLine, "TargetID", row.get("TargetID"), "Global=0");
        continue;
      }
      const schema = context.schemas.find(schema => schema.name === target);
      if (!schema?.tag || !targetTags.includes(schema.tag)) context.add("UnknownSheet", table.name, row.sourceLine, "TargetSheet", target);
      else context.reference(table, row, "TargetID", context.tables.filter(table => table.usable && table.name === target));
    }
  }
}
