// protocol/data/content-contract.json에서 생성. 직접 수정하지 않습니다.
export const contentContract = {
  "version": 1,
  "features": [
    "Interactable",
    "CloseUpUI",
    "DialLock",
    "ButtonConsole",
    "Door",
    "LetterSign",
    "ScreenText",
    "Spawn"
  ],
  "puzzleTypes": [
    "CardLetter",
    "FrameCount",
    "ArrowSequence",
    "WireRank",
    "TwistedFormula",
    "TVLetter",
    "ColourWord"
  ],
  "colors": [
    "red",
    "cyan",
    "blue",
    "darkblue",
    "lightblue",
    "purple",
    "yellow",
    "lime",
    "fuchsia",
    "white",
    "silver",
    "grey",
    "gray",
    "black",
    "orange",
    "brown",
    "maroon",
    "green",
    "olive",
    "navy",
    "teal",
    "aqua",
    "magenta"
  ],
  "parameters": {
    "Interactable": [
      "HighlightColor"
    ],
    "CloseUpUI": [
      "CamOffset"
    ]
  }
} as const;
