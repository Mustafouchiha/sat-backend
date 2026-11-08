import type { SeedTemplate } from './types';

const COMPLETE = 'Which choice completes the text with the most logical and precise word or phrase?';
const CONVENTIONS = 'Which choice completes the text so that it conforms to the conventions of Standard English?';

/**
 * Markaz o'zi yozgan Reading & Writing shablonlari. Sonlarni o'zgartirib bo'lmagani uchun:
 * javob variantlari aralashtiriladi va ism/joy kabi kichik so'zlar choice o'zgaruvchisi orqali almashtiriladi.
 */
export const RW_TEMPLATES: SeedTemplate[] = [
  {
    title: 'Words in Context: resilient',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_WIC',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'Marine biologist {name} spent three years documenting coral reefs that had survived an unusually warm summer. Although many reefs in the region had bleached and died, the corals {name.1} studied proved remarkably ______, regaining their color within a few months.',
      stem: COMPLETE,
      variables: [
        { name: 'name', type: 'choice', options: ['Dr. Amina Yusupova|she', 'Dr. Lucas Ferreira|he', 'Dr. Mei Chen|she', 'Dr. Daniel Okafor|he'] },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['resilient', 'fragile', 'ordinary', 'secretive'] },
      explanation:
        'The corals survived conditions that killed other reefs and recovered quickly, so "resilient" (able to recover from difficulty) is the most precise word.',
    },
  },
  {
    title: 'Text Structure and Purpose: challenging an assumption',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_TSP',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'For decades, historians assumed that the town of {town} was founded by traders traveling along the river. Recently, however, archaeologist {name} uncovered farming tools beneath the oldest buildings in the town. These tools, which predate any evidence of trade, suggest that the first residents were farmers who settled there to work the fertile soil.',
      stem: 'Which choice best describes the overall structure of the text?',
      variables: [
        { name: 'town', type: 'choice', options: ['Veldmar', 'Ostrava Creek', 'Lunden', 'Kara-Su'] },
        { name: 'name', type: 'choice', options: ['Sara Holm', 'Timur Rashidov', 'Grace Adeyemi', 'Pablo Ortiz'] },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'It presents a long-held assumption and then describes evidence that challenges it.',
          'It describes a historical event and then explains why that event was quickly forgotten.',
          'It compares two archaeological methods and argues that one is more reliable.',
          'It lists several discoveries and then explains how the research was funded.',
        ],
      },
      explanation:
        'The text first states what historians "assumed" and then, signaled by "however," presents new evidence (the farming tools) that contradicts that assumption.',
    },
  },
  {
    title: 'Cross-Text Connections: school start times',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_CTC',
    difficulty: 'HARD',
    spec: {
      passage:
        'Text 1\nMany researchers argue that teenagers perform better in school when classes begin later in the morning, because adolescents naturally fall asleep and wake up later than adults do.\n\nText 2\nResearcher {name} agrees that adolescents tend to have later sleep schedules. However, after studying {n} schools that adopted later start times, {name.1} found that students\' grades improved only at schools that also limited evening homework, suggesting that start times alone may not explain the improvement.',
      stem: 'Based on the texts, how would {name} (Text 2) most likely respond to the researchers in Text 1?',
      variables: [
        { name: 'name', type: 'choice', options: ['Elena Petrova|she', 'Rustam Aliyev|he', 'Hannah Becker|she', 'Kofi Mensah|he'] },
        { name: 'n', type: 'int', min: 8, max: 30 },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'By suggesting that later start times may improve grades only when combined with other changes',
          'By rejecting the idea that adolescents have different sleep patterns than adults do',
          'By claiming that earlier start times lead to higher grades',
          "By agreeing that start times are the only factor that affects students' grades",
        ],
      },
      explanation:
        '{name} accepts the sleep-schedule claim but found that grades improved only when homework was also limited, so {name.1} would argue that start times alone are not enough.',
    },
  },
  {
    title: 'Central Ideas: gardens near a market',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_CID',
    difficulty: 'EASY',
    spec: {
      passage:
        'In {year}, the city of {city} replaced several parking lots near its central market with small public gardens. City planners hoped the gardens would cool the area during the hottest months. A year later, temperature sensors showed that the streets around the gardens were noticeably cooler than before, and shop owners reported that more visitors stayed to walk through the market.',
      stem: 'Which choice best states the main idea of the text?',
      variables: [
        { name: 'year', type: 'int', min: 2015, max: 2022 },
        { name: 'city', type: 'choice', options: ['Samarkand', 'Valencia', 'Kyoto', 'Lyon', 'Bukhara'] },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'Replacing parking lots with gardens made the area around a market cooler and more appealing to visitors.',
          'Shop owners in the city opposed the plan to build gardens near the market.',
          'Temperature sensors are the most accurate way to measure changes in a city.',
          'The city later built new parking lots in place of the gardens.',
        ],
      },
      explanation: 'The text describes the gardens and their two results: cooler streets and more visitors. The first choice summarizes both.',
    },
  },
  {
    title: 'Command of Evidence (Quantitative): library survey',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_COE_Q',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'A student surveyed members of a public library about their reading habits. In the survey, {a}% of members under age 18 reported reading more than three books per month, compared with {b}% of members aged 18 to 40 and {c}% of members over age 40. The student claims that, among the library\'s members, the youngest group is the most likely to read more than three books per month.',
      stem: "Which choice best describes data from the survey that support the student's claim?",
      variables: [
        { name: 'a', type: 'int', min: 52, max: 75 },
        { name: 'b', type: 'int', min: 30, max: 50 },
        { name: 'c', type: 'int', min: 15, max: 29 },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          '{a}% of members under 18 reported reading more than three books per month, a higher percentage than in either of the other two groups.',
          '{c}% of members over 40 reported reading more than three books per month, a higher percentage than among members under 18.',
          'Members aged 18 to 40 were less likely than members over 40 to read more than three books per month.',
          'Fewer than half of the members in every age group reported reading more than three books per month.',
        ],
      },
      explanation: 'The claim is about the youngest group having the highest percentage. Only the first choice compares {a}% with the other groups\' {b}% and {c}%.',
    },
  },
  {
    title: 'Inferences: fertilizer test',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_INF',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'When {name} tested a new fertilizer, the tomato plants that received it grew taller than the plants that did not. However, the fertilized plants also produced fewer tomatoes. Because the farm sells its tomatoes by weight, {name.1} concluded that the fertilizer ______',
      stem: 'Which choice most logically completes the text?',
      variables: [
        { name: 'name', type: 'choice', options: ['farmer Olivia Grant|she', 'farmer Bekzod Karimov|he', 'farmer Ana Lima|she', 'farmer Jonas Weber|he'] },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'may not benefit the farm, even though it helps the plants grow taller.',
          'should be used on every plant on the farm immediately.',
          'causes tomato plants to grow shorter than usual.',
          'has no effect on how tall tomato plants grow.',
        ],
      },
      explanation: 'The farm earns money from the weight of tomatoes, and the fertilizer reduced the number of tomatoes, so it may not be good for the farm despite taller plants.',
    },
  },
  {
    title: 'Boundaries: semicolon between clauses',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_BOUND',
    difficulty: 'MEDIUM',
    spec: {
      passage:
        'The {bridge} was completed in {year} after nearly a decade of ______ at the time, it was the longest suspension bridge in the region.',
      stem: CONVENTIONS,
      variables: [
        { name: 'bridge', type: 'choice', options: ['Harbor Gate Bridge', 'Silver River Bridge', 'North Valley Bridge'] },
        { name: 'year', type: 'int', min: 1931, max: 1968 },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['construction;', 'construction,', 'construction', 'construction and,'] },
      explanation:
        'Both parts are independent clauses ("The bridge was completed..." and "it was the longest..."). A semicolon correctly joins them; a comma alone creates a comma splice.',
    },
  },
  {
    title: 'Form, Structure, and Sense: subject-verb agreement',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_FSS',
    difficulty: 'EASY',
    spec: {
      passage: 'The collection of rare maps that {donor} donated to the museum ______ now displayed in a special exhibit on the second floor.',
      stem: CONVENTIONS,
      variables: [{ name: 'donor', type: 'choice', options: ['the Rahimov family', 'Professor Ellis', 'a local historian', 'the city council'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['is', 'are', 'were', 'have been'] },
      explanation: 'The subject is the singular noun "collection" (not "maps"), so the singular present-tense verb "is" is correct.',
    },
  },
  {
    title: 'Transitions: preparation',
    section: 'RW',
    domainId: 'RW_EOI',
    skillId: 'RW_EOI_TRANS',
    difficulty: 'EASY',
    spec: {
      passage: '{name} wanted to compete in the regional chess tournament. ______ {name.1} practiced for two hours every evening for three months.',
      stem: 'Which choice completes the text with the most logical transition?',
      variables: [{ name: 'name', type: 'choice', options: ['Madina|she', 'Oliver|he', 'Zara|she', 'Sardor|he'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['To prepare,', 'In contrast,', 'Nevertheless,', 'For instance,'] },
      explanation: 'The second sentence describes what {name} did to get ready for the tournament, so "To prepare," is the logical transition.',
    },
  },
  {
    title: "Rhetorical Synthesis: club's achievement",
    section: 'RW',
    domainId: 'RW_EOI',
    skillId: 'RW_EOI_SYN',
    difficulty: 'HARD',
    spec: {
      passage:
        'While researching a topic, a student has taken the following notes:\n• The {club} robotics club was founded in {year}.\n• The club has {members} members.\n• Last year, the club\'s robot won first place at the national competition.\n• The robot was designed to sort recycling automatically.',
      stem: "The student wants to emphasize the club's achievement. Which choice most effectively uses relevant information from the notes to accomplish this goal?",
      variables: [
        { name: 'club', type: 'choice', options: ['Westfield', 'Chilonzor', 'Maple Grove', 'Yunusobod'] },
        { name: 'year', type: 'int', min: 2008, max: 2019 },
        { name: 'members', type: 'int', min: 15, max: 60 },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          "Last year, the {club} robotics club's recycling-sorting robot won first place at the national competition.",
          'The {club} robotics club, founded in {year}, has {members} members.',
          'The {club} robotics club designed a robot that sorts recycling automatically.',
          'Founded in {year}, the {club} robotics club is open to new members.',
        ],
      },
      explanation: 'Only the first choice mentions the achievement: winning first place at the national competition.',
    },
  },
];
