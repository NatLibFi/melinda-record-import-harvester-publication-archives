/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (C) 2018 University Of Helsinki (The National Library Of Finland)
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

import fs from 'fs';
import xml2js from 'xml2js';
import path from 'path';
import {URL, URLSearchParams} from 'url';
import moment from 'moment';
import fetch from 'node-fetch';
import HttpStatusCodes from 'http-status-codes';
import nodeUtils from 'util';
import {CommonUtils as Utils} from '@natlibfi/melinda-record-import-commons';
import filterxml from 'filterxml';

run();

async function run() {
	Utils.registerSignalHandlers();
	Utils.checkEnv([
		// 'MELINDA_API_KEY',
		// 'MELINDA_API_SECRET',
		'HARVESTING_API_URL',
		'HARVESTING_API_METADATA',
		'HARVESTING_API_FILTER',
		'HARVESTING_API_FILTER_NAMESPACE',
		// 'RECORD_IMPORT_API_URL',
		// 'RECORD_IMPORT_API_USERNAME',
		// 'RECORD_IMPORT_API_PASSWORD',
		// 'RECORD_IMPORT_API_PROFILE'
	]);

	const POLL_INTERVAL = process.env.POLL_INTERVAL || 1800000; // Default is 30 minutes
	const CHANGE_TIMESTAMP_FILE = process.env.POLL_CHANGE_TIMESTAMP_FILE || path.resolve(__dirname, '..', '.poll-change-timestamp.json');
	const setTimeoutPromise = nodeUtils.promisify(setTimeout);

	const logger = Utils.createLogger();
	const stopHealthCheckService = Utils.startHealthCheckService(process.env.HEALTH_CHECK_PORT);
	const parser = new xml2js.Parser();
	try {
		logger.log('info', 'Starting melinda-record-import-harvester-publication-archives');
		await processRecords();
		stopHealthCheckService();
		process.exit();
	} catch (err) {
		stopHealthCheckService();
		logger.error(err);
		process.exit(-1);
	}

	async function processRecords(pollChangeTime) {
		pollChangeTime = pollChangeTime || getPollChangeTime();
		logger.log('debug', `Fetching records created after ${pollChangeTime.format()}`);

		const timeBeforeFetching = moment();
		await fetchRecords(0, null, [], pollChangeTime);

		writePollChangeTimestamp(timeBeforeFetching);

		logger.log('debug', `--- Waiting ${POLL_INTERVAL / 1000} seconds before polling again ---`);
		await setTimeoutPromise(POLL_INTERVAL);

		return processRecords(timeBeforeFetching);

		////////////////////////
		// Supporting functions
		function getPollChangeTime() {
			if (fs.existsSync(CHANGE_TIMESTAMP_FILE)) {
				const data = JSON.parse(fs.readFileSync(CHANGE_TIMESTAMP_FILE, 'utf8'));
				return moment(data.timestamp);
			}

			if (process.env.POLL_CHANGE_TIMESTAMP) {
				return moment(process.env.POLL_CHANGE_TIMESTAMP);
			}

			return moment();
		}

		function writePollChangeTimestamp(time) {
			const timestamp = time.format();
			logger.log('debug', `Writing timestamp ${timestamp}`);

			fs.writeFileSync(CHANGE_TIMESTAMP_FILE, JSON.stringify({
				timestamp: timestamp
			}));
		}

		async function fetchRecords(index, token, oldRecords = [], timeBeforeFetching) {
			const url = new URL(process.env.HARVESTING_API_URL);

			if(token){
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					resumptionToken: token
				});
			}else{
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					from: getPollChangeTime().utc().format(),
					metadataPrefix: process.env.HARVESTING_API_METADATA
				});
			}

			logger.log('debug', url.toString());
			
			var response = await fetch(url.toString());
 
			if (response.status === HttpStatusCodes.OK) {
				const result = await response.text();
				var validXML = null;

				//Filter out all records that do not have example '@qualifier="available"' in some field 
				//or does not have two fields '@qualifier="issued" and @value>"2018"'
				const patterns = ['x:metadata[not(x:field[' + process.env.HARVESTING_API_FILTER + '])]/../..'];
				const namespaces = {
					x: process.env.HARVESTING_API_FILTER_NAMESPACE,
				};
				filterxml(result, patterns, namespaces, function (err, xmlOut, data) {
					if (err) { throw err; }
					validXML = xmlOut;
				});

				//Check out new records and save possible resumption token
				var newRecords = [];
				var resumptionToken = null;
				var amountRecords = 0;
				parser.parseString(validXML, function (err, parsed) {
					try{
						if( parsed['OAI-PMH'].ListRecords && parsed['OAI-PMH'].ListRecords[0]){
							// //Check how many elements are excluded
							// parser.parseString(result, function (err, res) {
							// 	console.log("Excluded: ", res['OAI-PMH'].ListRecords[0].record.length - parsed['OAI-PMH'].ListRecords[0].record.length);
							// });

							//record can be empty because of filtering
							if(parsed['OAI-PMH'].ListRecords[0].record){
								newRecords = parsed['OAI-PMH'].ListRecords[0].record;
								amountRecords = parsed['OAI-PMH'].ListRecords[0].record.length;
							}
							logger.log('debug', `Retrieved ${amountRecords} valid records`);

							resumptionToken = parsed['OAI-PMH'].ListRecords[0].resumptionToken;
							logger.log('debug', `Resumption: ${JSON.stringify(resumptionToken)}`)
						}
					}catch(e){
						logger.error(e);
					}
				});

				//Combine old and new records
				const records = oldRecords.concat(newRecords);

				// If more records to be fetched from endpoint do so with resumption token
				if (resumptionToken && resumptionToken[0] && resumptionToken[0]['_']) {
					return fetchRecords(index, resumptionToken[0]['_'], records, timeBeforeFetching);
				
				// If not: send (if any to send) and return
				}else{
					if(records.length > 0 ){
						logger.log('debug', `Total ${records.length} valid records found, sending`);
						sendRecords(records);
					}else{
						logger.log('debug', `No records found`);
					}
					return;
				}
			}

			if (response.status === HttpStatusCodes.NOT_FOUND) {
				return;
			}

			throw new Error(`Received HTTP ${response.status} ${response.statusText}`);
		}

		async function sendRecords(records) { // eslint-disable-line require-await
			fs.writeFileSync('fetched.json', JSON.stringify(records, undefined, 2));
			// Use Record import API to create Blobs
			logger.log('info', `*Created new temp blob to file *fetched.json* containing ${records.length} records`);
		}
	}
}

//Filter dummys for testing filtering
// //Development XML
// import {shortValidXML, shortExtraXML} from './dummyXML.js';

// var result = null;
// var validXML = null;
// if( process.env.TEST === 'true' ){
// 	result = shortExtraXML;
// }else{
// 	result = await response.text();
// }