import { DASH, dotPlotPair, END, MID, seg, svg, txt } from './figures';
import type { SeedTemplate } from './types';

const S = 'stroke="currentColor"';

// Ichki chizilgan burchak shakli: A va C aylana tepasida, B pastda (markaziy burchak AOC = 2x)
const AX = '{=150 + 80*sin(x*pi/180)|int}';
const CX = '{=150 - 80*sin(x*pi/180)|int}';
const ACY = '{=110 - 80*cos(x*pi/180)|int}';

/** Qiyin (HARD) Math shablonlari: ko'p bosqichli fikrlash, parametrli tenglamalar, murakkab jismlar. */
export const MATH_HARD_TEMPLATES: SeedTemplate[] = [
  // ───────────── Algebra ─────────────
  {
    title: 'Yechimsiz sistema: parametrni topish',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_SYS',
    difficulty: 'HARD',
    spec: {
      stem: '$$\\begin{aligned} {a}x + ky &= {c1} \\\\ {=m*a}x + {=m*b}y &= {c2} \\end{aligned}$$ In the system of equations above, $k$ is a constant. For what value of $k$ does the system have no solution?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 6 },
        { name: 'b', type: 'int', min: 2, max: 9 },
        { name: 'm', type: 'int', min: 2, max: 4 },
        { name: 'c1', type: 'int', min: 1, max: 12 },
        { name: 'c2', type: 'int', min: 1, max: 40 },
      ],
      constraints: ['c2 != m * c1'],
      answer: { kind: 'SPR', correct: 'b' },
      explanation:
        'A system of two linear equations has no solution when the lines are parallel and distinct: the coefficients of $x$ and $y$ are proportional, but the constants are not. The second equation\'s $x$-coefficient is ${m}$ times ${a}$, so its $y$-coefficient must be ${m}$ times $k$: ${=m*b} = {m}k$, which gives $k = {b}$. Since ${c2} \\ne {m} \\cdot {c1}$, the lines are distinct, so the system has no solution.',
    },
  },
  {
    title: "Cheksiz ko'p yechimli tenglama",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN1',
    difficulty: 'HARD',
    spec: {
      stem: '$${k}(px - {r}) = {=k*P}x - q$$ In the equation above, $p$ and $q$ are constants. If the equation has infinitely many solutions, what is the value of $p + q$?',
      variables: [
        { name: 'k', type: 'int', min: 2, max: 6 },
        { name: 'P', type: 'int', min: 2, max: 7 },
        { name: 'r', type: 'int', min: 2, max: 9 },
      ],
      answer: { kind: 'SPR', correct: 'P + k*r' },
      explanation:
        'Expanding the left side gives ${k}px - {=k*r}$. An equation has infinitely many solutions when both sides are identical, so the coefficients of $x$ and the constants must match: ${k}p = {=k*P}$, so $p = {P}$, and $q = {=k*r}$. Therefore $p + q = {P} + {=k*r} = {answer}$.',
    },
  },
  {
    title: "Tengsizlik: yuk mashinasining sig'imi",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_INEQ',
    difficulty: 'HARD',
    spec: {
      stem: 'A delivery truck can carry a maximum load of {W} kilograms. The truck is already carrying {n} boxes that each weigh {a} kilograms. Each additional crate weighs {c} kilograms. What is the maximum number of crates the truck can carry in addition to the boxes?',
      variables: [
        { name: 'W', type: 'choice', options: [1200, 1500, 1800, 2000, 2500] },
        { name: 'n', type: 'int', min: 10, max: 40 },
        { name: 'a', type: 'int', min: 15, max: 30 },
        { name: 'c', type: 'int', min: 35, max: 70 },
      ],
      derived: [
        { name: 'room', expr: 'W - n*a' },
        { name: 'ans', expr: 'floor(room / c)' },
      ],
      constraints: ['room > 3*c', 'mod(room, c) != 0'],
      answer: { kind: 'SPR', correct: 'ans' },
      explanation:
        'The boxes weigh ${n} \\times {a} = {=n*a}$ kilograms, so at most ${W} - {=n*a} = {room}$ kilograms remain. If $x$ is the number of crates, then ${c}x \\le {room}$, so $x \\le {=room/c|r2}$. The number of crates must be a whole number, so the maximum is ${ans}$.',
    },
  },
  {
    title: "Chiziqli funksiya: o'zgarish sur'ati",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LINF',
    difficulty: 'HARD',
    spec: {
      stem: 'For the linear function $f$, $f(x + {d}) = f(x) {inc|signed}$ for all values of $x$, and $f({x0}) = {y0}$. What is the value of $f({x1})$?',
      variables: [
        { name: 'd', type: 'int', min: 2, max: 4 },
        { name: 'sl', type: 'int', min: -4, max: 5, exclude: [0] },
        { name: 'x0', type: 'int', min: -3, max: 3 },
        { name: 'y0', type: 'int', min: -10, max: 10 },
        { name: 'x1', type: 'int', min: 4, max: 12 },
      ],
      derived: [
        { name: 'inc', expr: 'd * sl' },
        { name: 'y1', expr: 'y0 + sl * (x1 - x0)' },
      ],
      answer: { kind: 'SPR', correct: 'y1' },
      explanation:
        'Increasing $x$ by ${d}$ changes $f(x)$ by ${inc}$, so the slope of $f$ is $\\dfrac{{inc}}{{d}} = {sl}$. Then $f({x1}) = f({x0}) + {sl}\\bigl({x1} - ({x0})\\bigr) = {y0} + ({=sl*(x1 - x0)}) = {y1}$.',
    },
  },

  // ───────────── Advanced Math ─────────────
  {
    title: 'Bitta haqiqiy yechim: diskriminant',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EQ',
    difficulty: 'HARD',
    spec: {
      stem: 'In the equation ${a|coef}x^2 - kx + {c} = 0$, $k$ is a positive constant. If the equation has exactly one real solution, what is the value of $k$?',
      variables: [
        { name: 'sa', type: 'choice', options: [1, 2, 3] },
        { name: 'n', type: 'int', min: 2, max: 9 },
      ],
      derived: [
        { name: 'a', expr: 'sa^2' },
        { name: 'c', expr: 'n^2' },
      ],
      answer: { kind: 'SPR', correct: '2 * sa * n' },
      explanation:
        'A quadratic equation has exactly one real solution when its discriminant is zero: $k^2 - 4({a})({c}) = 0$. So $k^2 = {=4*a*c}$, and because $k$ is positive, $k = \\sqrt{{=4*a*c}} = {answer}$.',
    },
  },
  {
    title: "Yechimlar yig'indisi: (x − a)(x + b) = c",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EQ',
    difficulty: 'HARD',
    spec: {
      stem: 'What is the sum of the solutions to the equation $(x - {a})(x + {b}) = {c}$?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 9 },
        { name: 'b', type: 'int', min: 1, max: 9 },
        { name: 'c', type: 'int', min: 2, max: 30 },
      ],
      constraints: ['a != b'],
      answer: { kind: 'SPR', correct: 'a - b' },
      explanation:
        'The right side is not zero, so the factors cannot be set equal to zero. Expanding gives $x^2 + ({=b - a})x - {=a*b} = {c}$, or $x^2 + ({=b - a})x - {=a*b + c} = 0$. For $x^2 + Bx + C = 0$, the sum of the solutions is $-B$, so the sum is ${answer}$.',
    },
  },
  {
    title: "Ko'rsatkichli funksiya: asosni topish",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'HARD',
    spec: {
      stem: 'The function $f$ is defined by $f(x) = a \\cdot b^x$, where $a$ and $b$ are positive constants. If $f({x1}) = {y1}$ and $f({x2}) = {y2}$, what is the value of $b$?',
      variables: [
        { name: 'A', type: 'int', min: 2, max: 9 },
        { name: 'B', type: 'int', min: 2, max: 4 },
        { name: 'x1', type: 'int', min: 1, max: 2 },
        { name: 'gap', type: 'choice', options: [2, 3] },
      ],
      derived: [
        { name: 'x2', expr: 'x1 + gap' },
        { name: 'y1', expr: 'A * B^x1' },
        { name: 'y2', expr: 'A * B^x2' },
      ],
      constraints: ['y2 <= 5000'],
      answer: { kind: 'SPR', correct: 'B' },
      explanation:
        'Dividing the two values eliminates $a$: $\\dfrac{f({x2})}{f({x1})} = b^{{gap}} = \\dfrac{{y2}}{{y1}} = {=y2/y1}$. Since $b$ is positive, $b = {B}$.',
    },
  },
  {
    title: 'Kvadrat funksiyaning eng kichik qiymati',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'HARD',
    spec: {
      stem: 'The function $f$ is defined by $f(x) = x^2 - {=2*h}x + k$, where $k$ is a constant. If the minimum value of $f(x)$ is ${m}$, what is the value of $k$?',
      variables: [
        { name: 'h', type: 'int', min: 2, max: 9 },
        { name: 'm', type: 'int', min: -20, max: 20 },
      ],
      answer: { kind: 'SPR', correct: 'm + h^2' },
      explanation:
        'Completing the square gives $f(x) = (x - {h})^2 + k - {=h^2}$. The minimum value occurs at $x = {h}$ and equals $k - {=h^2}$. Setting $k - {=h^2} = {m}$ gives $k = {answer}$.',
    },
  },
  {
    title: "Ekvivalent ifodalar: mumkin bo'lgan qiymat",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EXPR',
    difficulty: 'HARD',
    spec: {
      stem: 'In the equation $(ax + {m})(bx + {n}) = {P}x^2 + cx + {=m*n}$, $a$, $b$, and $c$ are constants, and the equation is true for all values of $x$. If $a + b = {S}$, which of the following could be the value of $c$?',
      variables: [
        { name: 'a0', type: 'int', min: 1, max: 5 },
        { name: 'b0', type: 'int', min: 2, max: 7 },
        { name: 'm', type: 'int', min: 1, max: 9 },
        { name: 'n', type: 'int', min: 1, max: 9 },
      ],
      derived: [
        { name: 'P', expr: 'a0 * b0' },
        { name: 'S', expr: 'a0 + b0' },
        { name: 'c1', expr: 'a0*n + m*b0' },
        { name: 'c2', expr: 'b0*n + m*a0' },
      ],
      constraints: [
        'a0 != b0',
        'm != n',
        'm*n != c1',
        'm*n != c2',
        'P + m*n != c1',
        'P + m*n != c2',
        'm + n != c1',
        'm + n != c2',
      ],
      answer: { kind: 'MCQ', correct: 'c1', distractors: ['(m + n) * S', 'P + m*n', 'm*n', 'm + n'] },
      explanation:
        'Expanding gives $abx^2 + ({n}a + {m}b)x + {=m*n}$, so $ab = {P}$ and $c = {n}a + {m}b$. Since $ab = {P}$ and $a + b = {S}$, the numbers $a$ and $b$ are ${a0}$ and ${b0}$ in some order. So $c$ is either ${n}({a0}) + {m}({b0}) = {c1}$ or ${n}({b0}) + {m}({a0}) = {c2}$. Only ${c1}$ is among the choices.',
    },
  },

  // ───────────── Problem-Solving & Data Analysis ─────────────
  {
    title: "Ketma-ket foiz o'zgarishi: boshlang'ich narx",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_PCT',
    difficulty: 'HARD',
    spec: {
      stem: 'The price of a jacket was increased by {p}%, and then the new price was decreased by {q}%. The final price of the jacket was \\${F}. What was the original price, in dollars, of the jacket?',
      variables: [
        { name: 'O', type: 'choice', options: [40, 60, 80, 100, 120, 160, 200, 240] },
        { name: 'p', type: 'choice', options: [10, 20, 25, 50] },
        { name: 'q', type: 'choice', options: [10, 20, 25, 40] },
      ],
      derived: [{ name: 'F', expr: 'O * (100 + p) * (100 - q) / 10000' }],
      constraints: ['F == round(F)', 'p != q', '(100 + p) * (100 - q) != 10000'],
      answer: { kind: 'SPR', correct: 'O' },
      explanation:
        'If the original price is $x$ dollars, the price after both changes is $x(1 + {=p/100})(1 - {=q/100}) = {=(100 + p)*(100 - q)/10000}x$. Solving ${=(100 + p)*(100 - q)/10000}x = {F}$ gives $x = {O}$. Note that a {p}% increase followed by a {q}% decrease is not the same as a single change of {=p - q}%.',
    },
  },
  {
    title: "O'rtacha qiymat: qo'shilgan o'quvchilar",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'HARD',
    spec: {
      stem: 'The mean score of {n1} students on a quiz was {m1} points. After {n2} more students took the same quiz, the mean score of all {=n1 + n2} students was {M} points. What was the mean score, in points, of the {n2} additional students?',
      variables: [
        { name: 'n1', type: 'int', min: 8, max: 20 },
        { name: 'n2', type: 'choice', options: [2, 3, 4, 5, 6] },
        { name: 'm1', type: 'int', min: 62, max: 82 },
        { name: 'dlt', type: 'int', min: -2, max: 2, exclude: [0] },
      ],
      derived: [
        { name: 'M', expr: 'm1 + dlt' },
        { name: 'm2', expr: '(M * (n1 + n2) - n1 * m1) / n2' },
      ],
      constraints: ['m2 == round(m2)', 'm2 <= 100', 'm2 >= 30'],
      answer: { kind: 'SPR', correct: 'm2' },
      explanation:
        'The first {n1} students scored ${n1} \\times {m1} = {=n1*m1}$ points in total, and all {=n1 + n2} students scored ${=n1 + n2} \\times {M} = {=(n1 + n2)*M}$ points. So the {n2} new students scored ${=(n1 + n2)*M} - {=n1*m1} = {=(n1 + n2)*M - n1*m1}$ points, and their mean is $\\dfrac{{=(n1 + n2)*M - n1*m1}}{{n2}} = {m2}$.',
    },
  },
  {
    title: "Birliklarni almashtirish: to'ldirish tezligi",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_RATIO',
    difficulty: 'HARD',
    spec: {
      stem: 'A machine fills {b} bottles every {m} minutes. Each bottle holds {vol} milliliters. At this rate, how many liters of liquid does the machine put into bottles in {h} hours? (1 liter = 1,000 milliliters)',
      variables: [
        { name: 'b', type: 'int', min: 10, max: 60 },
        { name: 'm', type: 'choice', options: [2, 3, 4, 5, 6] },
        { name: 'vol', type: 'choice', options: [250, 500, 750, 1000] },
        { name: 'h', type: 'int', min: 2, max: 8 },
      ],
      derived: [
        { name: 'bottles', expr: 'b * 60 * h / m' },
        { name: 'L', expr: 'bottles * vol / 1000' },
      ],
      constraints: ['L == round(L)'],
      answer: { kind: 'SPR', correct: 'L' },
      explanation:
        'In {h} hours there are ${=60*h}$ minutes, so the machine fills $\\dfrac{{b}}{{m}} \\times {=60*h} = {bottles}$ bottles. That is ${bottles} \\times {vol} = {=bottles*vol}$ milliliters, which is $\\dfrac{{=bottles*vol}}{1000} = {L}$ liters.',
    },
  },
  {
    title: 'Ikki nuqtali diagramma: standart chetlanish',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'HARD',
    spec: {
      stem: 'The dot plots show the scores of the students in Group A and Group B on a 5-point quiz. Which of the following statements is true?',
      svg: dotPlotPair({
        a: ['1', 'ay', 'az', 'ay', '1'],
        b: ['bu', 'bv', '1', 'bv', 'bu'],
        labels: ['1', '2', '3', '4', '5'],
        names: ['Group A', 'Group B'],
        title: 'Quiz score',
      }),
      variables: [
        { name: 'ay', type: 'int', min: 2, max: 3 },
        { name: 'az', type: 'int', min: 4, max: 6 },
        { name: 'bu', type: 'int', min: 3, max: 5 },
        { name: 'bv', type: 'int', min: 1, max: 2 },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'The standard deviation of the scores in Group A is less than the standard deviation of the scores in Group B.',
          'The standard deviation of the scores in Group A is greater than the standard deviation of the scores in Group B.',
          'The mean score of Group A is greater than the mean score of Group B.',
          'The range of the scores in Group A is greater than the range of the scores in Group B.',
        ],
      },
      explanation:
        'Both groups are symmetric around 3, so their means are equal, and both range from 1 to 5, so their ranges are equal. In Group A most scores are at or near 3, while Group B has many scores at 1 and 5, far from the mean. Data that are more spread out from the mean have a larger standard deviation, so Group A has the smaller standard deviation.',
    },
  },

  // ───────────── Geometry & Trigonometry ─────────────
  {
    title: "Aylana tenglamasi: to'liq kvadratga keltirish",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'HARD',
    spec: {
      stem: 'The equation of a circle in the $xy$-plane is $x^2 + y^2 {=-2*h|signedcoef}x {=-2*k|signedcoef}y = {C}$. What is the radius of the circle?',
      variables: [
        { name: 'h', type: 'int', min: -6, max: 6, exclude: [0] },
        { name: 'k', type: 'int', min: -6, max: 6, exclude: [0] },
        { name: 'r', type: 'int', min: 2, max: 9 },
      ],
      derived: [{ name: 'C', expr: 'r^2 - h^2 - k^2' }],
      answer: { kind: 'SPR', correct: 'r' },
      explanation:
        'Complete the square for $x$ and for $y$ by adding ${=h^2}$ and ${=k^2}$ to both sides: $(x {=-h|signed})^2 + (y {=-k|signed})^2 = {C} + {=h^2} + {=k^2} = {=r^2}$. The radius is $\\sqrt{{=r^2}} = {r}$.',
    },
  },
  {
    title: 'Murakkab jism hajmi: silindr va yarim shar',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_AREA',
    difficulty: 'HARD',
    spec: {
      stem: 'The solid shown consists of a right circular cylinder and a hemisphere. The cylinder and the hemisphere each have a radius of ${r}$ centimeters, and the height of the cylinder is ${h}$ centimeters. What is the volume, in cubic centimeters, of the solid?',
      svg: svg(
        300,
        250,
        `<path d="M 70 100 A 80 80 0 0 1 230 100" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M 70 100 A 80 20 0 0 0 230 100" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M 70 100 A 80 20 0 0 1 230 100" fill="none" ${S} ${DASH}/>` +
          seg(70, 100, 70, 220) +
          seg(230, 100, 230, 220) +
          `<path d="M 70 220 A 80 20 0 0 0 230 220" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M 70 220 A 80 20 0 0 1 230 220" fill="none" ${S} ${DASH}/>` +
          seg(150, 100, 230, 100, DASH) +
          `<circle cx="150" cy="100" r="2.5" fill="currentColor"/>` +
          txt(192, 113, '{r} cm', MID, 11) +
          seg(252, 100, 252, 220, 'stroke-width="1"') +
          seg(247, 100, 257, 100, 'stroke-width="1"') +
          seg(247, 220, 257, 220, 'stroke-width="1"') +
          txt(260, 164, '{h} cm', '', 12),
      ),
      variables: [
        { name: 'r', type: 'int', min: 2, max: 6 },
        { name: 'h', type: 'int', min: 3, max: 12 },
      ],
      answer: {
        kind: 'MCQ',
        correct: 'r^2*h + 2*r^3/3',
        distractors: ['r^2*h + 4*r^3/3', 'r^2*h', 'r^2*h + r^3/3', '2*r*h + 2*r^3/3'],
        choiceTemplate: '${v|frac}\\pi$',
      },
      explanation:
        'The cylinder has volume $\\pi r^2 h = \\pi({r})^2({h}) = {=r^2*h}\\pi$. A hemisphere is half of a sphere, so its volume is $\\dfrac{1}{2} \\cdot \\dfrac{4}{3}\\pi r^3 = \\dfrac{2}{3}\\pi({r})^3 = {=2*r^3/3|frac}\\pi$. The total volume is ${=r^2*h + 2*r^3/3|frac}\\pi$.',
    },
  },
  {
    title: 'Ichki chizilgan burchak va yoy uzunligi',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'HARD',
    spec: {
      stem: 'Points $A$, $B$, and $C$ lie on the circle shown, which has center $O$ and a radius of ${r}$. The measure of angle $ABC$ is ${x}^\\circ$. What is the length of minor arc $AC$?',
      svg: svg(
        300,
        220,
        `<circle cx="150" cy="110" r="80" fill="none" ${S} stroke-width="2"/>` +
          `<path d="M ${AX} ${ACY} A 80 80 0 0 0 ${CX} ${ACY}" fill="none" ${S} stroke-width="5"/>` +
          seg(150, 190, AX, ACY) +
          seg(150, 190, CX, ACY) +
          `<circle cx="150" cy="110" r="3" fill="currentColor"/>` +
          txt(157, 106, 'O') +
          txt(`{=150 + 80*sin(x*pi/180) + 8|int}`, ACY, 'A') +
          txt(`{=150 - 80*sin(x*pi/180) - 8|int}`, ACY, 'C', END) +
          txt(150, 207, 'B', MID) +
          txt(150, 146, '{x}°', MID, 11),
      ),
      variables: [
        { name: 'x', type: 'choice', options: [30, 36, 40, 45, 60, 72] },
        { name: 'r', type: 'int', min: 2, max: 12 },
      ],
      derived: [{ name: 'L', expr: 'x * r / 90' }],
      constraints: ['L != 1', 'x * r / 180 != 1', 'x * r / 45 != 1', 'x * r^2 / 180 != 1'],
      answer: {
        kind: 'MCQ',
        correct: 'L',
        distractors: ['x * r / 180', 'x * r / 45', 'x * r^2 / 180', '2 * r'],
        choiceTemplate: '${v|frac}\\pi$',
      },
      explanation:
        'An inscribed angle is half of the central angle that intercepts the same arc, so central angle $AOC$ measures $2 \\times {x} = {=2*x}^\\circ$. The length of minor arc $AC$ is $\\dfrac{{=2*x}}{360} \\cdot 2\\pi({r}) = {L|frac}\\pi$.',
    },
  },
  {
    title: 'Parallel chiziqlar orasidagi siniq chiziq',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'HARD',
    spec: {
      stem: 'In the figure shown, line $\\ell$ is parallel to line $m$. What is the value of $x$? (Note: Figure not drawn to scale.)',
      svg: svg(
        300,
        214,
        seg(20, 40, 280, 40) +
          seg(20, 180, 280, 180) +
          seg(90, 40, 190, 110) +
          seg(190, 110, 90, 180) +
          txt(266, 32, 'ℓ', 'font-style="italic"') +
          txt(266, 172, 'm', 'font-style="italic"') +
          txt(122, 56, '{a}°', '', 12) +
          txt(122, 174, '{b}°', '', 12) +
          txt(174, 114, 'x°', `${END} font-style="italic"`, 12),
      ),
      variables: [
        { name: 'a', type: 'int', min: 25, max: 60 },
        { name: 'b', type: 'int', min: 25, max: 60 },
      ],
      answer: { kind: 'SPR', correct: 'a + b' },
      explanation:
        'Draw a line through the vertex of angle $x$ parallel to $\\ell$ and $m$. It divides angle $x$ into two angles, and each is an alternate interior angle with one of the marked angles, so they measure ${a}^\\circ$ and ${b}^\\circ$. Therefore $x = {a} + {b} = {answer}$.',
    },
  },
];
