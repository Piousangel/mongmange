// 그림 판 보관(코드 리뷰 2차 낮음 ①): 판마다 새 모티프 형상 데이터(경로·장·자리·곁·래스터 상자)를 그대로 남긴다.
// 판 2가 생겨 `MOTIF_SHAPES`가 바뀌어도 이미 받은 판 1 카드는 이 데이터로 다시 그린다(장면이 판을 안다 — `motifForRev`).
// 손으로 고치지 않는다. 지금 판이 열린 동안(`OPEN_ART_REV`)은 시험이 `MOTIF_SHAPES`와 같음을 본다.
import type { MotifShape } from './dreamMotifShapes';

export const ART_REV_SHAPES_ARCHIVE: Readonly<Record<number, Readonly<Record<string, MotifShape>>>> = {
  1: {
    "near-alone.inkstone": {
      "paths": [
        {
          "d": "M8 70 Q24.1 67.7 40 64 Q62.1 63.6 84 66 Q89 71 94 76 Q90.7 82.6 90 90 Q71.1 92.7 52 94 Q32 92.3 12 92 Q6.9 87.9 4 82 Q6 76 8 70",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M48 78 Q62 74 76 76",
          "w": 6.5,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "drop",
          "x": 24,
          "y": 80,
          "r": 10,
          "ink": 0.6
        },
        {
          "k": "drop",
          "x": 24,
          "y": 80,
          "r": 7,
          "ink": 0.38
        },
        {
          "k": "curl",
          "x": 30,
          "y": 76,
          "angle": -2.2,
          "radius": 18
        },
        {
          "k": "tine",
          "x": 50,
          "y": 62,
          "dx": 0,
          "dy": -6,
          "lambda": 24,
          "gauss": true
        }
      ],
      "seat": [
        70,
        46
      ]
    },
    "near-with.letter": {
      "paths": [
        {
          "d": "M2 20 Q50 24 98 19",
          "w": 2.4,
          "layer": "ink"
        },
        {
          "d": "M38 34 Q58.8 39.8 80 44 Q78.6 58.3 74 72 Q57 69 40 66 Q37.2 60 32 56 Q34.2 44.8 38 34",
          "w": 1.5,
          "layer": "wash"
        },
        {
          "d": "M36.5 33.6 Q33.1 44.5 30.5 55.6 Q27.2 48.9 25.5 41.6 Q31 37.6 36.5 33.6",
          "w": 3.5,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 56,
          "y": 22,
          "dx": 0,
          "dy": 10,
          "lambda": 20,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 56,
          "y": 70,
          "dx": 0,
          "dy": 7,
          "lambda": 16,
          "gauss": true
        }
      ],
      "seat": [
        20,
        84
      ],
      "raster": {
        "box": [
          28,
          22,
          46,
          50
        ],
        "keep": [
          0
        ],
        "cover": 0.85
      }
    },
    "near-alone.washing-line": {
      "paths": [
        {
          "d": "M2 22 Q50 33 98 17",
          "w": 2.6,
          "layer": "ink"
        },
        {
          "d": "M24 26.4 Q29 27.3 34 27.4 Q40 26.8 46 28 Q51 28 56 28 Q55.6 39 57 50 Q55.3 52.3 53 54 Q51.3 52.1 49 51 Q47.7 54.1 45 56 Q42.5 54 40 52 Q36.9 53.9 35 57 Q32.2 55.4 30 53 Q27.8 53.6 26 55 Q24.1 40.8 24 26.4",
          "w": 1.6,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 40,
          "y": 30,
          "dx": 0,
          "dy": 16,
          "lambda": 10,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 76,
          "y": 26,
          "dx": 0,
          "dy": 11,
          "lambda": 7,
          "gauss": true
        }
      ],
      "seat": [
        50,
        84
      ]
    },
    "near-alone.sprout": {
      "paths": [
        {
          "d": "M44 52 Q38 46 30 46",
          "w": 5.5,
          "layer": "ink"
        },
        {
          "d": "M46 49 Q53 32 72 27",
          "w": 7.5,
          "layer": "ink"
        },
        {
          "d": "M44 74 Q46 62 45 52",
          "w": 3,
          "layer": "wash"
        },
        {
          "d": "M6 86 Q18.4 80.7 30 74 Q43.9 71.4 58 72 Q75 76 92 80 Q92.5 87.4 96 94 Q52 95.8 8 96 Q7.8 90.8 6 86",
          "w": 2.8,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 52,
          "y": 74,
          "dx": 9,
          "dy": -20,
          "lambda": 7,
          "gauss": true
        },
        {
          "k": "curl",
          "x": 70,
          "y": 60,
          "angle": 1.8,
          "radius": 26
        },
        {
          "k": "tine",
          "x": 20,
          "y": 84,
          "dx": -10,
          "dy": 3,
          "lambda": 4,
          "len": 24
        }
      ],
      "seat": [
        78,
        52
      ]
    },
    "far-alone.paper-boat": {
      "paths": [
        {
          "d": "M50 12 Q56.7 24.7 64 37 Q50 37.8 36 37 Q43 24.5 50 12",
          "w": 1.3,
          "layer": "wash"
        },
        {
          "d": "M24 38.5 Q50 39 76 38.5 Q71.1 43.5 65 47 Q50 47 35 47 Q30.1 42 24 38.5",
          "w": 3,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 50,
          "y": 50,
          "dx": 0,
          "dy": 8,
          "lambda": 14,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 18,
          "y": 52,
          "dx": -14,
          "dy": 1,
          "lambda": 3,
          "len": 24
        },
        {
          "k": "tine",
          "x": 84,
          "y": 52,
          "dx": 12,
          "dy": 1,
          "lambda": 3,
          "len": 18
        }
      ],
      "seat": [
        50,
        82
      ],
      "raster": {
        "box": [
          20,
          4,
          60,
          50
        ],
        "keep": [],
        "cover": 0.85
      }
    },
    "far-alone.kite": {
      "paths": [
        {
          "d": "M71 3 Q82.6 16.4 95 29 Q83.9 43.3 71 56 Q59 42.5 47 29 Q59.9 16.8 71 3",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M40 80 C52 74 64 66 71 57",
          "w": 1.1,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 71,
          "y": 72,
          "dx": 0,
          "dy": -16,
          "lambda": 9,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 75,
          "y": 62,
          "dx": 6,
          "dy": 16,
          "lambda": 3,
          "len": 22
        },
        {
          "k": "tine",
          "x": 81,
          "y": 72,
          "dx": 8,
          "dy": 8,
          "lambda": 2.5,
          "len": 14
        },
        {
          "k": "tine",
          "x": 69,
          "y": 66,
          "dx": -4,
          "dy": 14,
          "lambda": 2.5,
          "len": 18
        }
      ],
      "seat": [
        32,
        90
      ],
      "raster": {
        "box": [
          44,
          0,
          56,
          78
        ],
        "keep": [
          1
        ],
        "cover": 0.4
      }
    },
    "far-with.stepping-stones": {
      "paths": [
        {
          "d": "M32 84.5 C38.6 84.5 44 82.5 44 80 C44 77.5 38.6 75.5 32 75.5 C25.4 75.5 20 77.5 20 80 C20 82.5 25.4 84.5 32 84.5",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M52 69.6 C57.2 69.6 61.5 68 61.5 66 C61.5 64 57.2 62.4 52 62.4 C46.8 62.4 42.5 64 42.5 66 C42.5 68 46.8 69.6 52 69.6",
          "w": 3.6,
          "layer": "wash"
        },
        {
          "d": "M68 54.9 C72.1 54.9 75.5 53.6 75.5 52 C75.5 50.4 72.1 49.1 68 49.1 C63.9 49.1 60.5 50.4 60.5 52 C60.5 53.6 63.9 54.9 68 54.9",
          "w": 3.2,
          "layer": "wash"
        },
        {
          "d": "M80 42.3 C83.2 42.3 85.8 41.3 85.8 40 C85.8 38.7 83.2 37.7 80 37.7 C76.8 37.7 74.2 38.7 74.2 40 C74.2 41.3 76.8 42.3 80 42.3",
          "w": 2.8,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "drop",
          "x": 32,
          "y": 80,
          "r": 10.2,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 52,
          "y": 66,
          "r": 8.075,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 68,
          "y": 52,
          "r": 6.375,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 80,
          "y": 40,
          "r": 4.93,
          "ink": 0
        }
      ],
      "seat": [
        14,
        88
      ],
      "friend": [
        86,
        26,
        0.5
      ]
    },
    "center.leaf": {
      "paths": [
        {
          "d": "M12 34 Q28 18 50 20",
          "w": 8,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 60,
          "y": 26,
          "dx": 16,
          "dy": 1,
          "lambda": 5,
          "len": 30
        },
        {
          "k": "tine",
          "x": 66,
          "y": 36,
          "dx": 14,
          "dy": 1,
          "lambda": 4,
          "len": 26
        }
      ],
      "seat": [
        24,
        72
      ]
    },
    "far-alone.path": {
      "paths": [
        {
          "d": "M26 98 C42 88 46 80 44 68 C44 56 52 42 68 26",
          "w": 1.8,
          "layer": "wash"
        },
        {
          "d": "M60 99 C70 88 72 76 68 64 C66 54 72 40 80 24",
          "w": 1.4,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "drop",
          "x": 44,
          "y": 92,
          "r": 12,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 50,
          "y": 80,
          "r": 9.5,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 55,
          "y": 69,
          "r": 7,
          "ink": 0
        },
        {
          "k": "tine",
          "x": 56,
          "y": 66,
          "dx": 7,
          "dy": -26,
          "lambda": 6,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 58,
          "y": 52,
          "dx": -6,
          "dy": 0,
          "lambda": 10,
          "gauss": true
        }
      ],
      "seat": [
        42,
        96
      ]
    },
    "near-with.palm": {
      "paths": [
        {
          "d": "M20 82 Q50 98 80 82",
          "w": 2.4,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 50,
          "y": 98,
          "dx": 0,
          "dy": -12,
          "lambda": 18,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 14,
          "y": 78,
          "dx": 0,
          "dy": -18,
          "lambda": 8,
          "gauss": true
        },
        {
          "k": "tine",
          "x": 86,
          "y": 78,
          "dx": 0,
          "dy": -18,
          "lambda": 8,
          "gauss": true
        }
      ],
      "seat": [
        48,
        46
      ],
      "raster": {
        "box": [
          6,
          55,
          88,
          18
        ],
        "keep": [],
        "cover": 0.3,
        "stretch": true
      }
    },
    "near-with.umbrella": {
      "paths": [
        {
          "d": "M8 46 Q50 0 92 46 Q71 39 50 43 Q29 39 8 46",
          "w": 2.5,
          "layer": "wash"
        },
        {
          "d": "M50 20 L50 56",
          "w": 2.2,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 10,
          "y": 54,
          "dx": 0,
          "dy": 16,
          "lambda": 3,
          "len": 26
        },
        {
          "k": "tine",
          "x": 90,
          "y": 54,
          "dx": 0,
          "dy": 16,
          "lambda": 3,
          "len": 26
        },
        {
          "k": "tine",
          "x": 24,
          "y": 52,
          "dx": 0,
          "dy": 9,
          "lambda": 2.5,
          "len": 16
        },
        {
          "k": "tine",
          "x": 76,
          "y": 52,
          "dx": 0,
          "dy": 9,
          "lambda": 2.5,
          "len": 16
        }
      ],
      "seat": [
        36,
        70
      ],
      "friend": [
        58,
        73,
        0.55
      ],
      "raster": {
        "box": [
          14,
          0,
          78,
          86
        ],
        "keep": [],
        "cover": 0.45
      }
    },
    "far-with.star-bridge": {
      "paths": [
        {
          "d": "M20 66 Q50 -42 80 66",
          "w": 3,
          "layer": "wash"
        },
        {
          "d": "M26.6 45.6 l0.1 0",
          "w": 3.6,
          "layer": "gold"
        },
        {
          "d": "M31.4 31.8 l0.1 0",
          "w": 2.2,
          "layer": "gold"
        },
        {
          "d": "M39.8 17.8 l0.1 0",
          "w": 2.6,
          "layer": "gold"
        },
        {
          "d": "M48.2 12.7 l0.1 0",
          "w": 3.4,
          "layer": "gold"
        },
        {
          "d": "M57.2 14.4 l0.1 0",
          "w": 2.4,
          "layer": "gold"
        },
        {
          "d": "M66.2 28.7 l0.1 0",
          "w": 3.8,
          "layer": "gold"
        },
        {
          "d": "M69.8 34.6 l0.1 0",
          "w": 2.2,
          "layer": "gold"
        },
        {
          "d": "M23.6 53.6 l0.1 0",
          "w": 2.8,
          "layer": "ink"
        },
        {
          "d": "M34.4 26.8 l0.1 0",
          "w": 3.2,
          "layer": "ink"
        },
        {
          "d": "M62 20.6 l0.1 0",
          "w": 3,
          "layer": "ink"
        },
        {
          "d": "M74 46.6 l0.1 0",
          "w": 3,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 30,
          "y": 70,
          "dx": 14,
          "dy": 0,
          "lambda": 3
        },
        {
          "k": "tine",
          "x": 50,
          "y": 80,
          "dx": -14,
          "dy": 0,
          "lambda": 3
        },
        {
          "k": "tine",
          "x": 40,
          "y": 90,
          "dx": 14,
          "dy": 0,
          "lambda": 3
        },
        {
          "k": "tine",
          "x": 50,
          "y": 30,
          "dx": 0,
          "dy": -5,
          "lambda": 20,
          "gauss": true
        }
      ],
      "seat": [
        86,
        80
      ],
      "friend": [
        14,
        80,
        0.55
      ]
    },
    "center.wind": {
      "paths": [
        {
          "d": "M60 40 Q78 26 97 15",
          "w": 4.5,
          "layer": "ink"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 30,
          "y": 70,
          "dx": 16,
          "dy": -11,
          "lambda": 3
        },
        {
          "k": "tine",
          "x": 44,
          "y": 76,
          "dx": 16,
          "dy": -11,
          "lambda": 3
        },
        {
          "k": "tine",
          "x": 58,
          "y": 82,
          "dx": 16,
          "dy": -11,
          "lambda": 3
        }
      ],
      "seat": [
        24,
        30
      ]
    },
    "far-with.geese": {
      "paths": [
        {
          "d": "M67.5 21.4 Q75.6 13.3 80 12 Q85 12.6 93.1 22.6 M55.3 28.5 Q61 22.9 64 22 Q67.5 22.4 73.1 29.4 M65.9 42.1 Q71.2 36.8 74 36 Q77.2 36.4 82.5 42.9",
          "w": 3.4,
          "layer": "ink"
        },
        {
          "d": "M37.6 40.8 Q41.8 36.6 44 36 Q46.6 36.3 50.7 41.4 M55.8 56.7 Q59.8 52.6 62 52 Q64.5 52.3 68.5 57.3 M25 49.8 Q28.3 46.5 30 46 Q32 46.3 35.3 50.3 M47.2 67.6 Q50.3 64.5 52 64 Q53.9 64.2 57 68.1",
          "w": 2.6,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "tine",
          "x": 60,
          "y": 32,
          "dx": 10,
          "dy": -6,
          "lambda": 26,
          "gauss": true
        }
      ],
      "seat": [
        24,
        64
      ]
    },
    "center.snow": {
      "paths": [
        {
          "d": "M22 12 l0.1 0",
          "w": 8,
          "layer": "wash"
        },
        {
          "d": "M52 8 l0.1 0",
          "w": 6,
          "layer": "wash"
        },
        {
          "d": "M80 18 l0.1 0",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M36 30 l0.1 0",
          "w": 6,
          "layer": "wash"
        },
        {
          "d": "M68 36 l0.1 0",
          "w": 8,
          "layer": "wash"
        },
        {
          "d": "M90 46 l0.1 0",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M14 48 l0.1 0",
          "w": 4,
          "layer": "wash"
        },
        {
          "d": "M44 52 l0.1 0",
          "w": 8,
          "layer": "wash"
        },
        {
          "d": "M84 4 l0.1 0",
          "w": 6,
          "layer": "wash"
        },
        {
          "d": "M62 64 l0.1 0",
          "w": 5,
          "layer": "wash"
        },
        {
          "d": "M72 62 l0.1 0",
          "w": 6,
          "layer": "wash"
        },
        {
          "d": "M82 65 l0.1 0",
          "w": 5,
          "layer": "wash"
        },
        {
          "d": "M44 72 l0.1 0",
          "w": 5,
          "layer": "wash"
        },
        {
          "d": "M50 70.5 l0.1 0",
          "w": 6,
          "layer": "wash"
        },
        {
          "d": "M56 72 l0.1 0",
          "w": 5,
          "layer": "wash"
        },
        {
          "d": "M58 68 Q72 59 90 70",
          "w": 3,
          "layer": "wash"
        }
      ],
      "field": [
        {
          "k": "drop",
          "x": 22,
          "y": 12,
          "r": 8.5,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 52,
          "y": 8,
          "r": 3,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 80,
          "y": 18,
          "r": 2,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 36,
          "y": 30,
          "r": 3,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 68,
          "y": 36,
          "r": 7.75,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 90,
          "y": 46,
          "r": 2,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 14,
          "y": 48,
          "r": 2,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 44,
          "y": 52,
          "r": 7,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 84,
          "y": 4,
          "r": 3,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 62,
          "y": 64,
          "r": 2.5,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 72,
          "y": 62,
          "r": 3,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 82,
          "y": 65,
          "r": 2.5,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 44,
          "y": 72,
          "r": 2.5,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 50,
          "y": 70.5,
          "r": 3,
          "ink": 0
        },
        {
          "k": "drop",
          "x": 56,
          "y": 72,
          "r": 2.5,
          "ink": 0
        }
      ],
      "seat": [
        50,
        86
      ],
      "water": "clear"
    }
  },
};
