export type CountryInfo = {
  iso: string;
  fifa: string;
  es: string;
  en: string;
  wikiTeam: string;
  wikiWorldCup: string;
};

const ENTRIES: CountryInfo[] = [
  { iso: "dz", fifa: "ALG", es: "Argelia", en: "Algeria", wikiTeam: "Algeria_national_football_team", wikiWorldCup: "Algeria_at_the_FIFA_World_Cup" },
  { iso: "ar", fifa: "ARG", es: "Argentina", en: "Argentina", wikiTeam: "Argentina_national_football_team", wikiWorldCup: "Argentina_at_the_FIFA_World_Cup" },
  { iso: "au", fifa: "AUS", es: "Australia", en: "Australia", wikiTeam: "Australia_men's_national_soccer_team", wikiWorldCup: "Australia_at_the_FIFA_World_Cup" },
  { iso: "at", fifa: "AUT", es: "Austria", en: "Austria", wikiTeam: "Austria_national_football_team", wikiWorldCup: "Austria_at_the_FIFA_World_Cup" },
  { iso: "be", fifa: "BEL", es: "Bélgica", en: "Belgium", wikiTeam: "Belgium_national_football_team", wikiWorldCup: "Belgium_at_the_FIFA_World_Cup" },
  { iso: "ba", fifa: "BIH", es: "Bosnia y Herzegovina", en: "Bosnia and Herzegovina", wikiTeam: "Bosnia_and_Herzegovina_national_football_team", wikiWorldCup: "Bosnia_and_Herzegovina_at_the_FIFA_World_Cup" },
  { iso: "br", fifa: "BRA", es: "Brasil", en: "Brazil", wikiTeam: "Brazil_national_football_team", wikiWorldCup: "Brazil_at_the_FIFA_World_Cup" },
  { iso: "ca", fifa: "CAN", es: "Canadá", en: "Canada", wikiTeam: "Canada_men's_national_soccer_team", wikiWorldCup: "Canada_at_the_FIFA_World_Cup" },
  { iso: "cl", fifa: "CHI", es: "Chile", en: "Chile", wikiTeam: "Chile_national_football_team", wikiWorldCup: "Chile_at_the_FIFA_World_Cup" },
  { iso: "ci", fifa: "CIV", es: "Costa de Marfil", en: "Ivory Coast", wikiTeam: "Ivory_Coast_national_football_team", wikiWorldCup: "Ivory_Coast_at_the_FIFA_World_Cup" },
  { iso: "cd", fifa: "COD", es: "RD del Congo", en: "DR Congo", wikiTeam: "DR_Congo_national_football_team", wikiWorldCup: "DR_Congo_at_the_FIFA_World_Cup" },
  { iso: "co", fifa: "COL", es: "Colombia", en: "Colombia", wikiTeam: "Colombia_national_football_team", wikiWorldCup: "Colombia_at_the_FIFA_World_Cup" },
  { iso: "cv", fifa: "CPV", es: "Cabo Verde", en: "Cape Verde", wikiTeam: "Cape_Verde_national_football_team", wikiWorldCup: "Cape_Verde_at_the_FIFA_World_Cup" },
  { iso: "cr", fifa: "CRC", es: "Costa Rica", en: "Costa Rica", wikiTeam: "Costa_Rica_national_football_team", wikiWorldCup: "Costa_Rica_at_the_FIFA_World_Cup" },
  { iso: "hr", fifa: "CRO", es: "Croacia", en: "Croatia", wikiTeam: "Croatia_national_football_team", wikiWorldCup: "Croatia_at_the_FIFA_World_Cup" },
  { iso: "cw", fifa: "CUW", es: "Curazao", en: "Curaçao", wikiTeam: "Curaçao_national_football_team", wikiWorldCup: "Curaçao_at_the_FIFA_World_Cup" },
  { iso: "cz", fifa: "CZE", es: "República Checa", en: "Czech Republic", wikiTeam: "Czech_Republic_national_football_team", wikiWorldCup: "Czech_Republic_at_the_FIFA_World_Cup" },
  { iso: "dk", fifa: "DEN", es: "Dinamarca", en: "Denmark", wikiTeam: "Denmark_national_football_team", wikiWorldCup: "Denmark_at_the_FIFA_World_Cup" },
  { iso: "ec", fifa: "ECU", es: "Ecuador", en: "Ecuador", wikiTeam: "Ecuador_national_football_team", wikiWorldCup: "Ecuador_at_the_FIFA_World_Cup" },
  { iso: "eg", fifa: "EGY", es: "Egipto", en: "Egypt", wikiTeam: "Egypt_national_football_team", wikiWorldCup: "Egypt_at_the_FIFA_World_Cup" },
  { iso: "gb-eng", fifa: "ENG", es: "Inglaterra", en: "England", wikiTeam: "England_national_football_team", wikiWorldCup: "England_at_the_FIFA_World_Cup" },
  { iso: "es", fifa: "ESP", es: "España", en: "Spain", wikiTeam: "Spain_national_football_team", wikiWorldCup: "Spain_at_the_FIFA_World_Cup" },
  { iso: "fr", fifa: "FRA", es: "Francia", en: "France", wikiTeam: "France_national_football_team", wikiWorldCup: "France_at_the_FIFA_World_Cup" },
  { iso: "de", fifa: "GER", es: "Alemania", en: "Germany", wikiTeam: "Germany_national_football_team", wikiWorldCup: "Germany_at_the_FIFA_World_Cup" },
  { iso: "gh", fifa: "GHA", es: "Ghana", en: "Ghana", wikiTeam: "Ghana_national_football_team", wikiWorldCup: "Ghana_at_the_FIFA_World_Cup" },
  { iso: "ht", fifa: "HAI", es: "Haití", en: "Haiti", wikiTeam: "Haiti_national_football_team", wikiWorldCup: "Haiti_at_the_FIFA_World_Cup" },
  { iso: "hu", fifa: "HUN", es: "Hungría", en: "Hungary", wikiTeam: "Hungary_national_football_team", wikiWorldCup: "Hungary_at_the_FIFA_World_Cup" },
  { iso: "ir", fifa: "IRN", es: "Irán", en: "Iran", wikiTeam: "Iran_national_football_team", wikiWorldCup: "Iran_at_the_FIFA_World_Cup" },
  { iso: "iq", fifa: "IRQ", es: "Irak", en: "Iraq", wikiTeam: "Iraq_national_football_team", wikiWorldCup: "Iraq_at_the_FIFA_World_Cup" },
  { iso: "it", fifa: "ITA", es: "Italia", en: "Italy", wikiTeam: "Italy_national_football_team", wikiWorldCup: "Italy_at_the_FIFA_World_Cup" },
  { iso: "jm", fifa: "JAM", es: "Jamaica", en: "Jamaica", wikiTeam: "Jamaica_national_football_team", wikiWorldCup: "Jamaica_at_the_FIFA_World_Cup" },
  { iso: "jo", fifa: "JOR", es: "Jordania", en: "Jordan", wikiTeam: "Jordan_national_football_team", wikiWorldCup: "Jordan_at_the_FIFA_World_Cup" },
  { iso: "jp", fifa: "JPN", es: "Japón", en: "Japan", wikiTeam: "Japan_national_football_team", wikiWorldCup: "Japan_at_the_FIFA_World_Cup" },
  { iso: "kr", fifa: "KOR", es: "Corea del Sur", en: "South Korea", wikiTeam: "South_Korea_national_football_team", wikiWorldCup: "South_Korea_at_the_FIFA_World_Cup" },
  { iso: "sa", fifa: "KSA", es: "Arabia Saudita", en: "Saudi Arabia", wikiTeam: "Saudi_Arabia_national_football_team", wikiWorldCup: "Saudi_Arabia_at_the_FIFA_World_Cup" },
  { iso: "ma", fifa: "MAR", es: "Marruecos", en: "Morocco", wikiTeam: "Morocco_national_football_team", wikiWorldCup: "Morocco_at_the_FIFA_World_Cup" },
  { iso: "mx", fifa: "MEX", es: "México", en: "Mexico", wikiTeam: "Mexico_national_football_team", wikiWorldCup: "Mexico_at_the_FIFA_World_Cup" },
  { iso: "nl", fifa: "NED", es: "Países Bajos", en: "Netherlands", wikiTeam: "Netherlands_national_football_team", wikiWorldCup: "Netherlands_at_the_FIFA_World_Cup" },
  { iso: "ng", fifa: "NGA", es: "Nigeria", en: "Nigeria", wikiTeam: "Nigeria_national_football_team", wikiWorldCup: "Nigeria_at_the_FIFA_World_Cup" },
  { iso: "no", fifa: "NOR", es: "Noruega", en: "Norway", wikiTeam: "Norway_national_football_team", wikiWorldCup: "Norway_at_the_FIFA_World_Cup" },
  { iso: "nz", fifa: "NZL", es: "Nueva Zelanda", en: "New Zealand", wikiTeam: "New_Zealand_national_football_team", wikiWorldCup: "New_Zealand_at_the_FIFA_World_Cup" },
  { iso: "pa", fifa: "PAN", es: "Panamá", en: "Panama", wikiTeam: "Panama_national_football_team", wikiWorldCup: "Panama_at_the_FIFA_World_Cup" },
  { iso: "py", fifa: "PAR", es: "Paraguay", en: "Paraguay", wikiTeam: "Paraguay_national_football_team", wikiWorldCup: "Paraguay_at_the_FIFA_World_Cup" },
  { iso: "pt", fifa: "POR", es: "Portugal", en: "Portugal", wikiTeam: "Portugal_national_football_team", wikiWorldCup: "Portugal_at_the_FIFA_World_Cup" },
  { iso: "qa", fifa: "QAT", es: "Catar", en: "Qatar", wikiTeam: "Qatar_national_football_team", wikiWorldCup: "Qatar_at_the_FIFA_World_Cup" },
  { iso: "ro", fifa: "ROU", es: "Rumanía", en: "Romania", wikiTeam: "Romania_national_football_team", wikiWorldCup: "Romania_at_the_FIFA_World_Cup" },
  { iso: "za", fifa: "RSA", es: "Sudáfrica", en: "South Africa", wikiTeam: "South_Africa_national_football_team", wikiWorldCup: "South_Africa_at_the_FIFA_World_Cup" },
  { iso: "gb-sct", fifa: "SCO", es: "Escocia", en: "Scotland", wikiTeam: "Scotland_national_football_team", wikiWorldCup: "Scotland_at_the_FIFA_World_Cup" },
  { iso: "sn", fifa: "SEN", es: "Senegal", en: "Senegal", wikiTeam: "Senegal_national_football_team", wikiWorldCup: "Senegal_at_the_FIFA_World_Cup" },
  { iso: "rs", fifa: "SRB", es: "Serbia", en: "Serbia", wikiTeam: "Serbia_national_football_team", wikiWorldCup: "Serbia_at_the_FIFA_World_Cup" },
  { iso: "ch", fifa: "SUI", es: "Suiza", en: "Switzerland", wikiTeam: "Switzerland_national_football_team", wikiWorldCup: "Switzerland_at_the_FIFA_World_Cup" },
  { iso: "se", fifa: "SWE", es: "Suecia", en: "Sweden", wikiTeam: "Sweden_national_football_team", wikiWorldCup: "Sweden_at_the_FIFA_World_Cup" },
  { iso: "tn", fifa: "TUN", es: "Túnez", en: "Tunisia", wikiTeam: "Tunisia_national_football_team", wikiWorldCup: "Tunisia_at_the_FIFA_World_Cup" },
  { iso: "tr", fifa: "TUR", es: "Turquía", en: "Turkey", wikiTeam: "Turkey_national_football_team", wikiWorldCup: "Turkey_at_the_FIFA_World_Cup" },
  { iso: "ae", fifa: "UAE", es: "Emiratos Árabes Unidos", en: "United Arab Emirates", wikiTeam: "United_Arab_Emirates_national_football_team", wikiWorldCup: "United_Arab_Emirates_at_the_FIFA_World_Cup" },
  { iso: "ua", fifa: "UKR", es: "Ucrania", en: "Ukraine", wikiTeam: "Ukraine_national_football_team", wikiWorldCup: "Ukraine_at_the_FIFA_World_Cup" },
  { iso: "uy", fifa: "URU", es: "Uruguay", en: "Uruguay", wikiTeam: "Uruguay_national_football_team", wikiWorldCup: "Uruguay_at_the_FIFA_World_Cup" },
  { iso: "us", fifa: "USA", es: "Estados Unidos", en: "United States", wikiTeam: "United_States_men's_national_soccer_team", wikiWorldCup: "United_States_at_the_FIFA_World_Cup" },
  { iso: "uz", fifa: "UZB", es: "Uzbekistán", en: "Uzbekistan", wikiTeam: "Uzbekistan_national_football_team", wikiWorldCup: "Uzbekistan_at_the_FIFA_World_Cup" },
  { iso: "ve", fifa: "VEN", es: "Venezuela", en: "Venezuela", wikiTeam: "Venezuela_national_football_team", wikiWorldCup: "Venezuela_at_the_FIFA_World_Cup" },
  { iso: "gb-wls", fifa: "WAL", es: "Gales", en: "Wales", wikiTeam: "Wales_national_football_team", wikiWorldCup: "Wales_at_the_FIFA_World_Cup" },
];

const BY_ISO = new Map(ENTRIES.map((e) => [e.iso.toLowerCase(), e]));
const BY_FIFA = new Map(ENTRIES.map((e) => [e.fifa.toLowerCase(), e]));

export function countryByCode(code: string): CountryInfo | null {
  if (!code) return null;
  const k = code.toLowerCase();
  return BY_ISO.get(k) ?? BY_FIFA.get(k) ?? null;
}

export function allCountries(): CountryInfo[] {
  return ENTRIES.slice();
}
