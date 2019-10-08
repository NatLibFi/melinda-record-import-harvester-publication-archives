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

export default async function ({recordsCallback, harvestURL, harvestMetadata, harvestFilter, harvestFilterISBN, harvestFilterNamespace, pollInterval, pollChangeTimestamp, changeTimestampFile, failedHarvestFile, onlyOnce = false}) {
	const logger = createLogger();
	const parser = new xml2js.Parser();
	let originalUrl = '';

	return process();

	async function process({pollChangeTime} = {}) {
		const setTimeoutPromise = nodeUtils.promisify(setTimeout);

		pollChangeTime = pollChangeTime || getPollChangeTime();

		const timeBeforeFetching = moment();

		logger.log('debug', `Fetching records updated between ${pollChangeTime.format()} - ${timeBeforeFetching.format()}`);
		try {
			await harvest(null);
		} catch (e) {
			fs.writeFileSync(failedHarvestFile, e); // If failure happens on n:th cycle (resumption) previous cycles (n-1) are already sent. Save data of harvest to file just in case used later to restart harvesting.
			throw e;
		}

		if (!onlyOnce) {
			logger.log('debug', `Waiting ${pollInterval / 1000} seconds before polling again`);
			await setTimeoutPromise(pollInterval);
			writePollChangeTimestamp(timeBeforeFetching);
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

		function writePollChangeTimestamp(time) {
			fs.writeFileSync(changeTimestampFile, JSON.stringify({
				timestamp: time.format()
			}));
		}

		// ListRecords can only fetch 100 records at the time.
		// Each cycle fetches max 100 records, filters records, passes them to callback and passes possible resumption token to new cycle
		async function harvest(token) {
			const url = new URL(harvestURL);
			url.searchParams.set('verb', 'ListRecords');
			if (token) {
				url.searchParams.set('resumptionToken', token);
			} else {
				url.searchParams.set('from', getPollChangeTime().utc().format());
				url.searchParams.set('metadataPrefix', harvestMetadata);
	
				originalUrl = url.toString();
			}

			const response = await fetch(url.toString());

			if (response.status === HttpStatusCodes.OK) {
				await handleResponseOk(response);
			} else {
				const resBody = await response.text();
				throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, responseStatus: response.status, responseText: response.statusText, responseBody: resBody}, null, 2));
			}
			
			// Handle valid response
			async function handleResponseOk(){
				const result = await response.text()
				let validXMLTemp = null;
				let validXML = null;

				// Filter out all records that do not have example '@qualifier="available"' in some field (or does not have two fields '@qualifier="issued" and @value>"2018"')
				let patterns = [];
				if (harvestFilterISBN === true) {
					patterns = ['x:metadata[not(x:field[' + harvestFilter + ']) or not(x:field[@qualifier="isbn"])]/../..']; // Also remove records without ISBN
				} else {
					patterns = ['x:metadata[not(x:field[' + harvestFilter + '])]/../..'];
				}

				filterxml(result, patterns, {x: harvestFilterNamespace}, (err, xmlOut) => {
					if (err) {
						logger.log('warn', `Records filtering deleted failed: ${err}`);
						throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, originalError: err}, null, 2));
					}

					validXMLTemp = xmlOut;
				});

				// Filter out all records with header that have status="deleted"
				// This has to be done in different filter as header namespace differs from record filtering
				patterns = ['x:header[@status="deleted"]/..'];
				filterxml(validXMLTemp, patterns, {x: 'http://www.openarchives.org/OAI/2.0/'}, (err, xmlOut) => {
					if (err) {
						logger.log('warn', `Records filtering deleted failed: ${err}`);
						throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, originalError: err}, null, 2));
					}

					validXML = xmlOut;
				});

				// Check out new records and save possible resumption token
				let records = [];
				let amountRecords = 0;
				let resumptionToken = null;

				parser.parseString(validXML, (err, parsed) => {
					if (err) {
						logger.log('warn', `Record XML parsing failed: ${err}`);
						throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, originalError: err}, null, 2));
					}

					try {
						// Record can be empty because of filtering
						if (parsed['OAI-PMH'].ListRecords && parsed['OAI-PMH'].ListRecords[0]) {
							if (parsed['OAI-PMH'].ListRecords[0].record) {
								records = parsed['OAI-PMH'].ListRecords[0].record;
								amountRecords = parsed['OAI-PMH'].ListRecords[0].record.length;
							}

							logger.log('debug', `Retrieved ${amountRecords} valid records from ${url.toString()}`);

							resumptionToken = parsed['OAI-PMH'].ListRecords[0].resumptionToken;
							logger.log('debug', `Resumption: ${JSON.stringify(resumptionToken)}`);
						}
					} catch (e) {
						logger.log('warn', `Record JSON parsing failed: ${e}`);
						throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, originalError: e}, null, 2));
					}
				});

				// If valid records, send to saving
				if (records.length > 0) {
					try {
						await recordsCallback(records);
					} catch (e) {
						logger.log('warn', `Record callback failed: ${e}`);
						throw new Error(JSON.stringify({time: moment(), query: url.toString(), queryOriginal: originalUrl, originalError: e}, null, 2));
					}
				} else if (records.length === 0) {
					logger.log('debug', 'No records found');
				}

				// If more records to be fetched from endpoint do so with resumption token
				if (resumptionToken && resumptionToken[0] && resumptionToken[0]._) {
					return harvest(resumptionToken[0]._);
				}
			}
		}
	}
}
