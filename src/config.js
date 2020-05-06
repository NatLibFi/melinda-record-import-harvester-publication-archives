/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Shared modules for microservices of Melinda record batch import system
*
* Copyright (C) 2018-2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-commons
*
* melinda-record-import-commons program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-commons is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import {Utils} from '@natlibfi/melinda-commons';

const {readEnvironmentVariable, parseBoolean} = Utils;

export const name = 'melinda-record-import-harvester-publication-archieves';
// Not configurable 'cause no support in code for other formats
export const metadataPrefix = 'kk';

export const pollInterval = readEnvironmentVariable('POLL_INTERVAL', {defaultValue: 10000, format: v => Number(v)});
export const pollChangeTimestamp = readEnvironmentVariable('POLL_CHANGE_TIMESTAMP', {defaultValue: ''});
export const changeTimestampFile = readEnvironmentVariable('CHANGE_TIMESTAMP_FILE', {defaultValue: '.poll-change-timestamp.json'});

export const recordImportApiUrl = readEnvironmentVariable('RECORD_IMPORT_API_URL');
export const recordImportApiUsername = readEnvironmentVariable('RECORD_IMPORT_API_USERNAME');
export const recordImportApiPassword = readEnvironmentVariable('RECORD_IMPORT_API_PASSWORD');

export const harvestingApiUrl = readEnvironmentVariable('HARVESTING_API_URL');

export const filterIsbnOnly = readEnvironmentVariable('FILTER_ISBN_ONLY', {defaultValue: false, format: parseBoolean});
export const filterIssuedYear = readEnvironmentVariable('FILTER_ISSUED_YEAR', {defaultValue: 0, format: v => Number(v)});
