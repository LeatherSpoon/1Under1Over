import { readConfig } from './config.js';
import { createApiServer } from './server.js';
import { createProgressionRepository } from './repositories/progressionRepository.js';
import { createTransactionService } from './services/transactionService.js';

const config = readConfig();
const db = createProgressionRepository(config);
const transactionService = createTransactionService(db);
const telemetryService = {
  saveSession: report => db.saveTelemetrySession(report),
  saveEvent: event => db.saveTelemetryEvent(event)
};

const server = createApiServer({ db, transactionService, telemetryService });

server.listen(config.port, () => {
  console.log(`Processing Power API listening on http://localhost:${config.port}`);
});
