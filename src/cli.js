/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (c) 2018-2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-harvester-helmet
*
* melinda-record-import-harvester-helmet program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-harvester-helmet is distributed in the hope that it will be useful,
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

/* eslint-disable import/default */

import startHarvesting from './harvest';
import {Harvester} from '@natlibfi/melinda-record-import-commons';
import {
	HARVESTING_API_URL, HARVESTING_API_METADATA, HARVESTING_API_FILTER,
	HARVESTING_API_FILTER_ISBN, HARVESTING_API_FILTER_NAMESPACE,
	POLL_INTERVAL, POLL_CHANGE_TIMESTAMP, CHANGE_TIMESTAMP_FILE, FAILED_HARVEST_FILE
} from './config';
import fs from 'fs';
import yargs from 'yargs';

// Define concat CLI-script
let argv = yargs.command('concat [directory]', 'Combining files', yargs => {
	yargs
		.positional('directory', {
			describe: 'directory to read from',
			default: 'out'
		});
}).argv;

// If concat command run, run concatting code
if (argv.directory) {
	concatFolder(argv.directory);

// If not concat code, use default functionality, that takes positional arguments
} else {
	const {runCLI} = Harvester;

	runCLI({name: 'melinda-record-import-harvester-publication-archieves', callback: async callback => {
		await startHarvesting({
			harvestURL: HARVESTING_API_URL,
			harvestMetadata: HARVESTING_API_METADATA,
			harvestFilter: HARVESTING_API_FILTER,
			harvestFilterISBN: HARVESTING_API_FILTER_ISBN,
			harvestFilterNamespace: HARVESTING_API_FILTER_NAMESPACE,
			pollInterval: POLL_INTERVAL,
			pollChangeTimestamp: POLL_CHANGE_TIMESTAMP,
			changeTimestampFile: CHANGE_TIMESTAMP_FILE,
			failedHarvestFile: FAILED_HARVEST_FILE,
			onlyOnce: true,
			recordsCallback: async records => {
				await callback(JSON.stringify(records, undefined, 2));
			}
		});

		// Default functionali provided with extra 'concat' option
		if (argv._[1] && argv._[1] === 'concat') {
			concatFolder(argv._[0]);
		}
	}});
}

// Read individual files from provided folder and combine those to single 'All.json' file
function concatFolder(folder) {
	if (fs.existsSync('./' + folder)) {
		let files = fs.readdirSync('./' + folder).map(s => './' + folder + '/' + s);
		let combinedRecords = [].concat(...files.map(file => {
			return JSON.parse(fs.readFileSync(file));
		}));
		if (combinedRecords.length > 0) {
			fs.writeFileSync(folder + '/All.json', JSON.stringify(combinedRecords, null, 2));
		} else {
			console.log('Nothing to save');
		}
	} else {
		console.log('Folder ' + folder + ' does not exist');
	}
}
