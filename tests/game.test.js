const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng, buildQuestion, buildQuestions } = require('../src/game.js');
const { SYMBOLS } = require('../src/symbols.js');

test('buildQuestions: 同じシードなら全員に同じ問題・同じ選択肢順が出る', () => {
  const a = buildQuestions({ symbols: SYMBOLS, rounds: 10, rng: createRng(4242) });
  const b = buildQuestions({ symbols: SYMBOLS, rounds: 10, rng: createRng(4242) });
  assert.equal(a.length, 10);
  assert.deepEqual(
    a.map((q) => [q.type, q.symbol.id, q.choices, q.correctIndex]),
    b.map((q) => [q.type, q.symbol.id, q.choices, q.correctIndex])
  );
});

test('buildQuestions: シードが違えば問題が変わる', () => {
  const a = buildQuestions({ symbols: SYMBOLS, rounds: 10, rng: createRng(1) });
  const b = buildQuestions({ symbols: SYMBOLS, rounds: 10, rng: createRng(2) });
  assert.notDeepEqual(a.map((q) => q.symbol.id), b.map((q) => q.symbol.id));
});

test('buildQuestions: 各問題は4択で正解の位置が正しく、同じ記号は重複しない', () => {
  const qs = buildQuestions({ symbols: SYMBOLS, rounds: 10, rng: createRng(99) });
  const ids = new Set(qs.map((q) => q.symbol.id));
  assert.equal(ids.size, 10);
  qs.forEach((q) => {
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    const correctText = q.type === 'meaning' ? q.symbol.meaning : q.type === 'reading' ? q.symbol.reading : q.symbol.display;
    assert.equal(q.choices[q.correctIndex], correctText);
  });
});

test('buildQuestions: 問題数より記号が少ない場合は記号数までに収まる', () => {
  const few = SYMBOLS.slice(0, 6);
  const qs = buildQuestions({ symbols: few, rounds: 10, rng: createRng(5) });
  assert.equal(qs.length, 6);
});

test('buildQuestions: 選択肢を作れないほど記号が少ないとエラー', () => {
  assert.throws(() => buildQuestions({ symbols: SYMBOLS.slice(0, 3), rounds: 10, rng: createRng(5) }), /not enough symbols/);
});

const sym = (id) => SYMBOLS.find((x) => x.id === id);

test('symbol問題: 問題文は意味だけで、読み方(sub)は出さない', () => {
  for (const s of SYMBOLS) {
    const q = buildQuestion(SYMBOLS, s, 'symbol', createRng(3));
    assert.equal(q.prompt.main, s.meaning, s.id);
    assert.equal(q.prompt.sub, '', s.id);
  }
});

test('symbol問題: 意味が同じ記号(decresc./dim.、Adagio/Lento)は選択肢にあればどちらも正解', () => {
  for (const [a, b] of [['decresc', 'dim'], ['adagio', 'lento']]) {
    for (const [target, other] of [[a, b], [b, a]]) {
      let found = false;
      for (let seed = 0; seed < 500 && !found; seed++) {
        const q = buildQuestion(SYMBOLS, sym(target), 'symbol', createRng(seed));
        const oi = q.choices.indexOf(sym(other).display);
        if (oi < 0) continue;
        found = true;
        assert.deepEqual([...q.correctIndexes].sort(), [q.choices.indexOf(sym(target).display), oi].sort(), target);
      }
      assert.ok(found, `${target} の問題に ${other} が含まれるケースが生成されなかった`);
    }
  }
});

test('symbol問題: 意味が同じ記号が選択肢になければ正解は1つ', () => {
  const q = buildQuestion(SYMBOLS, sym('cresc'), 'symbol', createRng(2));
  assert.deepEqual(q.correctIndexes, [q.correctIndex]);
});

test('読み方問題: デクレシェンドの記号では、選択肢にあればディミヌエンドも正解インデックスに含まれる', () => {
  let q = null;
  for (let seed = 1; seed < 500 && !q; seed++) {
    const c = buildQuestion(SYMBOLS, sym('decresc'), 'reading', createRng(seed));
    if (c.choices.includes('ディミヌエンド')) q = c;
  }
  assert.ok(q, 'dim を含む問題が生成されなかった');
  assert.deepEqual([...q.correctIndexes].sort(), [q.choices.indexOf('デクレシェンド'), q.choices.indexOf('ディミヌエンド')].sort());
});

test('読み方問題: ディミヌエンドの記号ではデクレシェンドは正解にならない(alsoReads は片方向)', () => {
  for (let seed = 1; seed < 100; seed++) {
    const q = buildQuestion(SYMBOLS, sym('dim'), 'reading', createRng(seed));
    assert.deepEqual(q.correctIndexes, [q.correctIndex]);
  }
});

test('他の問題タイプ・他の記号では複数正解にならない', () => {
  assert.equal(buildQuestion(SYMBOLS, sym('decresc'), 'meaning', createRng(1)).correctIndexes.length, 1);
  for (const s of SYMBOLS.filter((x) => x.id !== 'decresc')) {
    const q = buildQuestion(SYMBOLS, s, 'reading', createRng(5));
    assert.deepEqual(q.correctIndexes, [q.correctIndex], s.id);
  }
});

test('データ: 意味文に文字化けしやすい Unicode 音楽記号(U+1D100〜1D1FF)を含めない', () => {
  for (const s of SYMBOLS) assert.doesNotMatch(s.meaning, /[\u{1D100}-\u{1D1FF}]/u, s.id);
  assert.equal(sym('ds').meaning, 'セーニョ記号のところから');
});

test('glyphs: ♯ ♭ ♮ は SVG で描かれる(♯は横線2+縦線2、♮は縦線2、♭は縦線1)', () => {
  const { svgFor } = require('../src/glyphs.js');
  const count = (svg, re) => (svg.match(re) || []).length;
  for (const id of ['sharp', 'flat', 'natural']) {
    const svg = svgFor(id);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/, id);
    assert.ok(svg.endsWith('</svg>'), id);
  }
  assert.equal(count(svgFor('sharp'), /<rect /g), 2);
  assert.equal(count(svgFor('sharp'), /<path /g), 2);
  assert.equal(count(svgFor('natural'), /<rect /g), 2);
  assert.equal(count(svgFor('flat'), /<rect /g), 1);
});
