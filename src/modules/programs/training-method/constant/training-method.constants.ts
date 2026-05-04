export const METHOD_TYPES = [
  { value: '5×5',                label: '5×5' },
  { value: 'BURNS',              label: 'Burns' },
  { value: 'WESTSIDE_CONJUGATE', label: 'Westside' },
  { value: 'BULLDOZER',          label: 'Bulldozer' },
  { value: 'MODERATE_VOLUME',    label: 'Moderate' },
  { value: 'HIGH_REP_20_REP_SQUAT', label: 'High Reps' },
  { value: 'MAX_OT',             label: 'Max-OT' },
  { value: 'GIRONDA_8X8',        label: '8×8' },
  { value: 'TEN_BY_THREE',       label: '10×3' },
  { value: 'YATES_HIGH_INTENSITY', label: 'Yates' },
] as const;

export type MethodTypeValue = (typeof METHOD_TYPES)[number]['value'];
export type MethodTypeLabel = (typeof METHOD_TYPES)[number]['label'];

// Lookup helpers
export const METHOD_LABEL_MAP = Object.fromEntries(
  METHOD_TYPES.map((m) => [m.value, m.label]),
) as Record<MethodTypeValue, MethodTypeLabel>;

export const METHOD_VALUE_SET = new Set(METHOD_TYPES.map((m) => m.value));
