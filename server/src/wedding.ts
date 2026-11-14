/** Dados fixos do casamento (fonte: site oficial www.casoriobabitos.com.br, em 09/11/2026). */
export const WEDDING = {
  couple: 'Pedro & Babi',
  shortCouple: 'Pedro & Babi',
  /** ISO com fuso de Fortaleza (UTC-3) */
  dateTime: '2026-11-19T15:30:00-03:00',
  dateLabel: '19 de novembro de 2026',
  timeLabel: '15h30',
  venue: 'Beach Club Aquiraz Riviera',
  venueCity: 'Aquiraz/CE',
  venueNote:
    'No complexo Aquiraz Riviera, de frente para a praia: cerca de 1h de Fortaleza e 10 min de carro da Praia do Presídio. A festa vai até as 23h. Quem não ficar perto deve combinar o transporte de volta com antecedência, porque Uber à noite na região é difícil.',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Beach+Club+Aquiraz+Riviera',
  officialSite: 'https://www.casoriobabitos.com.br',
  giftsUrl: 'https://casoriobabitos.com.br/#/presentes',
  /** Chave Pix dos noivos (e-mail), para quem preferir presentear assim */
  pixKey: 'babicoelhocintra@gmail.com',
  instagramUrl: 'https://www.instagram.com/casoriobabitos/',
  /** Guia do Convidado (PDF dos noivos, servido pelo próprio site) */
  guideUrl: '/guia-do-convidado.pdf',
  dressCode: 'Esporte fino',
  dressCodeDetails:
    'Casamento ao ar livre, de frente para a praia, com clima leve sem perder a elegância. Cerimônia e festa na grama, com vento moderado: se for de salto, prefira salto grosso, plataforma ou anabela.',
  verse: 'Dizem que os opostos se atraem. A gente prefere dizer que se complementam.',
  /**
   * Combinados que são alternativas entre si (a pessoa escolhe um): quem disse "vou" em um deles
   * não conta como indeciso nos outros.
   */
  alternatives: [{ label: 'Sábado de dia', eventIds: ['prog-beach-park', 'prog-buggy', 'prog-resort'] }],
  /** Programação do fim de semana (site oficial) */
  schedule: [
    { date: '2026-11-19', label: 'Quinta, 19/11', title: 'Cerimônia e festa', detail: 'Das 15h30 às 23h, no Beach Club Aquiraz Riviera' },
    { date: '2026-11-20', label: 'Sexta, 20/11', title: 'Dia de praia, piscina e pagode', detail: null },
    {
      date: '2026-11-21',
      label: 'Sábado, 21/11',
      title: 'Beach Park ou passeio de buggy',
      detail: 'Beach Park para quem tem filhos; passeio de buggy pela região para os demais',
    },
    { date: '2026-11-22', label: 'Domingo, 22/11', title: 'Despedida e volta pra casa', detail: null },
  ],
  /** Centro inicial do mapa: entre Fortaleza e o Aquiraz Riviera */
  mapCenter: { lat: -3.84, lng: -38.43 },
  mapZoom: 10,
  timeZone: 'America/Fortaleza',
} as const;
