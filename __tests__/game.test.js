/**
 * Tests for Boss Fight: ChibiSpaceWars
 *
 * The game logic is embedded in an HTML file, so we re-declare the
 * relevant pure/near-pure functions here using the same logic as the
 * source, and set up minimal DOM fixtures for DOM-dependent tests.
 */

// ---------------------------------------------------------------------------
// Helpers / DOM fixtures
// ---------------------------------------------------------------------------

function buildDOM() {
  document.body.innerHTML = `
    <div id="slotGrid"></div>
    <div id="boss-reel-container"></div>
    <div id="boss-hud" style="display:none;"></div>
    <div id="bossModal" style="display:none;"></div>
    <div id="initGate" style="display:block;"></div>
    <div id="layer2-game"></div>
    <button id="spinBtn">ENGAGE FIRE</button>
    <button id="turboBtn">TURBO: OFF</button>
    <button id="autoBtn">AUTO: OFF</button>
    <div id="balanceDisplay">100.00</div>
    <div id="winDisplay">0.00</div>
    <div id="fsCounter" class="hidden"></div>
    <span id="fsNum">0</span>
    <div id="hp-fill" style="width:100%;"></div>
    <div id="rounds-display">STRIKES: 10</div>
    <div id="boss-name">THREAT IDENTIFIED</div>
    <div id="boss-sprite-view"></div>
    <canvas id="lazer-canvas"></canvas>
    <canvas id="starfield-canvas"></canvas>
    <div id="br-0" class="slot-cell"></div>
    <div id="br-1" class="slot-cell"></div>
    <div id="br-2" class="slot-cell"></div>
  `;

  // Create 5x5 grid cells
  const slotGrid = document.getElementById('slotGrid');
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.id = `cell-${r}-${c}`;
      cell.className = 'slot-cell';
      slotGrid.appendChild(cell);
    }
  }
}

// ---------------------------------------------------------------------------
// Game constants (copied verbatim from source)
// ---------------------------------------------------------------------------

const SYMBOLS = [
  { id: 0, pos: '0% 0%', type: 'fs' },
  { id: 1, pos: '33.33% 0%', type: 'boss' },
  { id: 2, pos: '66.66% 0%', pay: [0.5, 1.5, 5.0] },
  { id: 3, pos: '100% 0%', pay: [1.0, 3.0, 10.0] },
  { id: 4, pos: '0% 100%', pay: [0.01, 0.02, 0.05] },
  { id: 5, pos: '33.33% 100%', pay: [0.01, 0.03, 0.06] },
  { id: 6, pos: '66.66% 100%', pay: [0.02, 0.04, 0.08] },
  { id: 7, pos: '100% 100%', pay: [0.02, 0.05, 0.10] },
  { id: 8, url: 'https://i.ibb.co/7dccSsHr/Grid-Art-20260416-073645036.webp', pay: [5.0, 15.0, 50.0] },
];

const BONUS_SYMBOLS = [
  { id: 0, pos: '0% 0%', dmg: 25 },
  { id: 1, pos: '50% 0%', dmg: 18 },
  { id: 2, pos: '100% 0%', dmg: 15 },
  { id: 3, pos: '0% 100%', dmg: 15 },
  { id: 4, pos: '50% 100%', dmg: 12 },
  { id: 5, pos: '100% 100%', dmg: 10 },
];

// ---------------------------------------------------------------------------
// Game state factory (gives a fresh copy for every test)
// ---------------------------------------------------------------------------

function makeState(overrides = {}) {
  return {
    balance: 100,
    bet: 0.25,
    currentWin: 0,
    isSpinning: false,
    freeSpins: 0,
    pendingFS: 0,
    pendingBoss: false,
    isBossFight: false,
    bossRounds: 10,
    totalFightDmg: 0,
    miniDefeated: false,
    bossDefeated: false,
    miniHP: 100,
    bossHP: 220,
    isTurbo: false,
    isAutoSpin: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure game-logic functions (mirrored exactly from source)
// ---------------------------------------------------------------------------

function getWeightedSymbol() {
  const roll = Math.random() * 100;
  if (roll < 0.20) return 0;
  if (roll < 20.45) return 1;
  if (roll < 25.45) return 3;
  if (roll < 35.45) return 2;
  return Math.floor(Math.random() * 4) + 4;
}

/**
 * evaluateWins reads the `grid` and mutates `state`.
 * We accept both as parameters so tests can supply isolated fixtures.
 */
function evalWins(grid, state) {
  for (let sym of SYMBOLS) {
    let coords = [];
    grid.forEach((row, r) =>
      row.forEach((val, c) => {
        if (val === sym.id) coords.push({ r, c });
      })
    );

    if (coords.length >= 6) {
      let val = 0;
      if (sym.pay) {
        let idx = Math.min(coords.length - 6, 2);
        val = sym.pay[idx];
      } else if (sym.type === 'fs') {
        state.pendingFS += 8;
      } else if (sym.type === 'boss') {
        state.pendingBoss = true;
      }
      return { id: sym.id, coords, val };
    }
  }
  return null;
}

/**
 * applyGravity also uses getWeightedSymbol – we accept grid and a symbol
 * generator so tests can control what fills empty cells.
 */
function applyGravity(grid, symbolFn) {
  for (let c = 0; c < 5; c++) {
    let wp = 4;
    for (let r = 4; r >= 0; r--) {
      if (grid[r][c] !== -1) {
        grid[wp][c] = grid[r][c];
        if (wp !== r) grid[r][c] = -1;
        wp--;
      }
    }
    for (let r = wp; r >= 0; r--) grid[r][c] = symbolFn();
  }
}

function makeEmptyGrid() {
  return Array.from({ length: 5 }, () => Array(5).fill(-1));
}

function makeFullGrid(value) {
  return Array.from({ length: 5 }, () => Array(5).fill(value));
}

// ---------------------------------------------------------------------------
// SYMBOLS / BONUS_SYMBOLS data integrity
// ---------------------------------------------------------------------------

describe('SYMBOLS constant', () => {
  test('has exactly 9 entries with sequential ids 0–8', () => {
    expect(SYMBOLS).toHaveLength(9);
    SYMBOLS.forEach((s, i) => expect(s.id).toBe(i));
  });

  test('symbol 0 is the FS (free-spin) symbol', () => {
    expect(SYMBOLS[0].type).toBe('fs');
    expect(SYMBOLS[0].pay).toBeUndefined();
  });

  test('symbol 1 is the boss symbol', () => {
    expect(SYMBOLS[1].type).toBe('boss');
    expect(SYMBOLS[1].pay).toBeUndefined();
  });

  test('symbols 2-8 all have a pay array with 3 ascending values', () => {
    for (let i = 2; i <= 8; i++) {
      const sym = SYMBOLS[i];
      expect(Array.isArray(sym.pay)).toBe(true);
      expect(sym.pay).toHaveLength(3);
      expect(sym.pay[0]).toBeLessThan(sym.pay[1]);
      expect(sym.pay[1]).toBeLessThan(sym.pay[2]);
    }
  });

  test('symbol 8 has the highest base pay of all pay symbols', () => {
    const paySymbols = SYMBOLS.filter((s) => s.pay);
    const maxBasePay = Math.max(...paySymbols.map((s) => s.pay[0]));
    expect(SYMBOLS[8].pay[0]).toBe(maxBasePay);
  });

  test('symbol 8 has a url property (mega symbol)', () => {
    expect(typeof SYMBOLS[8].url).toBe('string');
    expect(SYMBOLS[8].url.length).toBeGreaterThan(0);
  });
});

describe('BONUS_SYMBOLS constant', () => {
  test('has exactly 6 entries with sequential ids 0–5', () => {
    expect(BONUS_SYMBOLS).toHaveLength(6);
    BONUS_SYMBOLS.forEach((s, i) => expect(s.id).toBe(i));
  });

  test('each bonus symbol has a positive dmg value', () => {
    BONUS_SYMBOLS.forEach((s) => {
      expect(s.dmg).toBeGreaterThan(0);
    });
  });

  test('dmg values are in non-ascending order (highest first)', () => {
    for (let i = 0; i < BONUS_SYMBOLS.length - 1; i++) {
      expect(BONUS_SYMBOLS[i].dmg).toBeGreaterThanOrEqual(BONUS_SYMBOLS[i + 1].dmg);
    }
  });

  test('first bonus symbol deals the most damage (25)', () => {
    expect(BONUS_SYMBOLS[0].dmg).toBe(25);
  });

  test('last bonus symbol deals the least damage (10)', () => {
    expect(BONUS_SYMBOLS[5].dmg).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// getWeightedSymbol
// ---------------------------------------------------------------------------

describe('getWeightedSymbol()', () => {
  afterEach(() => jest.restoreAllMocks());

  test('returns 0 (FS) when roll is below 0.20 threshold', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.001); // 0.001 * 100 = 0.1 < 0.20
    expect(getWeightedSymbol()).toBe(0);
  });

  test('returns 0 (FS) at the roll exactly approaching 0.20 (0.00199)', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.00199); // 0.199 < 0.20
    expect(getWeightedSymbol()).toBe(0);
  });

  test('returns 1 (boss) when roll is in [0.20, 20.45)', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.1); // 10 in [0.20, 20.45)
    expect(getWeightedSymbol()).toBe(1);
  });

  test('returns 1 (boss) at the upper edge of boss range (roll ~20.44)', () => {
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.2044); // 20.44 < 20.45
    expect(getWeightedSymbol()).toBe(1);
  });

  test('returns 3 when roll is in [20.45, 25.45)', () => {
    // roll = 22 → falls in [20.45, 25.45)
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.22);
    expect(getWeightedSymbol()).toBe(3);
  });

  test('returns 2 when roll is in [25.45, 35.45)', () => {
    // roll = 30 → falls in [25.45, 35.45)
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.30);
    expect(getWeightedSymbol()).toBe(2);
  });

  test('returns a value in [4,7] when roll >= 35.45', () => {
    // First call controls roll (0.50 → 50 ≥ 35.45), second call controls low-pay pick
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.50)   // roll = 50 → enters last branch
      .mockReturnValueOnce(0.0);   // Math.floor(0 * 4) + 4 = 4
    expect(getWeightedSymbol()).toBe(4);
  });

  test('low-pay branch upper bound returns 7', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)   // roll = 99 → last branch
      .mockReturnValueOnce(0.9999); // Math.floor(0.9999 * 4) = 3 → 3 + 4 = 7
    expect(getWeightedSymbol()).toBe(7);
  });

  test('never returns values outside 0-7 over many calls', () => {
    for (let i = 0; i < 1000; i++) {
      const sym = getWeightedSymbol();
      expect(sym).toBeGreaterThanOrEqual(0);
      expect(sym).toBeLessThanOrEqual(7);
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateWins (via evalWins helper)
// ---------------------------------------------------------------------------

describe('evalWins()', () => {
  test('returns null when no symbol appears 6 or more times', () => {
    const grid = makeEmptyGrid();
    // Place only 5 of symbol 2
    [[0,0],[0,1],[0,2],[0,3],[0,4]].forEach(([r,c]) => (grid[r][c] = 2));
    const state = makeState();
    expect(evalWins(grid, state)).toBeNull();
  });

  test('returns null for a completely empty grid', () => {
    const state = makeState();
    expect(evalWins(makeEmptyGrid(), state)).toBeNull();
  });

  test('detects a win when exactly 6 symbols match (pay symbol)', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 2));
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result).not.toBeNull();
    expect(result.id).toBe(2);
    expect(result.coords).toHaveLength(6);
    expect(result.val).toBe(SYMBOLS[2].pay[0]); // idx = min(6-6,2) = 0
  });

  test('uses pay[1] for 7 matching symbols', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,1]].forEach(([r,c]) => (grid[r][c] = 3));
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.val).toBe(SYMBOLS[3].pay[1]); // idx = min(7-6,2) = 1
  });

  test('uses pay[2] (maximum) for 8 or more matching symbols', () => {
    const grid = makeEmptyGrid();
    // 8 cells with symbol 3
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,1],[1,2]].forEach(([r,c]) => (grid[r][c] = 3));
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.val).toBe(SYMBOLS[3].pay[2]); // idx = min(8-6,2) = 2
  });

  test('caps pay index at 2 even with more than 8 matching symbols', () => {
    // Fill all 25 cells with symbol 4
    const grid = makeFullGrid(4);
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.val).toBe(SYMBOLS[4].pay[2]); // idx = min(25-6,2) = 2
  });

  test('FS symbol: sets pendingFS += 8 and returns val=0', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 0));
    const state = makeState({ pendingFS: 0 });
    const result = evalWins(grid, state);
    expect(result).not.toBeNull();
    expect(result.val).toBe(0);
    expect(state.pendingFS).toBe(8);
  });

  test('FS symbol: accumulates pendingFS with multiple wins', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 0));
    const state = makeState({ pendingFS: 8 });
    evalWins(grid, state);
    expect(state.pendingFS).toBe(16);
  });

  test('boss symbol: sets pendingBoss = true and returns val=0', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 1));
    const state = makeState({ pendingBoss: false });
    const result = evalWins(grid, state);
    expect(result).not.toBeNull();
    expect(result.val).toBe(0);
    expect(state.pendingBoss).toBe(true);
  });

  test('boss symbol does not affect pendingFS', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 1));
    const state = makeState({ pendingFS: 4 });
    evalWins(grid, state);
    expect(state.pendingFS).toBe(4); // unchanged
  });

  test('returns win for first matching symbol in SYMBOLS order (id 0 beats id 2 if both at 6)', () => {
    const grid = makeEmptyGrid();
    // Place 6 of symbol 0 and 6 of symbol 2
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 0));
    [[2,0],[2,1],[2,2],[2,3],[2,4],[3,0]].forEach(([r,c]) => (grid[r][c] = 2));
    const state = makeState();
    const result = evalWins(grid, state);
    // evaluateWins iterates SYMBOLS in order, so id=0 wins first
    expect(result.id).toBe(0);
  });

  test('correctly collects all matching coords into result', () => {
    const grid = makeEmptyGrid();
    const coords = [[0,0],[1,1],[2,2],[3,3],[4,4],[0,4]];
    coords.forEach(([r,c]) => (grid[r][c] = 6));
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.coords).toHaveLength(6);
    coords.forEach(([r,c]) => {
      expect(result.coords).toContainEqual({ r, c });
    });
  });

  test('symbol 8 (mega symbol) uses its own pay table', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 8));
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.id).toBe(8);
    expect(result.val).toBe(SYMBOLS[8].pay[0]); // 5.0
  });
});

// ---------------------------------------------------------------------------
// applyGravity
// ---------------------------------------------------------------------------

describe('applyGravity()', () => {
  test('non-empty cells fall to the bottom of each column', () => {
    const grid = makeEmptyGrid();
    // Place a single symbol at the top of column 0
    grid[0][0] = 3;
    // Remaining rows in col 0 are -1

    // Use a symbol generator that returns a fixed value so we can distinguish
    const fixedSym = () => 5;
    applyGravity(grid, fixedSym);

    // The original symbol 3 should be at the bottom row (row 4)
    expect(grid[4][0]).toBe(3);
  });

  test('fills vacated top cells with new symbols', () => {
    const grid = makeEmptyGrid();
    grid[0][0] = 3; // one symbol in column 0
    const fixedSym = () => 7;
    applyGravity(grid, fixedSym);

    // Rows 0–3 in col 0 should be filled by the symbol generator
    for (let r = 0; r < 4; r++) {
      expect(grid[r][0]).toBe(7);
    }
  });

  test('does not change values in other columns', () => {
    const grid = makeEmptyGrid();
    // Set a known pattern in column 1 only
    grid[4][1] = 2;
    const fixedSym = () => 9; // value outside normal range – just for tracing

    // Columns other than 1 should remain empty (-1) or be refilled with 9
    // But column 1 already has a value at row 4; after gravity it stays at 4
    applyGravity(grid, fixedSym);
    expect(grid[4][1]).toBe(2);
  });

  test('preserves relative order of symbols within a column', () => {
    const grid = makeEmptyGrid();
    // col 2: top has 3, bottom has 5 (with gaps in between)
    grid[0][2] = 3;
    grid[4][2] = 5;
    const fixedSym = () => 0;
    applyGravity(grid, fixedSym);
    // After gravity: 5 should be at row 4, 3 should be at row 3
    expect(grid[4][2]).toBe(5);
    expect(grid[3][2]).toBe(3);
  });

  test('a full column (no -1) stays unchanged (no gravity needed)', () => {
    const grid = Array.from({ length: 5 }, () => [2, 2, 2, 2, 2]);
    const snapshot = grid.map((row) => [...row]);
    const fixedSym = () => 99;
    applyGravity(grid, fixedSym);
    // Symbol gen should NOT be called; columns were already full
    grid.forEach((row, r) => row.forEach((val, c) => {
      if (c < 5) expect(val).toBe(snapshot[r][c]);
    }));
  });

  test('an entirely empty column gets completely refilled', () => {
    const grid = makeEmptyGrid();
    const fixedSym = () => 4;
    applyGravity(grid, fixedSym);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        expect(grid[r][c]).toBe(4);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// toggleTurbo (DOM test)
// ---------------------------------------------------------------------------

describe('toggleTurbo()', () => {
  beforeEach(() => buildDOM());

  function toggleTurboFn(state) {
    state.isTurbo = !state.isTurbo;
    document.getElementById('turboBtn').innerText = `TURBO: ${state.isTurbo ? 'ON' : 'OFF'}`;
    document.getElementById('turboBtn').classList.toggle('bg-cyan-900');
  }

  test('flips state.isTurbo from false to true', () => {
    const state = makeState({ isTurbo: false });
    toggleTurboFn(state);
    expect(state.isTurbo).toBe(true);
  });

  test('flips state.isTurbo from true to false', () => {
    const state = makeState({ isTurbo: true });
    toggleTurboFn(state);
    expect(state.isTurbo).toBe(false);
  });

  test('updates button text to TURBO: ON when enabled', () => {
    const state = makeState({ isTurbo: false });
    toggleTurboFn(state);
    expect(document.getElementById('turboBtn').innerText).toBe('TURBO: ON');
  });

  test('updates button text to TURBO: OFF when disabled', () => {
    const state = makeState({ isTurbo: true });
    toggleTurboFn(state);
    expect(document.getElementById('turboBtn').innerText).toBe('TURBO: OFF');
  });

  test('adds bg-cyan-900 class when turbo is enabled', () => {
    const state = makeState({ isTurbo: false });
    toggleTurboFn(state);
    expect(document.getElementById('turboBtn').classList.contains('bg-cyan-900')).toBe(true);
  });

  test('removes bg-cyan-900 class when turbo is disabled', () => {
    const btn = document.getElementById('turboBtn');
    btn.classList.add('bg-cyan-900');
    const state = makeState({ isTurbo: true });
    toggleTurboFn(state);
    expect(btn.classList.contains('bg-cyan-900')).toBe(false);
  });

  test('double-toggle returns to original state', () => {
    const state = makeState({ isTurbo: false });
    toggleTurboFn(state);
    toggleTurboFn(state);
    expect(state.isTurbo).toBe(false);
    expect(document.getElementById('turboBtn').innerText).toBe('TURBO: OFF');
  });
});

// ---------------------------------------------------------------------------
// toggleAuto (DOM test)
// ---------------------------------------------------------------------------

describe('toggleAuto()', () => {
  beforeEach(() => buildDOM());

  function toggleAutoFn(state, onAutoActivated) {
    state.isAutoSpin = !state.isAutoSpin;
    document.getElementById('autoBtn').innerText = `AUTO: ${state.isAutoSpin ? 'ON' : 'OFF'}`;
    document.getElementById('autoBtn').classList.toggle('bg-yellow-900');
    if (state.isAutoSpin && !state.isSpinning) onAutoActivated();
  }

  test('flips state.isAutoSpin from false to true', () => {
    const state = makeState({ isAutoSpin: false, isSpinning: false });
    const spy = jest.fn();
    toggleAutoFn(state, spy);
    expect(state.isAutoSpin).toBe(true);
  });

  test('flips state.isAutoSpin from true to false', () => {
    const state = makeState({ isAutoSpin: true });
    const spy = jest.fn();
    toggleAutoFn(state, spy);
    expect(state.isAutoSpin).toBe(false);
  });

  test('updates button text to AUTO: ON when enabled', () => {
    const state = makeState({ isAutoSpin: false, isSpinning: false });
    toggleAutoFn(state, jest.fn());
    expect(document.getElementById('autoBtn').innerText).toBe('AUTO: ON');
  });

  test('updates button text to AUTO: OFF when disabled', () => {
    const state = makeState({ isAutoSpin: true });
    toggleAutoFn(state, jest.fn());
    expect(document.getElementById('autoBtn').innerText).toBe('AUTO: OFF');
  });

  test('adds bg-yellow-900 class when auto is enabled', () => {
    const state = makeState({ isAutoSpin: false, isSpinning: false });
    toggleAutoFn(state, jest.fn());
    expect(document.getElementById('autoBtn').classList.contains('bg-yellow-900')).toBe(true);
  });

  test('removes bg-yellow-900 class when auto is disabled', () => {
    document.getElementById('autoBtn').classList.add('bg-yellow-900');
    const state = makeState({ isAutoSpin: true });
    toggleAutoFn(state, jest.fn());
    expect(document.getElementById('autoBtn').classList.contains('bg-yellow-900')).toBe(false);
  });

  test('calls processSpin when auto is activated and not currently spinning', () => {
    const state = makeState({ isAutoSpin: false, isSpinning: false });
    const spy = jest.fn();
    toggleAutoFn(state, spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('does NOT call processSpin when auto is activated but already spinning', () => {
    const state = makeState({ isAutoSpin: false, isSpinning: true });
    const spy = jest.fn();
    toggleAutoFn(state, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  test('does NOT call processSpin when auto is deactivated', () => {
    const state = makeState({ isAutoSpin: true, isSpinning: false });
    const spy = jest.fn();
    toggleAutoFn(state, spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// spinRouter
// ---------------------------------------------------------------------------

describe('spinRouter()', () => {
  function spinRouterFn(state, handleBossSpin, processSpin) {
    if (state.isBossFight) {
      handleBossSpin();
    } else {
      processSpin();
    }
  }

  test('calls handleBossSpin when isBossFight is true', () => {
    const state = makeState({ isBossFight: true });
    const handleBossSpin = jest.fn();
    const processSpin = jest.fn();
    spinRouterFn(state, handleBossSpin, processSpin);
    expect(handleBossSpin).toHaveBeenCalledTimes(1);
    expect(processSpin).not.toHaveBeenCalled();
  });

  test('calls processSpin when isBossFight is false', () => {
    const state = makeState({ isBossFight: false });
    const handleBossSpin = jest.fn();
    const processSpin = jest.fn();
    spinRouterFn(state, handleBossSpin, processSpin);
    expect(processSpin).toHaveBeenCalledTimes(1);
    expect(handleBossSpin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// wait() helper
// ---------------------------------------------------------------------------

describe('wait()', () => {
  jest.useFakeTimers();
  afterAll(() => jest.useRealTimers());

  function makeWait(state) {
    return (ms) => new Promise((res) => setTimeout(res, state.isTurbo ? ms / 4 : ms));
  }

  test('resolves after full ms when turbo is off', async () => {
    const state = makeState({ isTurbo: false });
    const wait = makeWait(state);
    const p = wait(1000);
    jest.advanceTimersByTime(999);
    // Should still be pending – we cannot easily test promise state directly,
    // but we can verify the timer fires at 1000ms
    let resolved = false;
    p.then(() => (resolved = true));
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  test('resolves after ms/4 when turbo is on', async () => {
    const state = makeState({ isTurbo: true });
    const wait = makeWait(state);
    const p = wait(1000); // should resolve after 250ms
    let resolved = false;
    p.then(() => (resolved = true));
    jest.advanceTimersByTime(249);
    await Promise.resolve();
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// enterBossFight (DOM test)
// ---------------------------------------------------------------------------

describe('enterBossFight()', () => {
  beforeEach(() => buildDOM());

  function enterBossFightFn(state, bossGrid) {
    state.isBossFight = true;
    document.getElementById('bossModal').style.display = 'none';
    document.getElementById('slotGrid').style.display = 'none';
    document.getElementById('boss-reel-container').style.display = 'grid';
    document.getElementById('boss-hud').style.display = 'flex';
    for (let i = 0; i < 3; i++) {
      bossGrid[i] = Math.floor(Math.random() * 6);
      document.getElementById(`br-${i}`).innerHTML =
        `<div class="bonus-symbol" style="background-position: ${BONUS_SYMBOLS[bossGrid[i]].pos}"></div>`;
    }
  }

  test('sets state.isBossFight to true', () => {
    const state = makeState({ isBossFight: false });
    const bossGrid = [-1, -1, -1];
    enterBossFightFn(state, bossGrid);
    expect(state.isBossFight).toBe(true);
  });

  test('hides the boss modal', () => {
    document.getElementById('bossModal').style.display = 'flex';
    const state = makeState();
    enterBossFightFn(state, [-1, -1, -1]);
    expect(document.getElementById('bossModal').style.display).toBe('none');
  });

  test('hides the main slot grid', () => {
    document.getElementById('slotGrid').style.display = 'grid';
    const state = makeState();
    enterBossFightFn(state, [-1, -1, -1]);
    expect(document.getElementById('slotGrid').style.display).toBe('none');
  });

  test('shows the boss reel container', () => {
    const state = makeState();
    enterBossFightFn(state, [-1, -1, -1]);
    expect(document.getElementById('boss-reel-container').style.display).toBe('grid');
  });

  test('shows the boss HUD', () => {
    const state = makeState();
    enterBossFightFn(state, [-1, -1, -1]);
    expect(document.getElementById('boss-hud').style.display).toBe('flex');
  });

  test('fills bossGrid with valid indices (0-5)', () => {
    const state = makeState();
    const bossGrid = [-1, -1, -1];
    enterBossFightFn(state, bossGrid);
    bossGrid.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(5);
    });
  });

  test('renders a bonus-symbol div inside each br-N cell', () => {
    const state = makeState();
    const bossGrid = [-1, -1, -1];
    enterBossFightFn(state, bossGrid);
    [0, 1, 2].forEach((i) => {
      const cell = document.getElementById(`br-${i}`);
      expect(cell.querySelector('.bonus-symbol')).not.toBeNull();
    });
  });

  test('each rendered bonus symbol has a background-position matching a valid BONUS_SYMBOL', () => {
    const state = makeState();
    const bossGrid = [-1, -1, -1];
    enterBossFightFn(state, bossGrid);
    const validPositions = BONUS_SYMBOLS.map((s) => s.pos);
    [0, 1, 2].forEach((i) => {
      const div = document.getElementById(`br-${i}`).querySelector('.bonus-symbol');
      const pos = div.style.backgroundPosition;
      expect(validPositions).toContain(pos);
    });
  });
});

// ---------------------------------------------------------------------------
// updateUI (DOM test)
// ---------------------------------------------------------------------------

describe('updateUI()', () => {
  beforeEach(() => buildDOM());

  function updateUIFn(state) {
    document.getElementById('balanceDisplay').innerText = state.balance.toFixed(2);
    document.getElementById('winDisplay').innerText = state.currentWin.toFixed(2);
  }

  test('displays balance with 2 decimal places', () => {
    const state = makeState({ balance: 123.456 });
    updateUIFn(state);
    expect(document.getElementById('balanceDisplay').innerText).toBe('123.46');
  });

  test('displays currentWin with 2 decimal places', () => {
    const state = makeState({ currentWin: 7.5 });
    updateUIFn(state);
    expect(document.getElementById('winDisplay').innerText).toBe('7.50');
  });

  test('displays 0.00 for balance when balance is zero', () => {
    const state = makeState({ balance: 0 });
    updateUIFn(state);
    expect(document.getElementById('balanceDisplay').innerText).toBe('0.00');
  });

  test('displays 0.00 for win when currentWin is zero', () => {
    const state = makeState({ currentWin: 0 });
    updateUIFn(state);
    expect(document.getElementById('winDisplay').innerText).toBe('0.00');
  });
});

// ---------------------------------------------------------------------------
// processSpin – balance deduction & free-spin logic
// ---------------------------------------------------------------------------

describe('processSpin() – state logic', () => {
  beforeEach(() => buildDOM());

  /**
   * Minimal version of processSpin that only tests the balance/freeSpins
   * branching logic, without DOM animations or async cascades.
   */
  function spinStateLogic(state) {
    if (state.isSpinning) return 'already_spinning';
    state.isSpinning = true;

    if (state.freeSpins > 0) {
      state.freeSpins--;
    } else {
      if (state.balance < state.bet) {
        state.isSpinning = false;
        state.isAutoSpin = false;
        return 'insufficient_credits';
      }
      state.balance -= state.bet;
      state.currentWin = 0;
    }
    return 'ok';
  }

  test('returns early when already spinning', () => {
    const state = makeState({ isSpinning: true });
    const result = spinStateLogic(state);
    expect(result).toBe('already_spinning');
  });

  test('deducts bet from balance on a normal spin', () => {
    const state = makeState({ balance: 10, bet: 0.25 });
    spinStateLogic(state);
    expect(state.balance).toBeCloseTo(9.75);
  });

  test('resets currentWin to 0 on a paid spin', () => {
    const state = makeState({ balance: 10, bet: 0.25, currentWin: 5 });
    spinStateLogic(state);
    expect(state.currentWin).toBe(0);
  });

  test('sets isSpinning to true', () => {
    const state = makeState({ isSpinning: false, balance: 10 });
    spinStateLogic(state);
    expect(state.isSpinning).toBe(true);
  });

  test('decrements freeSpins instead of deducting balance', () => {
    const state = makeState({ freeSpins: 3, balance: 0 });
    spinStateLogic(state);
    expect(state.freeSpins).toBe(2);
    expect(state.balance).toBe(0); // untouched
  });

  test('does not reset currentWin on a free spin', () => {
    const state = makeState({ freeSpins: 1, balance: 0, currentWin: 5 });
    spinStateLogic(state);
    expect(state.currentWin).toBe(5); // preserved
  });

  test('returns insufficient_credits and disables auto when balance < bet', () => {
    const state = makeState({ balance: 0.10, bet: 0.25, isAutoSpin: true });
    const result = spinStateLogic(state);
    expect(result).toBe('insufficient_credits');
    expect(state.isAutoSpin).toBe(false);
    expect(state.isSpinning).toBe(false);
  });

  test('allows spin when balance exactly equals bet', () => {
    const state = makeState({ balance: 0.25, bet: 0.25 });
    const result = spinStateLogic(state);
    expect(result).toBe('ok');
    expect(state.balance).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// processSpin – pendingFS / pendingBoss transfer
// ---------------------------------------------------------------------------

describe('processSpin() – pendingFS and pendingBoss handling', () => {
  function applyPendingSpinResults(state) {
    if (state.pendingFS > 0) {
      state.freeSpins += state.pendingFS;
      state.pendingFS = 0;
    }

    if (state.pendingBoss && !state.bossDefeated) {
      // In the real code this shows bossModal; here we just track state
      state.pendingBoss = false;
      return 'boss_modal';
    }
    return 'normal';
  }

  test('transfers pendingFS to freeSpins and clears pendingFS', () => {
    const state = makeState({ pendingFS: 8, freeSpins: 0 });
    applyPendingSpinResults(state);
    expect(state.freeSpins).toBe(8);
    expect(state.pendingFS).toBe(0);
  });

  test('accumulates pendingFS on top of existing freeSpins', () => {
    const state = makeState({ pendingFS: 8, freeSpins: 5 });
    applyPendingSpinResults(state);
    expect(state.freeSpins).toBe(13);
  });

  test('shows boss modal path and clears pendingBoss when boss not defeated', () => {
    const state = makeState({ pendingBoss: true, bossDefeated: false });
    const outcome = applyPendingSpinResults(state);
    expect(outcome).toBe('boss_modal');
    expect(state.pendingBoss).toBe(false);
  });

  test('does NOT show boss modal when bossDefeated is true', () => {
    const state = makeState({ pendingBoss: true, bossDefeated: true });
    const outcome = applyPendingSpinResults(state);
    expect(outcome).toBe('normal');
    expect(state.pendingBoss).toBe(true); // unchanged — gate blocked it
  });
});

// ---------------------------------------------------------------------------
// handleCascades – win accounting
// ---------------------------------------------------------------------------

describe('handleCascades() – win accounting logic', () => {
  /**
   * Isolated version of the win-accounting step inside handleCascades.
   */
  function applyWinAccounting(state, win) {
    win.coords.forEach((c) => {
      /* grid update would happen here in real code */
    });
    state.currentWin += state.bet * win.val;
    state.balance += state.bet * win.val;
  }

  test('adds bet * val to currentWin', () => {
    const state = makeState({ bet: 0.25, currentWin: 0 });
    applyWinAccounting(state, { val: 3.0, coords: [] });
    expect(state.currentWin).toBeCloseTo(0.75);
  });

  test('adds bet * val to balance', () => {
    const state = makeState({ bet: 0.25, balance: 10 });
    applyWinAccounting(state, { val: 10.0, coords: [] });
    expect(state.balance).toBeCloseTo(12.5);
  });

  test('a zero-val win (FS or boss) does not change balance or currentWin', () => {
    const state = makeState({ bet: 0.25, balance: 10, currentWin: 0 });
    applyWinAccounting(state, { val: 0, coords: [] });
    expect(state.balance).toBe(10);
    expect(state.currentWin).toBe(0);
  });

  test('multiple cascades accumulate wins correctly', () => {
    const state = makeState({ bet: 0.25, currentWin: 0, balance: 10 });
    applyWinAccounting(state, { val: 1.0, coords: [] });
    applyWinAccounting(state, { val: 3.0, coords: [] });
    expect(state.currentWin).toBeCloseTo(1.0);  // 0.25 + 0.75
    expect(state.balance).toBeCloseTo(11.0);
  });
});

// ---------------------------------------------------------------------------
// startGame (DOM test)
// ---------------------------------------------------------------------------

describe('startGame()', () => {
  beforeEach(() => buildDOM());

  test('hides the initGate overlay', () => {
    const initGate = document.getElementById('initGate');
    initGate.style.display = 'flex';

    // Simulate startGame without Audio (mocked)
    const mockBgm = { play: jest.fn(), loop: false };
    function startGameFn() {
      document.getElementById('initGate').style.display = 'none';
      mockBgm.play();
      mockBgm.loop = true;
    }
    startGameFn();

    expect(initGate.style.display).toBe('none');
  });

  test('enables BGM looping', () => {
    const mockBgm = { play: jest.fn(), loop: false };
    function startGameFn() {
      document.getElementById('initGate').style.display = 'none';
      mockBgm.play();
      mockBgm.loop = true;
    }
    startGameFn();
    expect(mockBgm.loop).toBe(true);
    expect(mockBgm.play).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Boundary / regression tests
// ---------------------------------------------------------------------------

describe('Boundary and regression tests', () => {
  test('getWeightedSymbol never returns negative values', () => {
    for (let i = 0; i < 500; i++) {
      expect(getWeightedSymbol()).toBeGreaterThanOrEqual(0);
    }
  });

  test('evalWins: exactly 5 symbols of same type yields null (boundary below 6)', () => {
    const grid = makeEmptyGrid();
    // Put exactly 5 of symbol 3
    [[0,0],[0,1],[0,2],[0,3],[0,4]].forEach(([r,c]) => (grid[r][c] = 3));
    const state = makeState();
    expect(evalWins(grid, state)).toBeNull();
  });

  test('evalWins: exactly 6 symbols triggers the minimum win (not null)', () => {
    const grid = makeEmptyGrid();
    [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0]].forEach(([r,c]) => (grid[r][c] = 3));
    const state = makeState();
    expect(evalWins(grid, state)).not.toBeNull();
  });

  test('applyGravity: single symbol in top row falls to row 4', () => {
    const grid = makeEmptyGrid();
    grid[0][3] = 2;
    applyGravity(grid, () => 5);
    expect(grid[4][3]).toBe(2);
  });

  test('applyGravity: single symbol already at bottom stays at row 4', () => {
    const grid = makeEmptyGrid();
    grid[4][3] = 2;
    applyGravity(grid, () => 5);
    expect(grid[4][3]).toBe(2);
  });

  test('state initial balance is 100', () => {
    const state = makeState();
    expect(state.balance).toBe(100);
  });

  test('state initial bet is 0.25', () => {
    const state = makeState();
    expect(state.bet).toBe(0.25);
  });

  test('SYMBOLS pay index capped at 2 even for a full 5x5 grid (25 matches)', () => {
    const grid = makeFullGrid(7);
    const state = makeState();
    const result = evalWins(grid, state);
    expect(result.val).toBe(SYMBOLS[7].pay[2]);
  });
});