/** Canonical board labels for admin uploads — prevents duplicate subjects from lowercase fbise / punjab. */
export const CATALOG_BOARD_OPTIONS = ['FBISE', 'Punjab Board'] as const;
export type CatalogBoardOption = (typeof CATALOG_BOARD_OPTIONS)[number];
