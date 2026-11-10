import { barChart, table } from './figures';
import type { SeedTemplate } from './types';

const COMPLETE = 'Which choice completes the text with the most logical and precise word or phrase?';
const CONVENTIONS = 'Which choice completes the text so that it conforms to the conventions of Standard English?';
const TRANSITION = 'Which choice completes the text with the most logical transition?';

/** Qo'shimcha Reading & Writing shablonlari (ikkitasi grafik/jadval bilan). */
export const RW_MORE_TEMPLATES: SeedTemplate[] = [
  {
    title: 'Command of Evidence (Quantitative): bee visits graph',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_COE_Q',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'Researcher {name} recorded the average number of bee visits per hour to four types of flowering plants in a test garden. Lavender and clover have purple flowers, while sunflowers and marigolds have yellow flowers. {name.1|cap} hypothesized that bees in the garden visit plants with purple flowers more often than they visit plants with yellow flowers.',
      stem: "Which choice best describes data from the graph that support {name}'s hypothesis?",
      svg: barChart({
        cats: ['Lavender', 'Clover', 'Sunflower', 'Marigold'],
        values: ['lav', 'clo', 'sun', 'mar'],
        max: 50,
        step: 10,
        title: 'Average bee visits per hour',
      }),
      variables: [
        { name: 'name', type: 'choice', options: ['Dr. Lena Ortiz|she', 'Dr. Aziz Nurmatov|he', 'Dr. Grace Kim|she', 'Dr. Samuel Osei|he'] },
        { name: 'lav', type: 'int', min: 34, max: 48 },
        { name: 'clo', type: 'int', min: 24, max: 36 },
        { name: 'sun', type: 'int', min: 14, max: 22 },
        { name: 'mar', type: 'int', min: 6, max: 13 },
      ],
      constraints: ['lav > clo + 2', 'clo > sun + 3', 'sun > mar + 2'],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'Lavender and clover each received more visits per hour than either sunflowers or marigolds did.',
          'Clover received fewer visits per hour than lavender did.',
          'Sunflowers received more visits per hour than marigolds did.',
          'Sunflowers received more visits per hour than clover did.',
        ],
      },
      explanation:
        'The hypothesis compares purple-flowered plants with yellow-flowered plants. The graph shows that lavender (about {lav}) and clover (about {clo}) each had more visits per hour than sunflowers (about {sun}) and marigolds (about {mar}), which directly supports it. The other choices compare plants of the same color or are not true.',
    },
  },
  {
    title: 'Command of Evidence (Quantitative): solar panel table',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_COE_Q',
    difficulty: 'HARD',
    spec: {
      passage:
        'Engineers tested whether cleaning solar panels more often increases the energy the panels produce. The table shows the average daily energy output, in kilowatt-hours (kWh), of panels cleaned at three different intervals during summer and winter. The engineers concluded that, in both seasons, panels produced more energy when they were cleaned more often.',
      stem: "Which choice best describes data from the table that support the engineers' conclusion?",
      svg: table(
        [
          ['Cleaning', 'Summer', 'Winter'],
          ['Every week', '{wS} kWh', '{wW} kWh'],
          ['Every month', '{mS} kWh', '{mW} kWh'],
          ['Never', '{nS} kWh', '{nW} kWh'],
        ],
        [112, 84, 84],
      ),
      variables: [
        { name: 'nS', type: 'int', min: 18, max: 22 },
        { name: 'd1', type: 'int', min: 2, max: 4 },
        { name: 'd2', type: 'int', min: 2, max: 4 },
        { name: 'nW', type: 'int', min: 8, max: 11 },
        { name: 'e1', type: 'int', min: 1, max: 3 },
        { name: 'e2', type: 'int', min: 1, max: 3 },
      ],
      derived: [
        { name: 'mS', expr: 'nS + d1' },
        { name: 'wS', expr: 'mS + d2' },
        { name: 'mW', expr: 'nW + e1' },
        { name: 'wW', expr: 'mW + e2' },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'In both summer and winter, panels cleaned every week produced the most energy, and panels that were never cleaned produced the least.',
          'Panels produced more energy in summer than in winter, regardless of how often they were cleaned.',
          'In winter, panels that were never cleaned produced {nW} kWh of energy per day.',
          'In summer, panels cleaned every month produced less energy than panels that were never cleaned.',
        ],
      },
      explanation:
        'The conclusion is about cleaning frequency in both seasons. In summer ({wS}, {mS}, and {nS} kWh) and in winter ({wW}, {mW}, and {nW} kWh), output increases as cleaning becomes more frequent. The second and third choices are true but do not address cleaning frequency, and the fourth is false.',
    },
  },
  {
    title: 'Transitions: contrast with a belief',
    section: 'RW',
    domainId: 'RW_EOI',
    skillId: 'RW_EOI_TRANS',
    difficulty: 'EASY',
    spec: {
      passage:
        'For many years, the public library in {town} closed at 6 p.m. because officials believed that few residents would visit in the evening. ______ when the library stayed open until 9 p.m. as a trial, evening visitors made up nearly a third of its weekly total.',
      stem: TRANSITION,
      variables: [{ name: 'town', type: 'choice', options: ['Eastbrook', 'Navoi', 'Port Allen', 'Zarafshan', 'Milltown'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['However,', 'For example,', 'Similarly,', 'In addition,'] },
      explanation:
        "The second sentence shows that the officials' belief was wrong: many residents did visit in the evening. \"However\" signals this contrast.",
    },
  },
  {
    title: 'Transitions: cause and effect',
    section: 'RW',
    domainId: 'RW_EOI',
    skillId: 'RW_EOI_TRANS',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        "The bakery owned by {name} began buying flour from a mill only a few kilometers away instead of from a distant supplier. The shorter trips cut the bakery's delivery costs nearly in half. ______ {name.1} was able to lower the price of bread without reducing {name.2} workers' wages.",
      stem: TRANSITION,
      variables: [
        { name: 'name', type: 'choice', options: ['Nodira Karimova|she|her', 'Omar Haddad|he|his', 'Elena Rossi|she|her', 'Bekzod Tursunov|he|his'] },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['As a result,', 'In contrast,', 'For example,', 'Nevertheless,'] },
      explanation:
        'The lower delivery costs made the lower bread prices possible, so the transition must show cause and effect: "As a result."',
    },
  },
  {
    title: 'Boundaries: colon before a list',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_BOUND',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        "The museum's new exhibit focuses on three inventions that changed daily life in the nineteenth ______ {list}.",
      stem: CONVENTIONS,
      variables: [
        {
          name: 'list',
          type: 'choice',
          options: [
            'the telegraph, the sewing machine, and the bicycle',
            'the steam locomotive, the camera, and the typewriter',
            'the telephone, the phonograph, and the electric light bulb',
          ],
        },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['century:', 'century;', 'century', 'century, which'] },
      explanation:
        'The words before the blank form a complete sentence, and the list after the blank names the "three inventions." A colon correctly introduces a list that explains what came before it.',
    },
  },
  {
    title: 'Boundaries: closing a pair of dashes',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_BOUND',
    difficulty: 'HARD',
    spec: {
      passage:
        "The city's oldest bridge—a stone structure built in ______ was closed to cars last spring so that engineers could repair its foundations.",
      stem: CONVENTIONS,
      variables: [{ name: 'year', type: 'int', min: 1780, max: 1890 }],
      answer: { kind: 'MCQ_TEXT', choices: ['{year}—', '{year},', '{year};', '{year}'] },
      explanation:
        'The phrase "a stone structure built in {year}" interrupts the main clause. It begins with a dash, so it must also end with a dash.',
    },
  },
  {
    title: 'Form, Structure, and Sense: pronoun agreement',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_FSS',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        "After months of rehearsals, the {city} Youth Orchestra is ready for the last event of the season. On Saturday, the orchestra will perform ______ final concert in the city's new music hall.",
      stem: CONVENTIONS,
      variables: [{ name: 'city', type: 'choice', options: ['Tashkent', 'Riverside', 'Cedar Falls', 'Andijan', 'Portland'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['its', "it's", 'their', "they're"] },
      explanation:
        'The pronoun refers to "the orchestra," a singular noun, and shows possession, so the singular possessive "its" is correct. "It\'s" means "it is."',
    },
  },
  {
    title: 'Form, Structure, and Sense: verb tense',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_FSS',
    difficulty: 'EASY',
    spec: {
      passage:
        'In {year}, the city council of {city} ______ a plan to plant ten thousand trees along the river. Today, those trees shade walking paths that thousands of residents use every week.',
      stem: CONVENTIONS,
      variables: [
        { name: 'year', type: 'int', min: 1995, max: 2012 },
        { name: 'city', type: 'choice', options: ['Fergana', 'Greenville', 'Lakewood', 'Termez'] },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['approved', 'approves', 'will approve', 'is approving'] },
      explanation: 'The phrase "In {year}" places the action in the past, so the past-tense verb "approved" is correct.',
    },
  },
  {
    title: 'Words in Context: meticulous',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_WIC',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'Conservator {name} spent nearly two years restoring a damaged 300-year-old map. {name.1|cap} examined each fragment under a microscope and recorded every repair in a detailed notebook, an approach that colleagues described as remarkably ______.',
      stem: COMPLETE,
      variables: [{ name: 'name', type: 'choice', options: ['Ingrid Larsen|she', 'Rustam Saidov|he', 'Amara Nwosu|she', 'Kenji Watanabe|he'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['meticulous', 'careless', 'hasty', 'indifferent'] },
      explanation:
        'Examining every fragment under a microscope and recording every repair shows great care and attention to detail, which is what "meticulous" means.',
    },
  },
  {
    title: 'Rhetorical Synthesis: emphasizing a difference',
    section: 'RW',
    domainId: 'RW_EOI',
    skillId: 'RW_EOI_SYN',
    difficulty: 'HARD',
    spec: {
      passage:
        'While researching a topic, a student has taken the following notes:\n• {pair} and {pair.1} are both plants that survive long periods without rain.\n• {pair} stores water in its thick, fleshy leaves.\n• {pair.1|cap} has very deep roots that reach water far underground.\n• Gardeners in dry regions often grow both plants.',
      stem: 'The student wants to emphasize a difference between the two plants. Which choice most effectively uses relevant information from the notes to accomplish this goal?',
      variables: [{ name: 'pair', type: 'choice', options: ['Aloe vera|mesquite', 'Agave|acacia', 'The jade plant|the creosote bush'] }],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          '{pair} stores water in its thick leaves, whereas {pair.1} relies on deep roots to reach water underground.',
          'Both {pair|lower} and {pair.1} can survive long periods without rain.',
          'Gardeners in dry regions often grow plants that can survive long periods without rain.',
          '{pair} is a plant that stores water in its thick, fleshy leaves.',
        ],
      },
      explanation:
        'Only the first choice contrasts the two plants: "whereas" shows that they get water in different ways. The second choice states a similarity, and the others mention only one plant or neither.',
    },
  },
  {
    title: 'Inferences: beak size and food',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_INF',
    difficulty: 'HARD',
    spec: {
      passage:
        'Biologists studying {bird} on two neighboring islands noticed that the birds on the northern island had larger, stronger beaks than the birds on the southern island. On the northern island, the most common food was a seed with a very hard shell, while birds on the southern island ate mostly small, soft insects. These observations suggest that ______',
      stem: 'Which choice most logically completes the text?',
      variables: [{ name: 'bird', type: 'choice', options: ['ground finches', 'seed-eating sparrows', 'grosbeaks'] }],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'the type of food available on each island may be related to the difference in beak size between the two groups of birds.',
          'birds on the southern island are unable to eat seeds of any kind.',
          'beak size has no effect on which foods a bird is able to eat.',
          'more birds live on the northern island than on the southern island.',
        ],
      },
      explanation:
        'The text pairs larger, stronger beaks with hard seeds and smaller beaks with soft insects, so the logical conclusion links food type to beak size. The other choices go beyond or contradict the evidence.',
    },
  },
  {
    title: 'Command of Evidence (Textual): sleep and memory',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_COE_T',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'In a study of sleep and memory, psychologist {name} asked participants to learn a list of {n} unfamiliar words in the evening. Half of the participants then slept for eight hours, while the other half stayed awake through the night. The next morning, all participants were tested on the words. {name} claims that sleep helps people remember new information.',
      stem: "Which finding from the study, if true, would most directly support {name}'s claim?",
      variables: [
        { name: 'name', type: 'choice', options: ['Dr. Hana Sato', 'Dr. Ali Karimov', 'Dr. Maya Levin', 'Dr. Tomas Silva'] },
        { name: 'n', type: 'int', min: 20, max: 40 },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'Participants who slept recalled significantly more of the words than participants who stayed awake did.',
          'Participants who stayed awake reported feeling more tired than participants who slept did.',
          'Both groups recalled fewer words in the morning than they had right after learning them.',
          'Participants who stayed awake recalled slightly more of the words than participants who slept did.',
        ],
      },
      explanation:
        'The claim is that sleep improves memory, so the strongest support is evidence that the group that slept remembered more words than the group that stayed awake.',
    },
  },
];
