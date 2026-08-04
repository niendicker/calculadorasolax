export const tariffSubgroups = [
  {
    value: 'A1',
    label: 'A1 — Alta tensão, 230 kV ou superior',
    group: 'A',
  },
  {
    value: 'A2',
    label: 'A2 — Alta tensão, 88 kV a 138 kV',
    group: 'A',
  },
  {
    value: 'A3',
    label: 'A3 — Alta tensão, 69 kV',
    group: 'A',
  },
  {
    value: 'A3a',
    label: 'A3a — Média tensão, 30 kV a 44 kV',
    group: 'A',
  },
  {
    value: 'A4',
    label: 'A4 — Média tensão, 2,3 kV a 25 kV',
    group: 'A',
  },
  {
    value: 'AS',
    label: 'AS — Sistema subterrâneo de distribuição',
    group: 'A',
  },
  {
    value: 'B1',
    label: 'B1 — Residencial',
    group: 'B',
  },
  {
    value: 'B2',
    label: 'B2 — Rural',
    group: 'B',
  },
  {
    value: 'B3',
    label: 'B3 — Comércio, indústria, serviços e demais classes',
    group: 'B',
  },
  {
    value: 'B4',
    label: 'B4 — Iluminação pública',
    group: 'B',
  },
] as const;

export type TariffSubgroupValue = (typeof tariffSubgroups)[number]['value'];
