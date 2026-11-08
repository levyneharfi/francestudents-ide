import type { ReplyBlock } from "../../../packages/francestudent-client/src/replies";
export const exampleBlocks: ReplyBlock[] = [
  {
    v: 1,
    id: "week-chart",
    kind: "chart",
    title: "Répartition proposée",
    description: "Exemple fictif · aucune application consultée",
    chart: "bar",
    unit: "h",
    data: [
      { label: "Lun", value: 8 },
      { label: "Mar", value: 6 },
      { label: "Mer", value: 7 },
      { label: "Jeu", value: 9 },
      { label: "Ven", value: 6 },
    ],
  },
  {
    v: 1,
    id: "week-tasks",
    kind: "checklist",
    title: "Préparer la réunion",
    items: [
      { id: "read", label: "Relire les documents principaux" },
      { id: "points", label: "Préparer les points à discuter" },
      { id: "slides", label: "Mettre à jour les supports" },
      { id: "invite", label: "Préparer l’invitation des participants" },
    ],
  },
  {
    v: 1,
    id: "week-priority",
    kind: "form",
    title: "Quelle priorité ?",
    fields: [
      {
        id: "priority",
        label: "Votre priorité",
        options: ["Travail", "Personnel", "Les deux"],
      },
    ],
    submitLabel: "Continuer",
  },
  {
    v: 1,
    id: "week-flow",
    kind: "diagram",
    title: "Votre préparation, étape par étape",
    description: "Organisation proposée, à adapter à vos besoins.",
    code: "flowchart TD\n A[Clarifier les priorités] --> B[Rassembler les documents]\n B --> C[Préparer la réunion]\n C --> D[Vérifier ensemble]",
  },
];
