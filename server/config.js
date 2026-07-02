export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/processing_power',
    defaultPlayerId: env.DEFAULT_PLAYER_ID || 'local-player',
    defaultPlayerName: env.DEFAULT_PLAYER_NAME || 'Local Player'
  };
}
