/**
 * Tool name only, in a leaf module: the portable projection and the tools
 * import each other through the composition module, and a name constant must
 * not create a cycle.
 */
export const COMPOSE_TOOL = 'ui_compose';
