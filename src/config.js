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

export const POLL_INTERVAL = readEnvironmentVariable('POLL_INTERVAL', {defaultValue: 10000, format: v => Number(v)});

export const POLL_CHANGE_TIMESTAMP = readEnvironmentVariable('POLL_CHANGE_TIMESTAMP', {defaultValue: ''});
export const CHANGE_TIMESTAMP_FILE = readEnvironmentVariable('CHANGE_TIMESTAMP_FILE', {defaultValue: '.poll-change-timestamp.json'});
export const FAILED_HARVEST_FILE = readEnvironmentVariable('FAILED_HARVEST_FILE', {defaultValue: '.failed-harvest-log.json'});

export const HARVESTING_API_URL = readEnvironmentVariable('HARVESTING_API_URL', {defaultValue: 'http://tampub.uta.fi/oai/request'});
export const HARVESTING_API_METADATA = readEnvironmentVariable('HARVESTING_API_METADATA', {defaultValue: 'kk'});
export const HARVESTING_API_FILTER = readEnvironmentVariable('HARVESTING_API_FILTER', {defaultValue: '@qualifier="issued" and @value>"2016"'});
export const HARVESTING_API_FILTER_ISBN = parseBoolean(readEnvironmentVariable('HARVESTING_API_FILTER_ISBN', {defaultValue: 'true'}));
export const HARVESTING_API_FILTER_NAMESPACE = readEnvironmentVariable('HARVESTING_API_FILTER_NAMESPACE', {defaultValue: 'http://kk/1.0'});
