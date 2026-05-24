export type Team = { code: string; name: string };
export type Match = {
  id: string;
  group: string;
  matchday: 1 | 2 | 3;
  date: string;
  time: string;
  venue: string;
  city: string;
  home: Team;
  away: Team;
};

const TEAM_DATA: Record<string, [string, string][]> = {
  A: [["mx", "México"], ["no", "Noruega"], ["sa", "Arabia Saudita"], ["is", "Islandia"]],
  B: [["ar", "Argentina"], ["eg", "Egipto"], ["uz", "Uzbekistán"], ["cv", "Cabo Verde"]],
  C: [["fr", "Francia"], ["sn", "Senegal"], ["au", "Australia"], ["bo", "Bolivia"]],
  D: [["gb-eng", "Inglaterra"], ["hr", "Croacia"], ["ir", "Irán"], ["jm", "Jamaica"]],
  E: [["de", "Alemania"], ["jp", "Japón"], ["ma", "Marruecos"], ["pa", "Panamá"]],
  F: [["pt", "Portugal"], ["ch", "Suiza"], ["cr", "Costa Rica"], ["qa", "Catar"]],
  G: [["es", "España"], ["ng", "Nigeria"], ["nz", "Nueva Zelanda"], ["dz", "Argelia"]],
  H: [["br", "Brasil"], ["kr", "Corea del Sur"], ["ci", "Costa de Marfil"], ["tn", "Túnez"]],
  I: [["us", "Estados Unidos"], ["it", "Italia"], ["ec", "Ecuador"], ["se", "Suecia"]],
  J: [["ca", "Canadá"], ["be", "Bélgica"], ["py", "Paraguay"], ["iq", "Irak"]],
  K: [["nl", "Países Bajos"], ["co", "Colombia"], ["tr", "Turquía"], ["za", "Sudáfrica"]],
  L: [["uy", "Uruguay"], ["dk", "Dinamarca"], ["hu", "Hungría"], ["at", "Austria"]],
};

const VENUE_POOL: [string, string][] = [
  ["Estadio Azteca", "Ciudad de México"],
  ["MetLife Stadium", "East Rutherford, NJ"],
  ["SoFi Stadium", "Los Ángeles"],
  ["AT&T Stadium", "Arlington, TX"],
  ["BMO Field", "Toronto"],
  ["BC Place", "Vancouver"],
  ["Estadio Akron", "Guadalajara"],
  ["Estadio BBVA", "Monterrey"],
  ["Mercedes-Benz Stadium", "Atlanta"],
  ["Hard Rock Stadium", "Miami"],
  ["Lincoln Financial Field", "Filadelfia"],
  ["NRG Stadium", "Houston"],
  ["Arrowhead Stadium", "Kansas City"],
  ["Levi's Stadium", "Santa Clara"],
  ["Lumen Field", "Seattle"],
  ["Gillette Stadium", "Foxborough, MA"],
];

const PAIRS: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

const TIMES = ["12:00", "15:00", "18:00", "21:00"];
const MATCHDAY_BASE: Record<1 | 2 | 3, number> = { 1: 11, 2: 17, 3: 23 };

function buildMatches(): Match[] {
  const out: Match[] = [];
  const groupKeys = Object.keys(TEAM_DATA);
  let venueIdx = 0;
  let timeIdx = 0;
  groupKeys.forEach((groupKey, groupIdx) => {
    const teams: Team[] = TEAM_DATA[groupKey].map(([code, name]) => ({ code, name }));
    PAIRS.forEach((pairs, mdIdx) => {
      const matchday = (mdIdx + 1) as 1 | 2 | 3;
      const day = MATCHDAY_BASE[matchday] + Math.floor(groupIdx / 2);
      const date = `2026-06-${String(day).padStart(2, "0")}`;
      pairs.forEach(([hi, ai]) => {
        const [venue, city] = VENUE_POOL[venueIdx % VENUE_POOL.length];
        const time = TIMES[timeIdx % TIMES.length];
        venueIdx++;
        timeIdx++;
        out.push({
          id: `${groupKey}${matchday}-${teams[hi].code}-${teams[ai].code}`,
          group: groupKey,
          matchday,
          date,
          time,
          venue,
          city,
          home: teams[hi],
          away: teams[ai],
        });
      });
    });
  });
  return out;
}

export const matches: Match[] = buildMatches();
export const teamsByGroup: Record<string, Team[]> = Object.fromEntries(
  Object.entries(TEAM_DATA).map(([k, arr]) => [k, arr.map(([code, name]) => ({ code, name }))])
);
export const groupKeys = Object.keys(TEAM_DATA);

export function flagSrc(code: string, w: 40 | 80 | 160 = 80): string {
  return `https://flagcdn.com/w${w}/${code}.png`;
}

export function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}`;
}
