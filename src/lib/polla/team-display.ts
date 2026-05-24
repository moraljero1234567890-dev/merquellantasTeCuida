import type { TeamRef } from "./types";

const FIFA_FALLBACK: Record<string, { iso: string; name: string }> = {
  alg: { iso: "dz", name: "Argelia" },
  arg: { iso: "ar", name: "Argentina" },
  aus: { iso: "au", name: "Australia" },
  aut: { iso: "at", name: "Austria" },
  bel: { iso: "be", name: "Bélgica" },
  bih: { iso: "ba", name: "Bosnia y Herzegovina" },
  bra: { iso: "br", name: "Brasil" },
  can: { iso: "ca", name: "Canadá" },
  chi: { iso: "cl", name: "Chile" },
  civ: { iso: "ci", name: "Costa de Marfil" },
  cod: { iso: "cd", name: "RD del Congo" },
  col: { iso: "co", name: "Colombia" },
  cpv: { iso: "cv", name: "Cabo Verde" },
  crc: { iso: "cr", name: "Costa Rica" },
  cro: { iso: "hr", name: "Croacia" },
  cuw: { iso: "cw", name: "Curazao" },
  cze: { iso: "cz", name: "República Checa" },
  den: { iso: "dk", name: "Dinamarca" },
  ecu: { iso: "ec", name: "Ecuador" },
  egy: { iso: "eg", name: "Egipto" },
  eng: { iso: "gb-eng", name: "Inglaterra" },
  esp: { iso: "es", name: "España" },
  fra: { iso: "fr", name: "Francia" },
  ger: { iso: "de", name: "Alemania" },
  gha: { iso: "gh", name: "Ghana" },
  hai: { iso: "ht", name: "Haití" },
  hun: { iso: "hu", name: "Hungría" },
  irn: { iso: "ir", name: "Irán" },
  irq: { iso: "iq", name: "Irak" },
  ita: { iso: "it", name: "Italia" },
  jam: { iso: "jm", name: "Jamaica" },
  jor: { iso: "jo", name: "Jordania" },
  jpn: { iso: "jp", name: "Japón" },
  kor: { iso: "kr", name: "Corea del Sur" },
  ksa: { iso: "sa", name: "Arabia Saudita" },
  mar: { iso: "ma", name: "Marruecos" },
  mex: { iso: "mx", name: "México" },
  ned: { iso: "nl", name: "Países Bajos" },
  nga: { iso: "ng", name: "Nigeria" },
  nor: { iso: "no", name: "Noruega" },
  nzl: { iso: "nz", name: "Nueva Zelanda" },
  pan: { iso: "pa", name: "Panamá" },
  par: { iso: "py", name: "Paraguay" },
  por: { iso: "pt", name: "Portugal" },
  qat: { iso: "qa", name: "Catar" },
  rou: { iso: "ro", name: "Rumanía" },
  rsa: { iso: "za", name: "Sudáfrica" },
  sco: { iso: "gb-sct", name: "Escocia" },
  sen: { iso: "sn", name: "Senegal" },
  srb: { iso: "rs", name: "Serbia" },
  sui: { iso: "ch", name: "Suiza" },
  swe: { iso: "se", name: "Suecia" },
  tun: { iso: "tn", name: "Túnez" },
  tur: { iso: "tr", name: "Turquía" },
  uae: { iso: "ae", name: "Emiratos Árabes Unidos" },
  ukr: { iso: "ua", name: "Ucrania" },
  uru: { iso: "uy", name: "Uruguay" },
  usa: { iso: "us", name: "Estados Unidos" },
  uzb: { iso: "uz", name: "Uzbekistán" },
  ven: { iso: "ve", name: "Venezuela" },
  wal: { iso: "gb-wls", name: "Gales" },
};

export function flagUrl(code: string): string {
  if (!code) return "";
  return `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
}

export function normalizeTeam(team: TeamRef): TeamRef {
  const fix = FIFA_FALLBACK[(team.code ?? "").toLowerCase()];
  if (!fix) return team;
  const looksRawCode =
    !team.name ||
    /^[A-Z]{2,4}$/.test(team.name.trim()) ||
    team.name.trim().toLowerCase() === team.code.toLowerCase();
  return {
    code: fix.iso,
    name: looksRawCode ? fix.name : team.name,
    crest: flagUrl(fix.iso),
  };
}

export function displayTeam(
  code: string,
  name: string,
): { code: string; name: string; crest: string } {
  const fix = FIFA_FALLBACK[(code ?? "").toLowerCase()];
  if (!fix) {
    return { code, name, crest: flagUrl(code) };
  }
  const looksRawCode =
    !name ||
    /^[A-Z]{2,4}$/.test(name.trim()) ||
    name.trim().toLowerCase() === code.toLowerCase();
  return {
    code: fix.iso,
    name: looksRawCode ? fix.name : name,
    crest: flagUrl(fix.iso),
  };
}
