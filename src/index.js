/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (C) 2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-harvester-publication-archives
*
* melinda-record-import-harvester-publication-archives program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-harvester-publication-archives is distributed in the hope that it will be useful,
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

'use strict';

import {Harvester} from '@natlibfi/melinda-record-import-commons';
import createHarvestCallback from './harvest';

const {startHarvester} = Harvester;

import {
	HARVESTING_API_URL, HARVESTING_API_METADATA, HARVESTING_API_FILTER,
	HARVESTING_API_FILTER_NAMESPACE, POLL_INTERVAL,
	POLL_CHANGE_TIMESTAMP, CHANGE_TIMESTAMP_FILE
} from './config';

startHarvester(async ({recordsCallback}) => {
	console.log('MELINDA_API_URL', HARVESTING_API_URL);
	return createHarvestCallback({
		recordsCallback,
		harvestURL: HARVESTING_API_URL,
		harvestMetadata: HARVESTING_API_METADATA,
		harvestFilter: HARVESTING_API_FILTER,
		harvestFilterNamespace: HARVESTING_API_FILTER_NAMESPACE,
		pollInterval: POLL_INTERVAL,
		pollChangeTimestamp: POLL_CHANGE_TIMESTAMP,
		changeTimestampFile: CHANGE_TIMESTAMP_FILE
	});
});
