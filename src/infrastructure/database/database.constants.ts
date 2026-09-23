// The TypeORM CLI runs these files through ts-node (so the glob must match .ts),
// while the container runs the compiled output (where it must match .js).
export const SOURCE_EXT = __filename.endsWith('.ts') ? 'ts' : 'js';
