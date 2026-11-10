import {
  barChart,
  clipLine,
  coordPlane,
  DASH,
  dotPlot,
  END,
  gdot,
  gx,
  gy,
  MID,
  plotLine,
  poly,
  rightMark,
  seg,
  svg,
  table,
  txt,
} from './figures';
import type { SeedTemplate } from './types';

const S = 'stroke="currentColor"';

// Markaziy burchakli aylana (O markaz, A o'ngda, B theta burchakda) — yoy va sektor shablonlari uchun
const BX = '{=150 + 80*cos(theta*pi/180)|int}';
const BY = '{=110 - 80*sin(theta*pi/180)|int}';
const circleLabels =
  `<circle cx="150" cy="110" r="3" fill="currentColor"/>` +
  txt(144, 126, 'O', END) +
  txt(238, 114, 'A') +
  txt('{=150 + 94*cos(theta*pi/180)|int}', '{=114 - 94*sin(theta*pi/180)|int}', 'B', MID) +
  txt('{=150 + 38*cos(theta*pi/360)|int}', '{=114 - 38*sin(theta*pi/360)|int}', '{theta}°', MID, 11) +
  txt(190, 127, '{r}', MID);

/** Rasmli Math shablonlari: geometriya chizmalari, koordinata grafiklari, diagramma va jadvallar. */
export const MATH_FIGURE_TEMPLATES: SeedTemplate[] = [
  // ───────────── Geometry & Trigonometry ─────────────
  {
    title: 'Pifagor teoremasi: gipotenuzani topish',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_TRIG',
    difficulty: 'EASY',
    spec: {
      stem: 'In the right triangle shown, $AC = {a}$ and $BC = {b}$. What is the length of $\\overline{AB}$?',
      svg: svg(
        300,
        200,
        poly('50,170 260,170 50,40') +
          rightMark(50, 170, 1, -1) +
          txt(40, 44, 'A', END) +
          txt(40, 186, 'C', END) +
          txt(266, 186, 'B') +
          txt(42, 110, '{a}', END) +
          txt(155, 190, '{b}', MID) +
          txt(162, 98, '?'),
      ),
      variables: [
        { name: 't', type: 'choice', options: ['3|4|5', '5|12|13', '8|15|17', '7|24|25', '20|21|29', '9|40|41'] },
        { name: 'k', type: 'int', min: 1, max: 3 },
      ],
      derived: [
        { name: 'a', expr: 'k * t' },
        { name: 'b', expr: 'k * t_1' },
        { name: 'c', expr: 'k * t_2' },
      ],
      answer: { kind: 'SPR', correct: 'c' },
      explanation:
        'By the Pythagorean theorem, $AB^2 = AC^2 + BC^2 = {a}^2 + {b}^2 = {=c^2}$, so $AB = \\sqrt{{=c^2}} = {c}$.',
    },
  },
  {
    title: "O'xshash uchburchaklar: parallel kesma",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the figure shown, $\\overline{DE}$ is parallel to $\\overline{BC}$, $AD = {p}$, $DB = {q}$, and $DE = {r}$. What is the length of $\\overline{BC}$?',
      svg: svg(
        300,
        212,
        poly('150,24 30,184 270,184') +
          seg('{=150 - 120*f|int}', '{=24 + 160*f|int}', '{=150 + 120*f|int}', '{=24 + 160*f|int}') +
          txt(150, 16, 'A', MID) +
          txt(24, 198, 'B', END) +
          txt(276, 198, 'C') +
          txt('{=150 - 120*f - 8|int}', '{=24 + 160*f + 4|int}', 'D', END) +
          txt('{=150 + 120*f + 8|int}', '{=24 + 160*f + 4|int}', 'E') +
          txt('{=150 - 60*f - 12|int}', '{=24 + 80*f + 4|int}', '{p}', END) +
          txt('{=90 - 60*f - 12|int}', '{=104 + 80*f + 4|int}', '{q}', END) +
          txt(150, '{=24 + 160*f - 6|int}', '{r}', MID) +
          txt(150, 202, '?', MID),
      ),
      variables: [
        { name: 'p', type: 'int', min: 2, max: 8 },
        { name: 'q', type: 'int', min: 1, max: 8 },
        { name: 'r', type: 'int', min: 2, max: 12 },
      ],
      derived: [
        { name: 'f', expr: 'p / (p + q)' },
        { name: 'bc', expr: 'r * (p + q) / p' },
      ],
      constraints: ['mod(r * (p + q), p) == 0'],
      answer: { kind: 'SPR', correct: 'bc' },
      explanation:
        'Because $\\overline{DE} \\parallel \\overline{BC}$, triangle $ADE$ is similar to triangle $ABC$, so $\\dfrac{DE}{BC} = \\dfrac{AD}{AB}$. This gives $\\dfrac{{r}}{BC} = \\dfrac{{p}}{{p} + {q}}$, so $BC = \\dfrac{{r}({=p + q})}{{p}} = {bc}$.',
    },
  },
  {
    title: "Teng yonli uchburchak: asosdagi burchak",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'EASY',
    spec: {
      stem: 'In triangle $ABC$ shown, $AB = AC$ and the measure of angle $A$ is ${x}^\\circ$. What is the measure, in degrees, of angle $B$? (Note: Figure not drawn to scale.)',
      svg: svg(
        300,
        204,
        poly('150,24 60,180 240,180') +
          seg(99.8, 99, 110.2, 105) +
          seg(200.2, 99, 189.8, 105) +
          txt(150, 16, 'A', MID) +
          txt(54, 194, 'B', END) +
          txt(246, 194, 'C') +
          txt(150, 62, '{x}°', MID, 12),
      ),
      variables: [{ name: 'x', type: 'int', min: 20, max: 140, step: 2 }],
      answer: { kind: 'SPR', correct: '(180 - x) / 2' },
      explanation:
        'Since $AB = AC$, the base angles $B$ and $C$ are equal. The angles of a triangle add up to $180^\\circ$, so angle $B$ measures $\\dfrac{180 - {x}}{2} = {answer}$ degrees.',
    },
  },
  {
    title: "Kesishgan to'g'ri chiziqlar: qo'shni burchak",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'EASY',
    spec: {
      stem: 'In the figure shown, two lines intersect at a point. What is the value of $y$? (Note: Figure not drawn to scale.)',
      svg: svg(
        300,
        214,
        seg(20, 110, 280, 110) + seg(80, 20, 220, 200) + txt(128, 102, '{x}°', END) + txt(172, 102, 'y°', 'font-style="italic"'),
      ),
      variables: [{ name: 'x', type: 'int', min: 25, max: 155, exclude: [90] }],
      answer: { kind: 'SPR', correct: '180 - x' },
      explanation:
        'The two labeled angles together form a straight angle, so they are supplementary: $y = 180 - {x} = {answer}$.',
    },
  },
  {
    title: 'Aylana yoyi uzunligi: markaziy burchak',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the circle shown, $O$ is the center, the radius is ${r}$, and the measure of central angle $AOB$ is ${theta}^\\circ$. What is the length of minor arc $AB$?',
      svg: svg(
        300,
        220,
        `<circle cx="150" cy="110" r="80" fill="none" ${S} stroke-width="2"/>` +
          seg(150, 110, 230, 110) +
          seg(150, 110, BX, BY) +
          `<path d="M 230 110 A 80 80 0 0 0 ${BX} ${BY}" fill="none" ${S} stroke-width="5"/>` +
          circleLabels,
      ),
      variables: [
        { name: 'theta', type: 'choice', options: [30, 40, 45, 60, 72, 90, 120, 135, 150] },
        { name: 'r', type: 'int', min: 2, max: 12 },
      ],
      derived: [{ name: 'L', expr: 'theta * r / 180' }],
      constraints: ['L != 1', 'theta * r / 360 != 1', 'theta * r^2 / 360 != 1', 'theta * r / 90 != 1'],
      answer: {
        kind: 'MCQ',
        correct: 'L',
        distractors: ['theta * r / 360', 'theta * r^2 / 360', 'theta * r / 90', '2 * r'],
        choiceTemplate: '${v|frac}\\pi$',
      },
      explanation:
        'An arc is the same fraction of the circumference as its central angle is of $360^\\circ$: $\\dfrac{{theta}}{360} \\cdot 2\\pi({r}) = {L|frac}\\pi$.',
    },
  },
  {
    title: "Sektor yuzi: bo'yalgan qism",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the circle shown, $O$ is the center and the radius is ${r}$. The measure of central angle $AOB$ is ${theta}^\\circ$. What is the area of the shaded region?',
      svg: svg(
        300,
        220,
        `<circle cx="150" cy="110" r="80" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M 150 110 L 230 110 A 80 80 0 0 0 ${BX} ${BY} Z" fill="currentColor" fill-opacity="0.3" ${S} stroke-width="2"/>` +
          circleLabels,
      ),
      variables: [
        { name: 'theta', type: 'choice', options: [30, 40, 45, 60, 72, 90, 120, 135, 150] },
        { name: 'r', type: 'int', min: 2, max: 12 },
      ],
      derived: [{ name: 'sa', expr: 'theta * r^2 / 360' }],
      constraints: ['sa != 1', 'theta * r / 180 != 1'],
      answer: {
        kind: 'MCQ',
        correct: 'sa',
        distractors: ['theta * r / 180', 'theta * r^2 / 180', 'r^2', 'theta * r^2 / 90'],
        choiceTemplate: '${v|frac}\\pi$',
      },
      explanation:
        'The shaded sector is $\\dfrac{{theta}}{360}$ of the whole circle, so its area is $\\dfrac{{theta}}{360} \\cdot \\pi({r})^2 = {sa|frac}\\pi$.',
    },
  },
  {
    title: 'Silindr hajmi',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_AREA',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The right circular cylinder shown has a radius of ${r}$ centimeters and a height of ${h}$ centimeters. What is the volume, in cubic centimeters, of the cylinder?',
      svg: svg(
        300,
        214,
        `<ellipse cx="150" cy="40" rx="80" ry="20" fill="none" ${S} stroke-width="2"/>` +
          seg(70, 40, 70, 180) +
          seg(230, 40, 230, 180) +
          `<path d="M 70 180 A 80 20 0 0 0 230 180" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M 70 180 A 80 20 0 0 1 230 180" fill="none" ${S} ${DASH}/>` +
          seg(150, 40, 230, 40, 'stroke-width="1.5"') +
          `<circle cx="150" cy="40" r="2.5" fill="currentColor"/>` +
          txt(190, 34, '{r} cm', MID, 12) +
          seg(250, 40, 250, 180, 'stroke-width="1"') +
          seg(245, 40, 255, 40, 'stroke-width="1"') +
          seg(245, 180, 255, 180, 'stroke-width="1"') +
          txt(258, 114, '{h} cm', '', 12),
      ),
      variables: [
        { name: 'r', type: 'int', min: 2, max: 9 },
        { name: 'h', type: 'int', min: 3, max: 15 },
      ],
      answer: {
        kind: 'MCQ',
        correct: 'r^2 * h',
        distractors: ['2 * r * h', 'r * h', '4 * r^2 * h', 'r^2 * h / 3'],
        choiceTemplate: '${v|frac}\\pi$',
      },
      explanation: 'The volume of a cylinder is $V = \\pi r^2 h = \\pi({r})^2({h}) = {=r^2 * h}\\pi$.',
    },
  },
  {
    title: 'Uchburchak yuzi: asos va balandlik',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_AREA',
    difficulty: 'EASY',
    spec: {
      stem: 'In the triangle shown, the base has length ${b}$ and the height, shown by the dashed segment, is ${h}$. What is the area of the triangle?',
      svg: svg(
        300,
        200,
        poly('30,170 270,170 110,40') +
          seg(110, 40, 110, 170, DASH) +
          rightMark(110, 170, 1, -1) +
          txt(150, 190, '{b}', MID) +
          txt(116, 112, '{h}'),
      ),
      variables: [
        { name: 'b', type: 'int', min: 4, max: 20 },
        { name: 'h', type: 'int', min: 3, max: 15 },
      ],
      constraints: ['mod(b * h, 2) == 0'],
      answer: { kind: 'SPR', correct: 'b * h / 2' },
      explanation:
        'The area of a triangle is $\\dfrac{1}{2} \\times \\text{base} \\times \\text{height} = \\dfrac{1}{2}({b})({h}) = {answer}$.',
    },
  },
  {
    title: '30°-60°-90° uchburchak: katta katet',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_TRIG',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In right triangle $PQR$ shown, the measure of angle $P$ is $30^\\circ$, angle $R$ is a right angle, and $QR = {s}$. What is the length of $\\overline{PR}$?',
      svg: svg(
        300,
        190,
        poly('40,160 230,160 230,50') +
          rightMark(230, 160, -1, -1) +
          txt(34, 176, 'P', END) +
          txt(236, 176, 'R') +
          txt(236, 48, 'Q') +
          txt(80, 154, '30°', '', 12) +
          txt(240, 110, '{s}') +
          txt(135, 178, '?', MID),
      ),
      variables: [{ name: 's', type: 'int', min: 2, max: 12 }],
      answer: { kind: 'MCQ', correct: '3 * s^2', distractors: ['4 * s^2', 's^2', '2 * s^2', '12 * s^2'], format: 'sqrt' },
      explanation:
        'In a $30^\\circ$-$60^\\circ$-$90^\\circ$ triangle, the side opposite the $30^\\circ$ angle is the shortest, and the side opposite the $60^\\circ$ angle is $\\sqrt{3}$ times as long. $QR = {s}$ is opposite angle $P$, so $PR = {s}\\sqrt{3}$.',
    },
  },
  {
    title: 'Trapetsiya yuzi',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_AREA',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the trapezoid shown, the parallel sides have lengths ${a}$ and ${b}$, and the distance between them, shown by the dashed segment, is ${h}$. What is the area of the trapezoid?',
      svg: svg(
        300,
        200,
        poly('30,170 270,170 210,60 90,60') +
          seg(90, 60, 90, 170, DASH) +
          rightMark(90, 170, 1, -1) +
          txt(150, 190, '{b}', MID) +
          txt(150, 52, '{a}', MID) +
          txt(96, 120, '{h}'),
      ),
      variables: [
        { name: 'a', type: 'int', min: 3, max: 12 },
        { name: 'b', type: 'int', min: 6, max: 20 },
        { name: 'h', type: 'int', min: 3, max: 12 },
      ],
      constraints: ['b >= a + 3', 'mod((a + b) * h, 2) == 0'],
      answer: { kind: 'SPR', correct: '(a + b) * h / 2' },
      explanation:
        'The area of a trapezoid is half the sum of the parallel sides times the height: $\\dfrac{1}{2}({a} + {b})({h}) = {answer}$.',
    },
  },

  // ───────────── Algebra & Advanced Math: grafiklar ─────────────
  {
    title: "Grafik bo'yicha qiyalik",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LINF',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The graph of the linear function $f$ is shown in the $xy$-plane. What is the slope of the graph?',
      svg: coordPlane(plotLine('l') + gdot('x1', 'y1') + gdot('x2', 'y2')),
      variables: [
        { name: 'x1', type: 'int', min: -5, max: -1 },
        { name: 'y1', type: 'int', min: -5, max: 5 },
        { name: 'x2', type: 'int', min: 1, max: 5 },
        { name: 'y2', type: 'int', min: -5, max: 5 },
      ],
      derived: [
        { name: 'sl', expr: '(y2 - y1) / (x2 - x1)' },
        { name: 'yi', expr: 'y1 - sl * x1' },
        ...clipLine('sl', 'yi', 'l'),
      ],
      constraints: ['y2 != y1'],
      answer: {
        kind: 'MCQ',
        correct: 'sl',
        distractors: ['(x2 - x1) / (y2 - y1)', '-sl', '-(x2 - x1) / (y2 - y1)', '(y2 + y1) / (x2 - x1)'],
        format: 'frac',
      },
      explanation:
        'The line passes through $({x1}, {y1})$ and $({x2}, {y2})$. Its slope is $\\dfrac{{y2} - ({y1})}{{x2} - ({x1})} = {sl|frac}$.',
    },
  },
  {
    title: "Grafikdagi to'g'ri chiziq tenglamasi",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN2',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'Which equation defines the line shown in the $xy$-plane?',
      svg: coordPlane(plotLine('l') + gdot('0', 'bb') + gdot('1', 'bb + m')),
      variables: [
        { name: 'm', type: 'choice', options: [-3, -2, -1, 1, 2, 3] },
        { name: 'bb', type: 'int', min: -4, max: 4 },
      ],
      derived: clipLine('m', 'bb', 'l'),
      constraints: ['bb != 0', 'bb != m', 'bb != -m', 'abs(bb + m) <= 5'],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          '$y = {m|coef}x {bb|signed}$',
          '$y = {bb|coef}x {m|signed}$',
          '$y = {=-m|coef}x {bb|signed}$',
          '$y = {m|coef}x {=-bb|signed}$',
        ],
      },
      explanation:
        'The line crosses the $y$-axis at $(0, {bb})$, so the $y$-intercept is ${bb}$. It also passes through $(1, {=bb + m})$, so its slope is ${=bb + m} - ({bb}) = {m}$. An equation of the line is $y = {m|coef}x {bb|signed}$.',
    },
  },
  {
    title: 'Grafikdan tenglamalar sistemasi yechimi',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_SYS',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The graphs of the two equations in a system of linear equations are shown in the $xy$-plane. If $(x, y)$ is the solution to the system, what is the value of $x + y$?',
      svg: coordPlane(plotLine('p') + plotLine('q')),
      variables: [
        { name: 'px', type: 'int', min: -4, max: 4 },
        { name: 'py', type: 'int', min: -4, max: 4 },
        { name: 'm1', type: 'choice', options: [1, 2, 3] },
        { name: 'm2', type: 'choice', options: [-1, -2, -3] },
      ],
      derived: [
        { name: 'c1', expr: 'py - m1 * px' },
        { name: 'c2', expr: 'py - m2 * px' },
        ...clipLine('m1', 'c1', 'p'),
        ...clipLine('m2', 'c2', 'q'),
      ],
      answer: { kind: 'SPR', correct: 'px + py' },
      explanation:
        'The solution to the system is the point where the two lines intersect. The lines intersect at $({px}, {py})$, so $x + y = {px} + ({py}) = {answer}$.',
    },
  },
  {
    title: 'Parabola grafigi: funksiyani tanlash',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'HARD',
    spec: {
      stem: 'The graph of $y = f(x)$ is shown, where $f$ is a quadratic function. Which of the following could define $f$?',
      svg: coordPlane(
        `<path d="M ${gx('xa')} ${gy('ya', 2)} Q ${gx('xc')} ${gy('yc', 2)} ${gx('xb')} ${gy('yb', 2)}" fill="none" ${S} stroke-width="2.5"/>` +
          gdot('r1', '0', 2) +
          gdot('r2', '0', 2),
        2,
      ),
      variables: [
        { name: 'r1', type: 'int', min: -5, max: -1 },
        { name: 'r2', type: 'int', min: 1, max: 5 },
      ],
      derived: [
        { name: 'xa', expr: 'max(-6, (r1 + r2 - sqrt((r2 - r1)^2 + 48)) / 2)' },
        { name: 'xb', expr: 'min(6, (r1 + r2 + sqrt((r2 - r1)^2 + 48)) / 2)' },
        { name: 'ya', expr: '(xa - r1) * (xa - r2)' },
        { name: 'yb', expr: '(xb - r1) * (xb - r2)' },
        { name: 'xc', expr: '(xa + xb) / 2' },
        { name: 'yc', expr: 'ya + (2 * xa - r1 - r2) * (xb - xa) / 2' },
      ],
      constraints: ['r2 - r1 <= 6', 'r1 != -r2'],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          '$f(x) = (x {=-r1|signed})(x {=-r2|signed})$',
          '$f(x) = (x {r1|signed})(x {r2|signed})$',
          '$f(x) = -(x {=-r1|signed})(x {=-r2|signed})$',
          '$f(x) = (x {=-r1|signed})(x {r2|signed})$',
        ],
      },
      explanation:
        'The graph crosses the $x$-axis at $x = {r1}$ and $x = {r2}$, so $f(x)$ has the factors $(x {=-r1|signed})$ and $(x {=-r2|signed})$. The parabola opens upward, so the leading coefficient is positive: $f(x) = (x {=-r1|signed})(x {=-r2|signed})$.',
    },
  },

  // ───────────── Problem-Solving & Data Analysis: diagramma va jadvallar ─────────────
  {
    title: "Ustunli diagramma: eng ko'p va eng kam farqi",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'EASY',
    spec: {
      stem: 'The bar graph shows the number of books each of five students read last month. How many more books did the student who read the most books read than the student who read the fewest books?',
      svg: barChart({
        cats: ['Aziz', 'Bella', 'Carlos', 'Dilnoza', 'Emma'],
        values: ['v1', 'v2', 'v3', 'v4', 'v5'],
        max: 12,
        step: 1,
        labelStep: 2,
        title: 'Books read last month',
      }),
      variables: [
        { name: 'v1', type: 'int', min: 1, max: 12 },
        { name: 'v2', type: 'int', min: 1, max: 12 },
        { name: 'v3', type: 'int', min: 1, max: 12 },
        { name: 'v4', type: 'int', min: 1, max: 12 },
        { name: 'v5', type: 'int', min: 1, max: 12 },
      ],
      derived: [
        { name: 'hi', expr: 'max(v1, v2, v3, v4, v5)' },
        { name: 'lo', expr: 'min(v1, v2, v3, v4, v5)' },
      ],
      constraints: ['hi - lo >= 3'],
      answer: { kind: 'SPR', correct: 'hi - lo' },
      explanation:
        'From the graph, the greatest number of books is ${hi}$ and the least is ${lo}$. The difference is ${hi} - {lo} = {answer}$.',
    },
  },
  {
    title: "Ustunli diagramma: o'rtacha qiymat",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The bar graph shows the number of hours {name} volunteered during each of five weeks. What is the mean number of hours {name} volunteered per week?',
      svg: barChart({
        cats: ['1', '2', '3', '4', '5'],
        values: ['w1', 'w2', 'w3', 'w4', 'w5'],
        max: 12,
        step: 1,
        labelStep: 2,
        title: 'Hours volunteered',
        xTitle: 'Week',
      }),
      variables: [
        { name: 'name', type: 'choice', options: ['Laylo', 'Marcus', 'Sofia', 'Javohir'] },
        { name: 'w1', type: 'int', min: 2, max: 12 },
        { name: 'w2', type: 'int', min: 2, max: 12 },
        { name: 'w3', type: 'int', min: 2, max: 12 },
        { name: 'w4', type: 'int', min: 2, max: 12 },
        { name: 'w5', type: 'int', min: 2, max: 12 },
      ],
      constraints: ['mod(w1 + w2 + w3 + w4 + w5, 5) == 0'],
      answer: { kind: 'SPR', correct: '(w1 + w2 + w3 + w4 + w5) / 5' },
      explanation:
        'The mean is the total divided by the number of weeks: $\\dfrac{{w1} + {w2} + {w3} + {w4} + {w5}}{5} = \\dfrac{{=w1 + w2 + w3 + w4 + w5}}{5} = {answer}$.',
    },
  },
  {
    title: "Ustunli diagramma: foiz o'sishi",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_PCT',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The bar graph shows the number of members in a school robotics club in 2022 and in 2023. By what percent did the number of members increase from 2022 to 2023?',
      svg: barChart({
        cats: ['2022', '2023'],
        values: ['a', 'b'],
        max: 80,
        step: 10,
        labelStep: 20,
        title: 'Robotics club members',
        valueLabels: true,
      }),
      variables: [
        { name: 'a', type: 'choice', options: [10, 20, 25, 40, 50] },
        { name: 'pct', type: 'choice', options: [10, 20, 30, 40, 50, 60, 80, 100] },
      ],
      derived: [{ name: 'b', expr: 'a * (100 + pct) / 100' }],
      constraints: ['b == round(b)', 'b <= 80'],
      answer: {
        kind: 'MCQ',
        correct: 'pct',
        distractors: ['(b - a) / b * 100', 'b - a', 'b / a * 100'],
        choiceTemplate: '${v|r1}\\%$',
      },
      explanation:
        'Percent increase $= \\dfrac{\\text{new} - \\text{original}}{\\text{original}} \\times 100 = \\dfrac{{b} - {a}}{{a}} \\times 100 = {pct}\\%$.',
    },
  },
  {
    title: 'Ikki tomonlama jadval: shartli ehtimollik',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_PROB',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The table shows how {total} students answered a survey about whether they prefer print books or e-books. If one of the grade 10 students is selected at random, what is the probability that the student prefers e-books?',
      svg: table(
        [
          ['', 'Print', 'E-book', 'Total'],
          ['Grade 9', '{a}', '{b}', '{=a + b}'],
          ['Grade 10', '{c}', '{d}', '{=c + d}'],
          ['Total', '{=a + c}', '{=b + d}', '{total}'],
        ],
        [86, 68, 72, 68],
      ),
      variables: [
        { name: 'a', type: 'int', min: 10, max: 35 },
        { name: 'b', type: 'int', min: 8, max: 30 },
        { name: 'c', type: 'int', min: 10, max: 35 },
        { name: 'd', type: 'int', min: 8, max: 30 },
      ],
      derived: [{ name: 'total', expr: 'a + b + c + d' }],
      constraints: ['c != d', 'b != c'],
      answer: {
        kind: 'MCQ',
        correct: 'd / (c + d)',
        distractors: ['d / total', 'd / (b + d)', 'c / (c + d)', '(b + d) / total'],
        format: 'frac',
      },
      explanation:
        'Only the grade 10 row matters. There are ${=c + d}$ students in grade 10, and ${d}$ of them prefer e-books, so the probability is $\\dfrac{{d}}{{=c + d}} = {answer|frac}$.',
    },
  },
  {
    title: 'Nuqtali diagramma: mediana',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The dot plot shows the number of siblings reported by each student in a class. What is the median number of siblings?',
      svg: dotPlot({
        counts: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'],
        labels: ['0', '1', '2', '3', '4', '5'],
        maxDots: 6,
        title: 'Number of siblings',
      }),
      variables: [
        { name: 'c0', type: 'int', min: 1, max: 5 },
        { name: 'c1', type: 'int', min: 1, max: 6 },
        { name: 'c2', type: 'int', min: 1, max: 6 },
        { name: 'c3', type: 'int', min: 0, max: 5 },
        { name: 'c4', type: 'int', min: 0, max: 4 },
        { name: 'c5', type: 'int', min: 0, max: 3 },
      ],
      derived: [
        { name: 'n', expr: 'c0 + c1 + c2 + c3 + c4 + c5' },
        { name: 'k', expr: '(n + 1) / 2' },
        { name: 's1', expr: 'c0 + c1' },
        { name: 's2', expr: 's1 + c2' },
        { name: 's3', expr: 's2 + c3' },
        { name: 's4', expr: 's3 + c4' },
        { name: 'med', expr: 'c0 >= k ? 0 : (s1 >= k ? 1 : (s2 >= k ? 2 : (s3 >= k ? 3 : (s4 >= k ? 4 : 5))))' },
      ],
      constraints: ['mod(n, 2) == 1', 'n >= 9'],
      answer: { kind: 'SPR', correct: 'med' },
      explanation:
        'Each dot is one student, so there are ${n}$ students. The median is the ${k}$th value when the data are in order. Counting dots from the left, the ${k}$th value is ${med}$.',
    },
  },
];
