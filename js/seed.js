// Configuration de départ : catégories, habitudes, priorités, réglages.
// Aucun cours n'est inclus : importe ton emploi du temps (.ics) depuis Réglages › Importer des cours.

export const KINDS = {
  cours: 'Cours', examen: 'Examens & CC', revision: 'Révisions', sport: 'Sport', repas: 'Repas', sommeil: 'Sommeil',
  bde: 'Volley / BDE', sortie: 'Sorties', perso: 'Objectifs perso', marge: 'Marge', autre: 'Autre',
};

// priorités de l'organisation automatique (clé → nature de catégorie)
export const PRIORITY_LABELS = { sommeil: 'Sommeil', etudes: 'Études', repas: 'Repas', sport: 'Sport', perso: 'Objectifs perso', bde: 'Volley / BDE', sortie: 'Sorties' };
export const PRIORITY_KIND = { sommeil: 'sommeil', etudes: 'revision', repas: 'repas', sport: 'sport', perso: 'perso', bde: 'bde', sortie: 'sortie' };

export const SUBJECT_COLORS = ['#5b5bd6', '#2f9e66', '#e5484d', '#d9900b', '#3e7bd6', '#d6409f', '#12a594', '#8e4ec6', '#f76b15', '#0d74ce', '#a18072', '#6e56cf'];

export function seedState() {
  const now = Date.now();
  const cat = (id, name, color, kind) => ({ id, name, color, kind, on: true, updatedAt: now });
  return {
    v: 1,
    settings: {
      theme: 'auto', style: 'plain', dayStart: 7, dayEnd: 24, fit: true, thinRoutines: true, dayChecklist: true,
      view: 'week', workStart: '08:00', workEnd: '22:00', maxStudy: 240, session: 90, margin: 30,
      revisionDefault: 120, examBoost: true, includeRetakes: false, toeflDate: '',
      priorities: ['sommeil', 'etudes', 'repas', 'sport', 'perso', 'bde', 'sortie'],
      updatedAt: now,
    },
    categories: [
      cat('cours', 'Cours', '#5b5bd6', 'cours'),
      cat('examen', 'Examens & CC', '#e5484d', 'examen'),
      cat('revision', 'Révisions', '#2f9e66', 'revision'),
      cat('sport', 'Sport', '#f76b15', 'sport'),
      cat('repas', 'Repas', '#d9900b', 'repas'),
      cat('sommeil', 'Sommeil', '#8e8ea0', 'sommeil'),
      cat('bde', 'Volley / BDE', '#d6409f', 'bde'),
      cat('sortie', 'Sorties', '#3e7bd6', 'sortie'),
      cat('perso', 'Objectifs perso', '#12a594', 'perso'),
      cat('marge', 'Marge', '#a1a1a8', 'marge'),
      cat('autre', 'Autre', '#6d6d75', 'autre'),
    ],
    subjects: [],
    habits: [
      { id: 'h-sleep', name: 'Sommeil', cat: 'sommeil', mode: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], start: '23:30', end: '07:30', dur: 480, perWeek: 7, on: true, updatedAt: now },
      { id: 'h-lunch', name: 'Déjeuner', cat: 'repas', mode: 'window', days: [0, 1, 2, 3, 4, 5, 6], start: '11:45', end: '14:00', dur: 45, perWeek: 7, on: true, updatedAt: now },
      { id: 'h-dinner', name: 'Dîner', cat: 'repas', mode: 'window', days: [0, 1, 2, 3, 4, 5, 6], start: '19:00', end: '21:30', dur: 45, perWeek: 7, on: true, updatedAt: now },
      { id: 'h-sport', name: 'Sport', cat: 'sport', mode: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], start: '17:00', end: '21:30', dur: 75, perWeek: 3, on: true, updatedAt: now },
    ],
    goals: [],
    tasks: [],
    events: [],
    deleted: {},
  };
}
