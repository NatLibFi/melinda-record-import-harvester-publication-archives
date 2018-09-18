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
// Haravointi tapahtuu [OAI-PMH -rajapinnalla|https://www.openarchives.org/OAI/openarchivesprotocol.html].
// Kyseessä on HTTP-rajapinta, jolla tietueita haetaan aikaleiman perusteella. Rajapinnan aikaleimarajaus ei
// kuitenkaan riitä setin kunnolliseen rajaukseen vaan varsinainen rajaus tehdään tietueen **date"qualifier="available** -kentän perusteella.

// > Tietueita haravoidaan rajapinnan **ListRecords** kutsulla. Vastaukseen ei välttämättä sisälly kaikki osuvat
// tietueet vaan loput täytyy hakea **resumptionToken** parametrin avulla.

// > Haravointisovelluksen on tarkoitus olla päällä jatkuvasti ja sen pitää tallentaa edellisen haun aikaleima
// tiedostoon, jotta haravointia voidaan jatkaa oikeasta kohdasta uudelleenkäynnistyksen jälkeen.

// > Vastaavanlainen toteutus on tehty [Helmetille|https://github.com/NatLibFi/melinda-record-import-harvesterhelmet].

// > [DC -> MARC -mäppäys|https://www.kiwi.fi/x/D43VBQ]

// > [Haravoitavat kohteet|https://www.kiwi.fi/display/alephkvp/Melindaa+varten+haravoitavien+julkaisuarkistojen+OAI-rajapinnat]

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

//Development XML
import {shortValidXML, shortExtraXML} from './dummyXML.js';

run();

async function run() {
	Utils.registerSignalHandlers();
	Utils.checkEnv([
		// 'MELINDA_API_KEY',
		// 'MELINDA_API_SECRET',
		'MELINDA_API_URL',
		'RECORD_IMPORT_API_URL',
		'RECORD_IMPORT_API_USERNAME',
		'RECORD_IMPORT_API_PASSWORD',
		'RECORD_IMPORT_API_PROFILE'
	]);

	const RECORDS_FETCH_LIMIT = 1000;
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

	async function processRecords(authorizationToken, pollChangeTime) {
		pollChangeTime = pollChangeTime || getPollChangeTime();
		// AuthorizationToken = await validateAuthorizationToken(authorizationToken); // eslint-disable-line require-atomic-updates

		logger.log('debug', `Fetching records created after ${pollChangeTime.format()}`);

		const {timeBeforeFetching, records} = await fetchRecords();

		if (records.length > 0) {
			await sendRecords(records);
		}

		logger.log('debug', `Waiting ${POLL_INTERVAL / 1000} seconds before polling again`);
		await setTimeoutPromise(POLL_INTERVAL);

		writePollChangeTimestamp(timeBeforeFetching);

		// Return processRecords(authorizationToken, timeBeforeFetching.add(1, 'seconds'));

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
			fs.writeFileSync(CHANGE_TIMESTAMP_FILE, JSON.stringify({
				timestamp: time.format()
			}));
		}

		// Async function validateAuthorizationToken(token) {
		// 	if (token) {
		// 		const response = await fetch(`${process.env.MELINDA_API_URL}/info/token`);
		// 		if (response.status === HttpStatusCodes.OK) {
		// 			return token;
		// 		}
		// 	}

		// 	return authenticate();

		// 	async function authenticate() {
		// 		const credentials = `${process.env.MELINDA_API_KEY}:${process.env.MELINDA_API_SECRET}`;
		// 		const response = await fetch(`${process.env.MELINDA_API_URL}/token`, {method: 'POST', headers: {
		// 			Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`
		// 		}});

		// 		const body = await response.json();
		// 		return body.access_token;
		// 	}
		// }
		async function fetchRecords(token, records = [], timeBeforeFetching) {
			const url = new URL(`http://tampub.uta.fi/oai/request`);

			if(token){
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					resumptionToken: token
				});
			}else{
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					from: '2016-03-20T20:30:00Z',
					metadataPrefix: 'kk'
				});
			}

			logger.log('debug', url.toString());

			timeBeforeFetching = records.length > 0 ? timeBeforeFetching : moment();

			var response = await fetch(url.toString());
 
			if (response.status === HttpStatusCodes.OK) {
				var result = null;
				var validXML = null;
				if( process.env.TEST === 'true' ){
					result = shortExtraXML;
				}else{
					result = await response.text();
				}
	
				var patterns = ['x:metadata[not(x:field[@qualifier="available"])]/../..'];
				var namespaces = {//title[@lang='en']	
					x: 'http://kk/1.0',
				};
	
				filterxml(result, patterns, namespaces, function (err, xmlOut) {
					if (err) { throw err; }
					// console.log("xmlOut: ", xmlOut);
					validXML = xmlOut;
				});

				// console.log("---------------------------------------");
				// console.log("validXML: ", validXML, typeof(validXML))
				var resumptionToken = null;
				parser.parseString(validXML, function (err, result) {
					try{
						var amountRecods = result['OAI-PMH'].ListRecords[0].record.length;
						resumptionToken = result['OAI-PMH'].ListRecords[0].resumptionToken;
						console.log("length: ", amountRecods);
						logger.log('debug', `Retrieved ${amountRecods} records`);
						console.log("Resumption: ", resumptionToken)
					}catch(e){
						console.log("Failed something in XML parsing: ", e);
						logger.err(e);
					}
				});

				
				if (resumptionToken) {
					return fetchRecords(resumptionToken[0]['_'], [], timeBeforeFetching);
				}

				// console.log("Result: ", result);
				return {records: records.concat(result.entries), timeBeforeFetching};
			}

			if (response.status === HttpStatusCodes.NOT_FOUND) {
				logger.log('debug', 'No records found');
				return {records, timeBeforeFetching};
			}

			throw new Error(`Received HTTP ${response.status} ${response.statusText}`);

			function generateTimespan() {
				return `[${pollChangeTime.format()},]`;
			}
		}

		// Function filterRecords(record) {
		// 	record.varFields.array.forEach(element => {
		// 		console.log('E: ', element);
		// 	});
		// 	// Const leader = record.varFields.find(f => f.fieldTag === '_');

		// 	// if (leader && !['c', 'd', 'j'].includes(leader.content)) {
		// 	// 	if (record.varFields.some(check09)) {
		// 	// 		return false;
		// 	// 	}

		// 	// 	const f007 = record.varFields.find(f => f.marcTag === '007');

		// 	// 	if (!f007 && MATERIAL_TYPES_DROP_PATTERN.test(record.materialType.code)) {
		// 	// 		return false;
		// 	// 	}

		// 	// 	return true;
		// 	// }

		// 	// function check09(field) {
		// 	// 	return /^09[12345]$/.test(field.marcTag) && field.subfields.find(sf => {
		// 	// 		return /^78/.test(sf.content);
		// 	// 	});
		// 	// }
		// }

		async function sendRecords(records) { // eslint-disable-line require-await
			fs.writeFileSync('fetched.json', JSON.stringify(records, undefined, 2));
			// Use Record import API to create Blobs
			logger.log('info', `Created new blob x containing ${records.length} records`);
		}
	}
}


// var patterns = ['x:metadata[not(x:field[@qualifier="available"])]'];
// var patterns = ['x:metadata/x:field[@qualifier="available"]/../../..']; //Removes all records containing qualifier="available"
// var patterns = ['x:field[@qualifier="available"]']; //Removes single field