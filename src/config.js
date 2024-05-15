import {Utils} from '@natlibfi/melinda-commons';

const {readEnvironmentVariable, parseBoolean} = Utils;

export const name = 'melinda-record-import-harvester-publication-archieves';
// Not configurable 'cause no support in code for other formats
export const metadataPrefix = 'kk';

export const pollInterval = readEnvironmentVariable('POLL_INTERVAL', {defaultValue: 10000, format: v => Number(v)});
export const pollChangeTimestamp = readEnvironmentVariable('POLL_CHANGE_TIMESTAMP', {defaultValue: ''});
export const changeTimestampFile = readEnvironmentVariable('CHANGE_TIMESTAMP_FILE', {defaultValue: '.poll-change-timestamp.json'});

export const recordImportApiUrl = readEnvironmentVariable('API_URL');
export const recordImportApiUsername = readEnvironmentVariable('API_USERNAME');
export const recordImportApiPassword = readEnvironmentVariable('API_PASSWORD');

export const harvestingApiUrl = readEnvironmentVariable('HARVESTING_API_URL');

export const filterIsbnOnly = readEnvironmentVariable('FILTER_ISBN_ONLY', {defaultValue: false, format: parseBoolean});
export const filterIssuedYear = readEnvironmentVariable('FILTER_ISSUED_YEAR', {defaultValue: 0, format: v => Number(v)});
