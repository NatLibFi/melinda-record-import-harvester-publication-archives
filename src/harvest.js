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

import fs from 'fs';
import {URL, URLSearchParams} from 'url';
import moment from 'moment';
import fetch from 'node-fetch';
import HttpStatusCodes from 'http-status-codes';
import nodeUtils from 'util';
import {Utils} from '@natlibfi/melinda-commons';

import xml2js from 'xml2js';
import filterxml from 'filterxml';

const {createLogger} = Utils;

export default async function ({recordsCallback, harvestURL, harvestMetadata, harvestFilter, harvestFilterNamespace, pollInterval, pollChangeTimestamp, changeTimestampFile, earliestCatalogTime = moment(), onlyOnce = false}) {
	const logger = createLogger();
	const parser = new xml2js.Parser();
	var failedQueries = 0;

	return process();

	async function process({pollChangeTime} = {}) {
		const setTimeoutPromise = nodeUtils.promisify(setTimeout);

		pollChangeTime = pollChangeTime || getPollChangeTime();

		const timeBeforeFetching = moment();

		logger.log('debug', `Fetching records updated between ${pollChangeTime.format()} - ${timeBeforeFetching.format()}`);
		await harvest(null, [], pollChangeTime);

		if (!onlyOnce) {
			logger.log('debug', `Waiting ${pollInterval / 1000} seconds before polling again`);
			await setTimeoutPromise(pollInterval);
			return process({pollChangeTime: timeBeforeFetching.add(1, 'seconds')});
		}

		function getPollChangeTime() {
			if (fs.existsSync(changeTimestampFile)) {
				const data = JSON.parse(fs.readFileSync(changeTimestampFile, 'utf8'));
				return moment(data.timestamp);
			}

			if (pollChangeTimestamp) {
				return moment(pollChangeTimestamp);
			}

			return moment();
		}

		//ListRecords can only fetch 100 records at the time.
		//Each cycle concats new records to old records and passes possible resumption token to new cycle
		async function harvest(token, oldRecords = []) {
			const url = new URL(harvestURL);

			if (token) {
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					resumptionToken: token
				});
			} else {
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					from: getPollChangeTime().utc().format(),
					metadataPrefix: harvestMetadata
				});
			}
			try{
				var response = await fetch(url.toString());
			}catch(e){
				logger.log('warn', `Query failed: ${e}`);
				failedQueries++;
				if(failedQueries >= 5){
					logger.log('error', `5 failed queries, quitting`);
					return;
				}
				return harvest(token, oldRecords)
			}

			failedQueries = 0;

			if (response.status === HttpStatusCodes.OK) {
				const result = await response.text();
				var validXMLTemp = null;
				var validXML = null;

				// Filter out all records that do not have example '@qualifier="available"' in some field (or does not have two fields '@qualifier="issued" and @value>"2018"')
				// Filter out all records with header that have status="deleted"
				var patterns = ['x:metadata[not(x:field[' + harvestFilter + '])]/../..'];
				filterxml(result, patterns, {x: harvestFilterNamespace}, (err, xmlOut, data) => {
					if (err) {
						throw err;
					}

					validXMLTemp = xmlOut;
				});

				// Filter out all records with header that have status="deleted"
				patterns = ['x:header[@status="deleted"]/..'];
				filterxml(validXMLTemp, patterns, {x: 'http://www.openarchives.org/OAI/2.0/'}, (err, xmlOut, data) => {
					if (err) {
						throw err;
					}

					validXML = xmlOut;
				});

				// Check out new records and save possible resumption token
				var newRecords = [];
				var resumptionToken = null;
				var amountRecords = 0;
				parser.parseString(validXML, (err, parsed) => {
					try {
						// record can be empty because of filtering
						if (parsed['OAI-PMH'].ListRecords && parsed['OAI-PMH'].ListRecords[0]) {
							if (parsed['OAI-PMH'].ListRecords[0].record) {
								newRecords = parsed['OAI-PMH'].ListRecords[0].record;
								amountRecords = parsed['OAI-PMH'].ListRecords[0].record.length;
							}

							logger.log('debug', `Retrieved ${amountRecords} valid records`);

							resumptionToken = parsed['OAI-PMH'].ListRecords[0].resumptionToken;
							logger.log('debug', `Resumption: ${JSON.stringify(resumptionToken)}`);
						}
					} catch (e) {
						logger.error(e);
					}
				});

				// Combine old and new records
				const records = oldRecords.concat(newRecords);

				// If more records to be fetched from endpoint do so with resumption token
				if (resumptionToken && resumptionToken[0] && resumptionToken[0]['_']) {
					logger.log('debug', `New harvest with token ${resumptionToken[0]['_']}`);
					return harvest(resumptionToken[0]['_'], records);

				// If not: send (if any to send) and return
				}else{
					if(records.length > 0 ){
						logger.log('debug', `Sending: total ${records.length} valid records`);
						try{
							//fs.writeFileSync('fetched.json', JSON.stringify(records, undefined, 2));
							await recordsCallback(records);
						}catch(e){
							logger.log('error', `Error in sending blob ${e}, timestamp not updated`);
							return; //Bail out without updating PollChangeTimestamp
						}
					}else{
						logger.log('debug', `Ending: no valid records found`);
					}
					//All went well, update timestamp
					writePollChangeTimestamp(timeBeforeFetching);
					return;
				}
			}else{
				logger.log('error', 'Response not ok, status: ', response.status);
				const result = await response.text();
				logger.log('error', result);

				throw new Error(`Received HTTP ${response.status} ${response.statusText}`);
			}
		}

		function writePollChangeTimestamp(time) {
			fs.writeFileSync(changeTimestampFile, JSON.stringify({
				timestamp: time.format()
			}));
		}
	}
}
