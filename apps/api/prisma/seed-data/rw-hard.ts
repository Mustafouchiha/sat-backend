import type { SeedTemplate } from './types';

const COMPLETE = 'Which choice completes the text with the most logical and precise word or phrase?';
const CONVENTIONS = 'Which choice completes the text so that it conforms to the conventions of Standard English?';

/** Qiyin (HARD) Reading & Writing shablonlari. */
export const RW_HARD_TEMPLATES: SeedTemplate[] = [
  {
    title: 'Cross-Text Connections: printing and literacy',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_CTC',
    difficulty: 'HARD',
    spec: {
      passage:
        'Text 1\nMany historians describe the printing press as the main reason literacy spread quickly in fifteenth-century Europe. Because printed books cost far less than handwritten ones, they argue, far more people could afford to own and read books.\n\nText 2\nHistorian {name} agrees that printing lowered the cost of books. But {name.1} points out that in several regions, literacy rates rose sharply only after local schools opened, sometimes decades after printing presses arrived. In {name.2} view, cheaper books mattered most once people had a place to learn to read them.',
      stem: 'Based on the texts, how would {name} (Text 2) most likely respond to the historians in Text 1?',
      variables: [
        { name: 'name', type: 'choice', options: ['Lucia Moretti|she|her', 'Farrukh Ismoilov|he|his', 'Anna Kowalska|she|her', 'David Mensah|he|his'] },
      ],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'By arguing that cheaper books alone do not fully explain the spread of literacy, because access to schooling also played a major role',
          'By rejecting the claim that printed books were less expensive than handwritten ones',
          'By agreeing that the printing press was the only important cause of rising literacy',
          'By claiming that schools became less common after the printing press was invented',
        ],
      },
      explanation:
        '{name} accepts that printing made books cheaper but adds that literacy rose sharply only after schools opened. So {name.1} would say that the historians in Text 1 leave out an important factor, not that they are wrong about book prices.',
    },
  },
  {
    title: 'Text Structure and Purpose: function of a sentence',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_TSP',
    difficulty: 'HARD',
    spec: {
      passage:
        'Several species of {animal} live deep underground and have no functioning eyes. For decades, biologists assumed that these animals simply lost their eyes over many generations because eyes are useless in total darkness. A recent study, however, found that building and maintaining eye tissue uses a surprising amount of energy. In caves where food is scarce, animals that do not spend energy on eyes may have a better chance of surviving.',
      stem: 'Which choice best describes the function of the third sentence in the overall structure of the text?',
      variables: [{ name: 'animal', type: 'choice', options: ['blind cavefish', 'cave salamanders', 'cave shrimp'] }],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'It introduces a finding that suggests a more specific explanation for the loss of eyes than the one biologists had assumed.',
          'It presents a claim that the final sentence of the text shows to be incorrect.',
          'It describes the method that researchers used to find animals in dark caves.',
          'It gives an example of an animal that regained its eyes after leaving a cave.',
        ],
      },
      explanation:
        'The second sentence gives the old, general assumption. The third sentence, signaled by "however," introduces a new finding about the energy cost of eyes, and the last sentence explains how that finding offers a more specific reason why cave animals lost their eyes.',
    },
  },
  {
    title: 'Command of Evidence (Textual): weakening a claim',
    section: 'RW',
    domainId: 'RW_II',
    skillId: 'RW_II_COE_T',
    difficulty: 'HARD',
    spec: {
      passage:
        'Urban planner {name} claims that adding protected bike lanes to a street increases sales at the shops on that street, because more cyclists stop to shop when they feel safe riding there.',
      stem: "Which finding, if true, would most directly weaken {name}'s claim?",
      variables: [{ name: 'name', type: 'choice', options: ['Sevara Qodirova', 'Martin Novak', 'Priya Raman', 'Lucas Brennan'] }],
      answer: {
        kind: 'MCQ_TEXT',
        choices: [
          'On streets where protected bike lanes were added, shop sales rose by the same amount as on similar nearby streets where no bike lanes were added.',
          'Many cyclists say that they feel safer riding in protected bike lanes than riding in traffic.',
          'Shops on streets with new protected bike lanes reported more customers arriving by bicycle than before.',
          'Some cities have added protected bike lanes to streets in both business and residential areas.',
        ],
      },
      explanation:
        'If sales rose just as much on similar streets without bike lanes, then the bike lanes do not explain the increase. The second and third choices would support the claim, and the fourth is unrelated to sales.',
    },
  },
  {
    title: 'Boundaries: semicolons in a complex series',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_BOUND',
    difficulty: 'HARD',
    spec: {
      passage: "The orchestra's spring tour will include performances in {trip}, {trip.1}; {trip.2}, ______ {trip.4}, {trip.5}.",
      stem: CONVENTIONS,
      variables: [
        {
          name: 'trip',
          type: 'choice',
          options: [
            'Lyon|France|Turin|Italy|Graz|Austria',
            'Porto|Portugal|Seville|Spain|Nice|France',
            'Bukhara|Uzbekistan|Almaty|Kazakhstan|Bishkek|Kyrgyzstan',
            'Krakow|Poland|Brno|Czechia|Pecs|Hungary',
          ],
        },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['{trip.3}; and', '{trip.3}, and', '{trip.3} and', '{trip.3}: and'] },
      explanation:
        'Each item in this list already contains a comma ("{trip}, {trip.1}"). When items contain commas, semicolons separate the items so the reader can tell where one ends, so a semicolon must follow "{trip.3}."',
    },
  },
  {
    title: 'Form, Structure, and Sense: agreement across a phrase',
    section: 'RW',
    domainId: 'RW_SEC',
    skillId: 'RW_SEC_FSS',
    difficulty: 'HARD',
    spec: {
      passage:
        'The collection of rare {item}, along with several hand-drawn maps from the same period, ______ on display at the {place} until the end of the year.',
      stem: CONVENTIONS,
      variables: [
        { name: 'item', type: 'choice', options: ['manuscripts', 'botanical sketches', 'travel journals'] },
        { name: 'place', type: 'choice', options: ['city library', 'national museum', 'university gallery'] },
      ],
      answer: { kind: 'MCQ_TEXT', choices: ['is', 'are', 'were', 'have been'] },
      explanation:
        'The subject is "collection," which is singular. The phrases "of rare {item}" and "along with several hand-drawn maps" do not change the number of the subject, so the singular present-tense verb "is" is correct.',
    },
  },
  {
    title: 'Words in Context: equivocal',
    section: 'RW',
    domainId: 'RW_CS',
    skillId: 'RW_CS_WIC',
    difficulty: 'HARD',
    spec: {
      passage:
        "When reporters asked whether the city would approve the new stadium, the {role}'s response was notably ______: {role.1} praised the project's possible benefits, listed several serious concerns, and never said whether {role.1} would support it.",
      stem: COMPLETE,
      variables: [{ name: 'role', type: 'choice', options: ['mayor|she', 'governor|he', 'council president|she', 'city manager|he'] }],
      answer: { kind: 'MCQ_TEXT', choices: ['equivocal', 'enthusiastic', 'hostile', 'brief'] },
      explanation:
        'The response mixed praise with concerns and never took a clear position, so it was "equivocal," meaning open to more than one interpretation. It was not enthusiastic or hostile, and listing benefits and several concerns is not brief.',
    },
  },
];
