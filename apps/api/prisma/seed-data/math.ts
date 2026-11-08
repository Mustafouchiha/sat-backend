import type { SeedTemplate } from './types';

/**
 * Markaz o'zi tuzgan namunaviy Math shablonlari (rasmiy College Board savollari EMAS).
 * Har bir shablon 500 ta variant bilan avtomatik tekshiriladi (seedTemplates.test.ts).
 */
export const MATH_TEMPLATES: SeedTemplate[] = [
  // ───────────── Algebra ─────────────
  {
    title: 'Bir noma\'lumli chiziqli tenglama: ax + b = c',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN1',
    difficulty: 'EASY',
    spec: {
      stem: 'If ${a}x + {b} = {c}$, what is the value of $x$?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 9 },
        { name: 'b', type: 'int', min: 1, max: 20 },
        { name: 'x0', type: 'int', min: -10, max: 10, exclude: [0] },
      ],
      derived: [{ name: 'c', expr: 'a*x0 + b' }],
      constraints: ['a != b'],
      answer: { kind: 'MCQ', correct: 'x0', distractors: ['(c + b) / a', 'c - b', '-x0', '(c - b) * a'] },
      explanation: 'Subtract {b} from both sides: ${a}x = {=c-b}$. Then divide both sides by {a}: $x = {x0}$.',
    },
  },
  {
    title: "Ikki tomonda o'zgaruvchi: a(x + b) = cx + d",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN1',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'What value of $x$ satisfies the equation ${a}(x {b|signed}) = {c|coef}x {d|signed}$?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 9 },
        { name: 'b', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'c', type: 'int', min: 1, max: 9 },
        { name: 'x0', type: 'int', min: -9, max: 9 },
      ],
      derived: [{ name: 'd', expr: '(a - c)*x0 + a*b' }],
      constraints: ['a != c', 'd != 0', 'abs(d) <= 99'],
      answer: { kind: 'SPR', correct: 'x0' },
      explanation:
        'Distribute: ${a}x {=a*b|signed} = {c|coef}x {d|signed}$. Collect like terms: ${=a-c|coef}x = {=d-a*b}$, so $x = {x0}$.',
    },
  },
  {
    title: 'Chiziqli funksiya qiymati f(k)',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LINF',
    difficulty: 'EASY',
    spec: {
      stem: 'The function $f$ is defined by $f(x) = {m|coef}x {b|signed}$. What is the value of $f({k})$?',
      variables: [
        { name: 'm', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'b', type: 'int', min: -15, max: 15, exclude: [0] },
        { name: 'k', type: 'int', min: -6, max: 6, exclude: [0] },
      ],
      constraints: [],
      answer: { kind: 'MCQ', correct: 'm*k + b', distractors: ['m*k - b', 'm + k + b', '-m*k + b', 'm*(k + b)'] },
      explanation: 'Substitute $x = {k}$: $f({k}) = {m}({k}) {b|signed} = {answer}$.',
    },
  },
  {
    title: 'Ikki nuqtadan o\'tgan to\'g\'ri chiziq qiyaligi',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LINF',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the $xy$-plane, a line passes through the points $({x1}, {y1})$ and $({x2}, {y2})$. What is the slope of the line?',
      variables: [
        { name: 'x1', type: 'int', min: -8, max: 8 },
        { name: 'x2', type: 'int', min: -8, max: 8 },
        { name: 'm', type: 'int', min: -5, max: 5, exclude: [-1, 0, 1] },
        { name: 'y1', type: 'int', min: -10, max: 10 },
      ],
      derived: [{ name: 'y2', expr: 'y1 + m*(x2 - x1)' }],
      constraints: ['x1 != x2'],
      answer: { kind: 'MCQ', correct: 'm', distractors: ['-m', '1/m', '-1/m'], format: 'frac' },
      explanation: 'Slope $= \\dfrac{{y2} - ({y1})}{{x2} - ({x1})} = \\dfrac{{=y2-y1}}{{=x2-x1}} = {m}$.',
    },
  },
  {
    title: "Ikki o'zgaruvchili chiziqli tenglama (matnli masala)",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_LIN2',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'A store sells pens for \\${p} each and notebooks for \\${q} each. {name} bought {x} pens and some notebooks and spent a total of \\${T}. How many notebooks did {name.1} buy?',
      variables: [
        { name: 'name', type: 'choice', options: ['Maria|she', 'Aziz|he', 'Liam|he', 'Sofia|she', 'Dilnoza|she', 'Jamshid|he'] },
        { name: 'p', type: 'int', min: 2, max: 6 },
        { name: 'q', type: 'int', min: 3, max: 9 },
        { name: 'x', type: 'int', min: 2, max: 8 },
        { name: 'y', type: 'int', min: 2, max: 9 },
      ],
      derived: [{ name: 'T', expr: 'p*x + q*y' }],
      constraints: ['p != q'],
      answer: { kind: 'MCQ', correct: 'y', distractors: ['floor(T / q)', 'x + y', 'y + 1', 'y - 1'], choiceTemplate: '{v}' },
      explanation: 'The pens cost ${p} \\times {x} = {=p*x}$ dollars, so the notebooks cost ${T} - {=p*x} = {=q*y}$ dollars. Since each notebook costs \\${q}, the number of notebooks is ${=q*y} \\div {q} = {y}$.',
    },
  },
  {
    title: 'Ikki chiziqli tenglamalar sistemasi: x + y',
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_SYS',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        '$$\\begin{aligned} {a1|coef}x + {b1|coef}y &= {c1} \\\\ {a2|coef}x {b2|signedcoef}y &= {c2} \\end{aligned}$$ If $(x, y)$ is the solution to the system of equations above, what is the value of $x + y$?',
      variables: [
        { name: 'x0', type: 'int', min: -6, max: 6 },
        { name: 'y0', type: 'int', min: -6, max: 6 },
        { name: 'a1', type: 'int', min: 1, max: 5 },
        { name: 'b1', type: 'int', min: 1, max: 5 },
        { name: 'a2', type: 'int', min: 1, max: 5 },
        { name: 'b2', type: 'int', min: -5, max: 5, exclude: [0] },
      ],
      derived: [
        { name: 'c1', expr: 'a1*x0 + b1*y0' },
        { name: 'c2', expr: 'a2*x0 + b2*y0' },
      ],
      constraints: ['a1*b2 - a2*b1 != 0'],
      answer: { kind: 'SPR', correct: 'x0 + y0' },
      explanation: 'Solving the system (for example, by elimination) gives $x = {x0}$ and $y = {y0}$. Therefore $x + y = {answer}$.',
    },
  },
  {
    title: "Chiziqli tengsizlik: eng kichik butun yechim",
    section: 'MATH',
    domainId: 'MATH_ALG',
    skillId: 'MATH_ALG_INEQ',
    difficulty: 'EASY',
    spec: {
      stem: 'What is the least integer value of $x$ that satisfies the inequality ${a}x {b|signed} > {c}$?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 7 },
        { name: 'b', type: 'int', min: -10, max: 10, exclude: [0] },
        { name: 'c', type: 'int', min: -10, max: 20 },
      ],
      derived: [
        { name: 'q', expr: '(c - b) / a' },
        { name: 'ans', expr: 'floor(q) + 1' },
      ],
      constraints: [],
      answer: { kind: 'MCQ', correct: 'ans', distractors: ['ans - 1', 'ans + 1', '-ans', 'ans + 2'] },
      explanation: 'Isolate $x$: ${a}x > {=c-b}$, so $x > {q|frac}$. The least integer greater than ${q|frac}$ is ${ans}$.',
    },
  },

  // ───────────── Advanced Math ─────────────
  {
    title: 'Kvadrat funksiya qiymati g(k)',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'EASY',
    spec: {
      stem: 'The function $g$ is defined by $g(x) = {a|coef}x^2 {b|signedcoef}x {c|signed}$. What is the value of $g({k})$?',
      variables: [
        { name: 'a', type: 'int', min: 1, max: 4 },
        { name: 'b', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'c', type: 'int', min: -12, max: 12, exclude: [0] },
        { name: 'k', type: 'int', min: -4, max: 4, exclude: [0] },
      ],
      answer: {
        kind: 'MCQ',
        correct: 'a*k^2 + b*k + c',
        distractors: ['-a*k^2 + b*k + c', 'a*k^2 - b*k + c', '2*a*k + b*k + c', 'a*k^2 + b*k - c'],
      },
      explanation: '$g({k}) = {a}({k})^2 {b|signed}({k}) {c|signed} = {answer}$.',
    },
  },
  {
    title: 'Kvadrat tenglama ildizlari yig\'indisi',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EQ',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'What is the sum of the solutions to the equation $x^2 {s|signedcoef}x {p|signed} = 0$?',
      variables: [
        { name: 'r1', type: 'int', min: -9, max: 9 },
        { name: 'r2', type: 'int', min: -9, max: 9 },
      ],
      derived: [
        { name: 's', expr: '-(r1 + r2)' },
        { name: 'p', expr: 'r1 * r2' },
      ],
      constraints: ['r1 != r2', 's != 0', 'p != 0'],
      answer: { kind: 'SPR', correct: 'r1 + r2' },
      explanation: 'Factor the left side: $(x {=-r1|signed})(x {=-r2|signed}) = 0$, so $x = {r1}$ or $x = {r2}$. The sum of the solutions is ${answer}$.',
    },
  },
  {
    title: "Ko'rsatkichli o'sish modeli",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'The function $P(t) = {P0}({k})^t$ models the number of bacteria in a sample $t$ hours after the start of an experiment. How many bacteria are in the sample after ${n}$ hours?',
      variables: [
        { name: 'P0', type: 'choice', options: [100, 200, 250, 400, 500] },
        { name: 'k', type: 'int', min: 2, max: 3 },
        { name: 'n', type: 'int', min: 2, max: 4 },
      ],
      answer: {
        kind: 'MCQ',
        correct: 'P0 * k^n',
        distractors: ['P0 * k * n', 'P0 * n^k', 'P0 * k^(n - 1)', 'P0 + k^n'],
        choiceTemplate: '{v|comma}',
      },
      explanation: '$P({n}) = {P0} \\cdot {k}^{{n}} = {P0} \\cdot {=k^n} = {answer}$.',
    },
  },
  {
    title: 'Ekvivalent ifoda: ikki hadli ko\'paytma',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EXPR',
    difficulty: 'EASY',
    spec: {
      stem: 'Which of the following is equivalent to $({a|coef}x {b|signed})({c|coef}x {d|signed})$?',
      variables: [
        { name: 'a', type: 'int', min: 1, max: 4 },
        { name: 'c', type: 'int', min: 1, max: 4 },
        { name: 'b', type: 'int', min: -7, max: 7, exclude: [0] },
        { name: 'd', type: 'int', min: -7, max: 7, exclude: [0] },
      ],
      constraints: ['a*d + b*c != 0', 'a*d - b*c != 0', 'b + d != 0'],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          '${=a*c|coef}x^2 {=a*d + b*c|signedcoef}x {=b*d|signed}$',
          '${=a*c|coef}x^2 {=b*d|signed}$',
          '${=a*c|coef}x^2 {=a*d - b*c|signedcoef}x {=b*d|signed}$',
          '${=a+c|coef}x^2 {=a*d + b*c|signedcoef}x {=b+d|signed}$',
        ],
      },
      explanation: 'Multiply each term: ${=a*c|coef}x^2 {=a*d|signedcoef}x {=b*c|signedcoef}x {=b*d|signed}$, then combine the $x$ terms.',
    },
  },
  {
    title: "Daraja xossalari: (x^a)^b / x^c",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EXPR',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'For $x > 0$, which of the following is equivalent to $\\dfrac{(x^{{a}})^{{b}}}{x^{{c}}}$?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 5 },
        { name: 'b', type: 'int', min: 2, max: 4 },
        { name: 'c', type: 'int', min: 1, max: 9 },
      ],
      constraints: ['a*b - c > 1', 'a*b - c != a + b - c', 'a*b - c != a*b/c', 'a*b + c != a*b/c'],
      answer: {
        kind: 'MCQ_TEXT',
        choices: ['$x^{{=a*b-c}}$', '$x^{{=a+b-c}}$', '$x^{{=a*b+c}}$', '$x^{{=a*b/c|frac}}$'],
      },
      explanation: 'A power of a power multiplies the exponents: $(x^{{a}})^{{b}} = x^{{=a*b}}$. Dividing subtracts exponents: $x^{{=a*b} - {c}} = x^{{=a*b-c}}$.',
    },
  },
  {
    title: 'Parabola minimumi (uchi)',
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_FUNC',
    difficulty: 'HARD',
    spec: {
      stem: 'The function $f$ is defined by $f(x) = {a|coef}x^2 {b|signedcoef}x {c|signed}$. For what value of $x$ does $f(x)$ reach its minimum value?',
      variables: [
        { name: 'h', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'c', type: 'int', min: -20, max: 20, exclude: [0] },
        { name: 'a', type: 'int', min: 1, max: 3 },
      ],
      derived: [{ name: 'b', expr: '-2*a*h' }],
      answer: { kind: 'SPR', correct: 'h' },
      explanation:
        'For $f(x) = Ax^2 + Bx + C$ with $A > 0$, the minimum occurs at $x = -\\dfrac{B}{2A}$. Here $x = -\\dfrac{{b}}{2 \\cdot {a}} = {h}$.',
    },
  },
  {
    title: "Kvadrat tenglama: musbat yechim",
    section: 'MATH',
    domainId: 'MATH_ADV',
    skillId: 'MATH_ADV_EQ',
    difficulty: 'HARD',
    spec: {
      stem: 'What is the positive solution to the equation ${a|coef}x^2 = {m|coef}x {n|signed}$?',
      variables: [
        { name: 'a', type: 'int', min: 1, max: 3 },
        { name: 'r', type: 'int', min: 2, max: 9 },
        { name: 's', type: 'int', min: -9, max: -1 },
      ],
      derived: [
        { name: 'm', expr: 'a*(r + s)' },
        { name: 'n', expr: '-a*r*s' },
      ],
      constraints: ['m != 0', 'r != -s'],
      answer: { kind: 'SPR', correct: 'r' },
      explanation:
        'Move all terms to one side: ${a|coef}x^2 {=-m|signedcoef}x {=-n|signed} = 0$, which factors as ${a|coef}(x - {r})(x {=-s|signed}) = 0$. The solutions are $x = {r}$ and $x = {s}$, so the positive solution is ${r}$.',
    },
  },

  // ───────────── Problem-Solving & Data Analysis ─────────────
  {
    title: 'Foiz: chegirmadagi narx',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_PCT',
    difficulty: 'EASY',
    spec: {
      stem: 'A jacket is originally priced at \\${P}. During a sale, the price is reduced by ${r}\\%$. What is the sale price of the jacket?',
      variables: [
        { name: 'P', type: 'choice', options: [40, 60, 80, 120, 150, 200, 250] },
        { name: 'r', type: 'choice', options: [10, 15, 20, 25, 30, 40] },
      ],
      derived: [{ name: 'sale', expr: 'P * (1 - r/100)' }],
      answer: {
        kind: 'MCQ',
        correct: 'sale',
        distractors: ['P * r / 100', 'P - r', 'P * (1 + r/100)'],
        choiceTemplate: '\\${v|d2}',
      },
      explanation: 'A ${r}\\%$ reduction leaves ${=100-r}\\%$ of the price: ${P} \\times {=(100-r)/100} = {sale}$. The sale price is \\${sale|d2}.',
    },
  },
  {
    title: 'Tezlik va masofa (proporsiya)',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_RATIO',
    difficulty: 'EASY',
    spec: {
      stem:
        'A car traveling at a constant speed covers {d} miles in {t} hours. At this speed, how many miles will the car travel in {h} hours?',
      variables: [
        { name: 'spd', type: 'int', min: 35, max: 70 },
        { name: 't', type: 'int', min: 2, max: 5 },
        { name: 'h', type: 'int', min: 2, max: 9 },
      ],
      derived: [
        { name: 'd', expr: 'spd * t' },
        { name: 'ans', expr: 'spd * h' },
      ],
      constraints: ['h != t'],
      answer: { kind: 'MCQ', correct: 'ans', distractors: ['d * h', 'd + h', 'd * t / h', 'spd + h'], choiceTemplate: '{v|r1}' },
      explanation: 'The speed is ${d} \\div {t} = {spd}$ miles per hour, so in {h} hours the car travels ${spd} \\times {h} = {ans}$ miles.',
    },
  },
  {
    title: "O'rta qiymat: yetishmayotgan son",
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT1',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'The mean of five numbers is {m}. Four of the numbers are {a}, {b}, {c}, and {d}. What is the fifth number?',
      variables: [
        { name: 'a', type: 'int', min: 2, max: 30 },
        { name: 'b', type: 'int', min: 2, max: 30 },
        { name: 'c', type: 'int', min: 2, max: 30 },
        { name: 'd', type: 'int', min: 2, max: 30 },
        { name: 'fifth', type: 'int', min: 2, max: 40 },
      ],
      derived: [{ name: 'm', expr: '(a + b + c + d + fifth) / 5' }],
      constraints: ['isInt(m)'],
      answer: { kind: 'SPR', correct: 'fifth' },
      explanation:
        'The sum of all five numbers is $5 \\times {m} = {=5*m}$. The fifth number is ${=5*m} - ({a} + {b} + {c} + {d}) = {fifth}$.',
    },
  },
  {
    title: 'Ehtimollik: rangli sharlar',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_PROB',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'A bag contains {r} red marbles, {bl} blue marbles, and {g} green marbles. If one marble is selected at random, what is the probability that it is not blue?',
      variables: [
        { name: 'r', type: 'int', min: 2, max: 9 },
        { name: 'bl', type: 'int', min: 2, max: 9 },
        { name: 'g', type: 'int', min: 2, max: 9 },
      ],
      derived: [{ name: 'total', expr: 'r + bl + g' }],
      constraints: ['r != g'],
      answer: {
        kind: 'MCQ',
        correct: '(r + g) / total',
        distractors: ['bl / total', 'r / total', '(r + g) / bl', 'g / total'],
        format: 'frac',
      },
      explanation: 'There are ${total}$ marbles, and ${=r+g}$ of them are not blue, so the probability is $\\dfrac{{=r+g}}{{total}} = {answer|frac}$.',
    },
  },
  {
    title: 'Eng yaxshi moslik chizig\'i bo\'yicha bashorat',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_STAT2',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'A scatterplot shows the relationship between the number of hours, $x$, that students studied and their scores, $y$, on a quiz. The line of best fit is $y = {m}x + {b}$. Based on the line of best fit, what is the predicted score for a student who studied {k} hours?',
      variables: [
        { name: 'm', type: 'decimal', min: 1.5, max: 6.5, places: 1 },
        { name: 'b', type: 'int', min: 10, max: 60 },
        { name: 'k', type: 'int', min: 4, max: 15 },
      ],
      constraints: ['answer <= 100'],
      answer: { kind: 'MCQ', correct: 'm*k + b', distractors: ['m + k + b', 'm*k', 'm*(k + b)', 'b*k + m'], format: 'r1' },
      explanation: 'Substitute $x = {k}$: $y = {m}({k}) + {b} = {answer|r1}$.',
    },
  },
  {
    title: 'Xatolik chegarasi (margin of error) xulosasi',
    section: 'MATH',
    domainId: 'MATH_PSDA',
    skillId: 'MATH_PSDA_INFER',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'A survey of {n} randomly selected students at {school} found that ${p}\\%$ of the students in the sample prefer online homework. The margin of error for the estimate is ${moe}\\%$. Which of the following is the most appropriate conclusion?',
      variables: [
        { name: 'n', type: 'choice', options: [200, 300, 400, 500] },
        { name: 'p', type: 'int', min: 40, max: 70 },
        { name: 'moe', type: 'int', min: 2, max: 5 },
        { name: 'school', type: 'choice', options: ['Lincoln High School', 'Riverside Academy', 'Northgate School', 'Oakwood School'] },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'It is plausible that between ${=p-moe}\\%$ and ${=p+moe}\\%$ of all students at {school} prefer online homework.',
          'Exactly ${p}\\%$ of all students at {school} prefer online homework.',
          'It is plausible that between ${=p-moe}\\%$ and ${=p+moe}\\%$ of all high school students in the country prefer online homework.',
          'The survey proves that ${=100-p}\\%$ of all students at {school} prefer paper homework.',
        ],
      },
      explanation:
        'A sample estimate with a margin of error gives a plausible range, ${=p-moe}\\%$ to ${=p+moe}\\%$, and it applies only to the population that was sampled: students at {school}.',
    },
  },

  // ───────────── Geometry & Trigonometry ─────────────
  {
    title: "To'g'ri burchakli parallelepiped hajmi",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_AREA',
    difficulty: 'EASY',
    spec: {
      stem:
        'A rectangular box has a length of {l} centimeters, a width of {w} centimeters, and a height of {h} centimeters. What is the volume, in cubic centimeters, of the box?',
      variables: [
        { name: 'l', type: 'int', min: 3, max: 12 },
        { name: 'w', type: 'int', min: 2, max: 10 },
        { name: 'h', type: 'int', min: 2, max: 9 },
      ],
      answer: {
        kind: 'MCQ',
        correct: 'l*w*h',
        distractors: ['l + w + h', '2*(l*w + w*h + l*h)', 'l*w', 'l*w*h/2'],
        choiceTemplate: '{v|r1}',
      },
      explanation: 'Volume $=$ length $\\times$ width $\\times$ height $= {l} \\times {w} \\times {h} = {answer}$.',
    },
  },
  {
    title: 'Uchburchak burchaklari yig\'indisi',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'EASY',
    spec: {
      stem:
        'In triangle $ABC$, the measure of angle $A$ is ${angA}^\\circ$ and the measure of angle $B$ is ${angB}^\\circ$. What is the measure, in degrees, of angle $C$? (Note: figure not drawn to scale.)',
      svg:
        '<svg viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg"><polygon points="20,140 220,140 90,22" fill="none" stroke="currentColor" stroke-width="2"/><text x="8" y="156" font-size="14" fill="currentColor">A</text><text x="222" y="156" font-size="14" fill="currentColor">B</text><text x="84" y="16" font-size="14" fill="currentColor">C</text><text x="40" y="133" font-size="12" fill="currentColor">{angA}°</text><text x="176" y="133" font-size="12" fill="currentColor">{angB}°</text></svg>',
      variables: [
        { name: 'angA', type: 'int', min: 25, max: 80 },
        { name: 'angB', type: 'int', min: 25, max: 80 },
      ],
      derived: [{ name: 'angC', expr: '180 - angA - angB' }],
      constraints: ['angC >= 20'],
      answer: { kind: 'SPR', correct: 'angC' },
      explanation: 'The angles of a triangle add to $180^\\circ$: $180 - {angA} - {angB} = {angC}$.',
    },
  },
  {
    title: "To'g'ri burchakli uchburchak: sinus",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_TRIG',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In right triangle $PQR$, angle $R$ is a right angle, $PR = {a}$, and $QR = {b}$. What is the value of $\\sin P$?',
      svg:
        '<svg viewBox="0 0 260 170" xmlns="http://www.w3.org/2000/svg"><polygon points="30,140 230,140 30,30" fill="none" stroke="currentColor" stroke-width="2"/><rect x="30" y="128" width="12" height="12" fill="none" stroke="currentColor"/><text x="14" y="156" font-size="14" fill="currentColor">R</text><text x="234" y="156" font-size="14" fill="currentColor">Q</text><text x="14" y="28" font-size="14" fill="currentColor">P</text><text x="4" y="90" font-size="13" fill="currentColor">{a}</text><text x="122" y="160" font-size="13" fill="currentColor">{b}</text></svg>',
      variables: [
        { name: 't', type: 'choice', options: ['3|4|5', '5|12|13', '8|15|17', '7|24|25', '20|21|29'] },
        { name: 'k', type: 'int', min: 1, max: 3 },
      ],
      derived: [
        { name: 'a', expr: 'k * t' },
        { name: 'b', expr: 'k * t_1' },
        { name: 'c', expr: 'k * t_2' },
      ],
      answer: { kind: 'MCQ', correct: 'b / c', distractors: ['a / c', 'a / b', 'b / a', 'c / b'], format: 'frac' },
      explanation:
        'By the Pythagorean theorem, $PQ = \\sqrt{{a}^2 + {b}^2} = {c}$. The sine of $P$ is the opposite side over the hypotenuse: $\\sin P = \\dfrac{QR}{PQ} = \\dfrac{{b}}{{c}} = {answer|frac}$.',
    },
  },
  {
    title: 'Aylana tenglamasi: radius',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'MEDIUM',
    spec: {
      stem: 'In the $xy$-plane, the graph of $(x {=-h|signed})^2 + (y {=-k|signed})^2 = {R}$ is a circle. What is the radius of the circle?',
      variables: [
        { name: 'h', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'k', type: 'int', min: -9, max: 9, exclude: [0] },
        { name: 'r', type: 'int', min: 2, max: 9 },
      ],
      derived: [{ name: 'R', expr: 'r^2' }],
      answer: { kind: 'MCQ', correct: 'r', distractors: ['R', '2*r', 'R / 2', 'r + 1'] },
      explanation: 'A circle $(x - h)^2 + (y - k)^2 = r^2$ has radius $r$. Here $r^2 = {R}$, so $r = {r}$.',
    },
  },
  {
    title: 'Aylana: uzunlikdan yuzaga',
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_CIRC',
    difficulty: 'EASY',
    spec: {
      stem: 'A circle has a circumference of ${C}\\pi$ centimeters. What is the area, in square centimeters, of the circle?',
      variables: [{ name: 'r', type: 'int', min: 2, max: 12 }],
      derived: [{ name: 'C', expr: '2*r' }],
      answer: { kind: 'MCQ', correct: 'r^2', distractors: ['C^2', '2*r', 'C', 'r'], choiceTemplate: '${v}\\pi$' },
      explanation: 'Since $2\\pi r = {C}\\pi$, the radius is ${r}$. The area is $\\pi r^2 = {=r^2}\\pi$.',
    },
  },
  {
    title: "Parallel to'g'ri chiziqlar va kesuvchi",
    section: 'MATH',
    domainId: 'MATH_GEO',
    skillId: 'MATH_GEO_LINES',
    difficulty: 'MEDIUM',
    spec: {
      stem:
        'In the figure, line $\\ell$ is parallel to line $m$, and both lines are intersected by a transversal. The measure of angle 1 is ${x}^\\circ$. What is the measure, in degrees, of angle 2? (Note: figure not drawn to scale.)',
      svg:
        '<svg viewBox="0 0 260 170" xmlns="http://www.w3.org/2000/svg"><line x1="10" y1="50" x2="250" y2="50" stroke="currentColor" stroke-width="2"/><line x1="10" y1="120" x2="250" y2="120" stroke="currentColor" stroke-width="2"/><line x1="60" y1="10" x2="180" y2="160" stroke="currentColor" stroke-width="2"/><text x="236" y="44" font-size="14" fill="currentColor" font-style="italic">ℓ</text><text x="236" y="114" font-size="14" fill="currentColor" font-style="italic">m</text><text x="108" y="66" font-size="13" fill="currentColor">1</text><text x="158" y="112" font-size="13" fill="currentColor">2</text></svg>',
      variables: [{ name: 'x', type: 'int', min: 35, max: 145, exclude: [90] }],
      answer: { kind: 'SPR', correct: '180 - x' },
      explanation:
        'Angles 1 and 2 are same-side interior angles formed by parallel lines and a transversal, so they are supplementary: $180 - {x} = {answer}$.',
    },
  },
];
